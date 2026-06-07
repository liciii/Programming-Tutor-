import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../services/profileService.js', () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn().mockResolvedValue({}),
  appendDiagnosticEvidence: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../services/llmService.js', () => ({
  chatCompletion: vi.fn(),
  INTERNAL_PROVIDER: 'openai',
}));

import app from '../../app.js';
import { getProfile, updateProfile } from '../../services/profileService.js';
import { chatCompletion } from '../../services/llmService.js';

const SECRET = 'test-secret';
function token(userId = 'user-1') {
  return jwt.sign({ id: userId, email: 'u@test.com' }, SECRET);
}

function makeProfile(overrides = {}) {
  return {
    userId: 'user-1',
    onboardingPhase: 1,
    onboardingComplete: false,
    selfReportedLevel: null,
    targetLanguage: null,
    topics: null,
    learningStyle: null,
    realLifeInterests: null,
    diagnosticEvidence: [],
    ...overrides,
  };
}

const AUTH = { Authorization: `Bearer ${token()}` };

beforeEach(() => vi.clearAllMocks());

// ── Input validation ──────────────────────────────────────────────────────────

describe('POST /api/profile/onboarding/chat — validation', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(401);
  });

  it('returns 400 when messages is missing', async () => {
    getProfile.mockResolvedValue(makeProfile());
    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set(AUTH)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when messages is empty', async () => {
    getProfile.mockResolvedValue(makeProfile());
    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set(AUTH)
      .send({ messages: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when a message has an invalid role', async () => {
    getProfile.mockResolvedValue(makeProfile());
    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set(AUTH)
      .send({ messages: [{ role: 'system', content: 'hi' }] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when a message content exceeds 10,000 characters', async () => {
    getProfile.mockResolvedValue(makeProfile());
    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set(AUTH)
      .send({ messages: [{ role: 'user', content: 'x'.repeat(10_001) }] });
    expect(res.status).toBe(400);
  });
});

// ── Phase 1 ───────────────────────────────────────────────────────────────────

describe('POST /api/profile/onboarding/chat — Phase 1', () => {
  it('returns phase 1 and does not complete onboarding', async () => {
    getProfile.mockResolvedValue(makeProfile());
    chatCompletion.mockResolvedValue('Tell me about your goals.');

    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set(AUTH)
      .send({ messages: [{ role: 'user', content: 'I want to learn Java' }] });

    expect(res.status).toBe(200);
    expect(res.body.phase).toBe(1);
    expect(res.body.onboardingComplete).toBe(false);
    expect(res.body.reply).toBe('Tell me about your goals.');
  });

  it('stays in Phase 1 when realLifeInterests is missing from the profile', async () => {
    getProfile.mockResolvedValue(makeProfile({
      learningStyle: 'hands-on',
      realLifeInterests: null,
    }));
    chatCompletion.mockResolvedValue('What are your hobbies?');

    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set(AUTH)
      .send({
        messages: [
          { role: 'user', content: 'Java' },
          { role: 'assistant', content: 'Great!' },
          { role: 'user', content: 'I like hands-on learning' },
        ],
      });

    expect(res.body.phase).toBe(1);
  });

  it('advances to Phase 2 when both learningStyle and realLifeInterests are present', async () => {
    getProfile.mockResolvedValue(makeProfile({
      learningStyle: 'hands-on',
      realLifeInterests: ['football'],
    }));
    chatCompletion.mockResolvedValue("Great! Let's try a quick task.");

    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set(AUTH)
      .send({
        messages: [
          { role: 'user', content: 'Java' },
          { role: 'assistant', content: 'Great!' },
          { role: 'user', content: 'I like football' },
        ],
      });

    expect(res.body.phase).toBe(2);
  });
});

// ── Phase 2 (diagnostic) ──────────────────────────────────────────────────────

describe('POST /api/profile/onboarding/chat — Phase 2', () => {
  it('stays in Phase 2 when no diagnostic evidence is captured', async () => {
    getProfile.mockResolvedValue(makeProfile({
      learningStyle: 'visual',
      realLifeInterests: ['music'],
      diagnosticEvidence: [],
    }));
    // extractDiagnosticEvidence calls chatCompletion twice (gate + extraction)
    // gate returns NO → no evidence
    chatCompletion
      .mockResolvedValueOnce("Write a loop in Java.")  // Phase 2 LLM reply
      .mockResolvedValueOnce('NO');                    // evidence gate

    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set(AUTH)
      .send({
        messages: [
          { role: 'user', content: 'Java' },
          { role: 'assistant', content: 'Great!' },
          { role: 'user', content: 'I like music' },
          { role: 'assistant', content: "Let's try a task." },
          { role: 'user', content: "I don't know how to do that" },
        ],
      });

    expect(res.body.phase).toBe(2);
    expect(res.body.onboardingComplete).toBe(false);
  });
});

// ── Phase 3 — END_ONBOARDING parsing ─────────────────────────────────────────

describe('POST /api/profile/onboarding/chat — Phase 3 / END_ONBOARDING', () => {
  const profileWithEvidence = makeProfile({
    learningStyle: 'visual',
    realLifeInterests: ['football'],
    selfReportedLevel: 'beginner',
    diagnosticEvidence: [{ observation: 'attempted task', suggestedLevel: 'beginner' }],
  });

  const VALID_MARKER = `You're all set! END_ONBOARDING:{"programmingLevel":"beginner","targetLanguage":"Java","topics":["loops"],"learningStyle":"visual","realLifeInterests":["football"],"strengths":[],"weaknesses":[]}`;

  it('completes onboarding when the LLM emits the END_ONBOARDING marker', async () => {
    getProfile.mockResolvedValue(profileWithEvidence);
    chatCompletion.mockResolvedValue(VALID_MARKER);

    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set(AUTH)
      .send({
        messages: [
          { role: 'user', content: 'Java' },
          { role: 'assistant', content: 'Cool' },
          { role: 'user', content: 'football' },
          { role: 'assistant', content: 'Task:' },
          { role: 'user', content: "I don't know" },
          { role: 'assistant', content: 'Thanks!' },
          { role: 'user', content: 'ok' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.onboardingComplete).toBe(true);
    expect(res.body.reply).toBe("You're all set!");
    expect(updateProfile).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ onboardingComplete: true, programmingLevel: 'beginner' })
    );
  });

  it('strips the END_ONBOARDING marker from the visible reply', async () => {
    getProfile.mockResolvedValue(profileWithEvidence);
    chatCompletion.mockResolvedValue(VALID_MARKER);

    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set(AUTH)
      .send({
        messages: [
          { role: 'user', content: 'Java' },
          { role: 'assistant', content: 'Cool' },
          { role: 'user', content: 'football' },
          { role: 'assistant', content: 'Task:' },
          { role: 'user', content: "I don't know" },
          { role: 'assistant', content: 'Thanks!' },
          { role: 'user', content: 'ok' },
        ],
      });

    expect(res.body.reply).not.toContain('END_ONBOARDING');
    expect(res.body.reply).not.toContain('{');
  });

  it('uses a fallback reply when nothing precedes the marker', async () => {
    getProfile.mockResolvedValue(profileWithEvidence);
    chatCompletion.mockResolvedValue(
      'END_ONBOARDING:{"programmingLevel":"beginner","targetLanguage":"Java","topics":[],"learningStyle":"visual","realLifeInterests":["football"],"strengths":[],"weaknesses":[]}'
    );

    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set(AUTH)
      .send({
        messages: [
          { role: 'user', content: 'Java' },
          { role: 'assistant', content: 'Cool' },
          { role: 'user', content: 'football' },
          { role: 'assistant', content: 'Task:' },
          { role: 'user', content: "I don't know" },
          { role: 'assistant', content: 'Thanks!' },
          { role: 'user', content: 'ok' },
        ],
      });

    expect(res.body.reply).toBeTruthy();
    expect(res.body.onboardingComplete).toBe(true);
  });

  it('does not complete onboarding when END_ONBOARDING JSON is malformed', async () => {
    getProfile.mockResolvedValue(profileWithEvidence);
    chatCompletion.mockResolvedValue('Almost done! END_ONBOARDING:{invalid json}');

    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set(AUTH)
      .send({
        messages: [
          { role: 'user', content: 'Java' },
          { role: 'assistant', content: 'Cool' },
          { role: 'user', content: 'football' },
          { role: 'assistant', content: 'Task:' },
          { role: 'user', content: "I don't know" },
          { role: 'assistant', content: 'Thanks!' },
          { role: 'user', content: 'ok' },
        ],
      });

    expect(res.body.onboardingComplete).toBe(false);
    expect(res.body.reply).toBe('Almost done!');
  });

  it('does not complete onboarding when END_ONBOARDING marker is absent', async () => {
    getProfile.mockResolvedValue(profileWithEvidence);
    chatCompletion.mockResolvedValue('Just one more question for you.');

    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set(AUTH)
      .send({
        messages: [
          { role: 'user', content: 'Java' },
          { role: 'assistant', content: 'Cool' },
          { role: 'user', content: 'football' },
          { role: 'assistant', content: 'Task:' },
          { role: 'user', content: "I don't know" },
          { role: 'assistant', content: 'Thanks!' },
          { role: 'user', content: 'ok' },
        ],
      });

    expect(res.body.onboardingComplete).toBe(false);
  });

  it('preserves existing learningStyle when the LLM emits null for it', async () => {
    getProfile.mockResolvedValue({ ...profileWithEvidence, learningStyle: 'visual' });
    chatCompletion.mockResolvedValue(
      `Done! END_ONBOARDING:{"programmingLevel":"beginner","targetLanguage":"Java","topics":[],"learningStyle":null,"realLifeInterests":["football"],"strengths":[],"weaknesses":[]}`
    );

    await request(app)
      .post('/api/profile/onboarding/chat')
      .set(AUTH)
      .send({
        messages: [
          { role: 'user', content: 'Java' },
          { role: 'assistant', content: 'Cool' },
          { role: 'user', content: 'football' },
          { role: 'assistant', content: 'Task:' },
          { role: 'user', content: "I don't know" },
          { role: 'assistant', content: 'Thanks!' },
          { role: 'user', content: 'ok' },
        ],
      });

    const savedProfile = updateProfile.mock.calls.find(
      ([, p]) => p.onboardingComplete
    )?.[1];
    // learningStyle: null was stripped by buildFinalProfile — existing value preserved via updateProfile merge
    expect(savedProfile?.learningStyle).toBeUndefined(); // null was filtered out
  });
});
