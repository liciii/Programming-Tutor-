import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../services/profileService.js', () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  saveProfile: vi.fn(),
  appendSessionHistory: vi.fn(),
  appendChatHistory: vi.fn(),
  appendDiagnosticEvidence: vi.fn(),
  createEmptyProfile: vi.fn(),
}));

vi.mock('../../services/userService.js', () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  createUser: vi.fn(),
  getAllUsers: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('../../services/llmService.js', () => ({
  chatCompletion: vi.fn(),
  streamChatCompletion: vi.fn(),
  detectIntent: vi.fn().mockReturnValue('default-explain'),
  extractProfileUpdates: vi.fn().mockResolvedValue({}),
  summariseSession: vi.fn().mockResolvedValue('Session summary.'),
  INTERNAL_PROVIDER: 'openai',
}));

import app from '../../app.js';
import { getProfile, updateProfile, appendChatHistory, appendSessionHistory, appendDiagnosticEvidence } from '../../services/profileService.js';
import { summariseSession, chatCompletion } from '../../services/llmService.js';

const SECRET = 'test-secret';

function authToken(userId = 'user-1') {
  return jwt.sign({ id: userId, email: 'alice@test.com' }, SECRET);
}

const COMPLETE_PROFILE = {
  userId: 'user-1',
  programmingLevel: 'beginner',
  targetLanguage: 'Python',
  learningStyle: 'hands-on',
  topics: ['loops'],
  onboardingComplete: true,
  sessionHistory: [],
  chatHistory: [],
  files: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/profile', () => {
  it('returns the user profile', async () => {
    getProfile.mockReturnValue(COMPLETE_PROFILE);

    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${authToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.programmingLevel).toBe('beginner');
  });

  it('returns 404 when profile is not found', async () => {
    getProfile.mockReturnValue(null);

    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${authToken()}`);

    expect(res.status).toBe(404);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/profile', () => {
  it('updates and returns the profile', async () => {
    const updated = { ...COMPLETE_PROFILE, programmingLevel: 'intermediate' };
    updateProfile.mockReturnValue(updated);

    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ programmingLevel: 'intermediate' });

    expect(res.status).toBe(200);
    expect(res.body.programmingLevel).toBe('intermediate');
    expect(updateProfile).toHaveBeenCalledWith('user-1', { programmingLevel: 'intermediate' });
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).put('/api/profile').send({});
    expect(res.status).toBe(401);
  });
});

// ── POST /api/profile/chat-history ───────────────────────────────────────────

describe('POST /api/profile/chat-history', () => {
  const MESSAGES = [
    { role: 'user', content: 'What is a loop?' },
    { role: 'assistant', content: 'A loop repeats code.' },
  ];

  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/profile/chat-history').send({ messages: MESSAGES });
    expect(res.status).toBe(401);
  });

  it('returns 400 when messages is missing', async () => {
    const res = await request(app)
      .post('/api/profile/chat-history')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when messages is an empty array', async () => {
    const res = await request(app)
      .post('/api/profile/chat-history')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ messages: [] });
    expect(res.status).toBe(400);
  });

  it('saves the chat and returns success', async () => {
    appendChatHistory.mockResolvedValue({});

    const res = await request(app)
      .post('/api/profile/chat-history')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ messages: MESSAGES });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(appendChatHistory).toHaveBeenCalledWith('user-1', MESSAGES);
  });

  it('triggers a background session summary and appends one sessionHistory entry', async () => {
    appendChatHistory.mockResolvedValue({});
    appendSessionHistory.mockResolvedValue({});

    await request(app)
      .post('/api/profile/chat-history')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ messages: MESSAGES });

    // Allow the background async IIFE to resolve before asserting.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(summariseSession).toHaveBeenCalledWith(MESSAGES);
    expect(appendSessionHistory).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ summary: 'Session summary.' })
    );
  });
});

// ── GET /api/profile — additional branches ────────────────────────────────────

describe('GET /api/profile — customApiKeys stripping', () => {
  it('returns customApiKeysSet with provider names that have keys, not the key values', async () => {
    getProfile.mockReturnValue({
      ...COMPLETE_PROFILE,
      customApiKeys: { openai: 'sk-real-key', gemini: '', anthropic: 'ant-key' },
    });

    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${authToken()}`);

    expect(res.status).toBe(200);
    // Actual key values must not appear in the response
    expect(JSON.stringify(res.body)).not.toContain('sk-real-key');
    expect(JSON.stringify(res.body)).not.toContain('ant-key');
    // The set should list which providers have keys
    expect(res.body.customApiKeysSet).toContain('openai');
    expect(res.body.customApiKeysSet).toContain('anthropic');
    expect(res.body.customApiKeysSet).not.toContain('gemini');
  });

  it('returns an empty customApiKeysSet when no keys are stored', async () => {
    getProfile.mockReturnValue({ ...COMPLETE_PROFILE, customApiKeys: {} });

    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${authToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.customApiKeysSet).toEqual([]);
  });

  it('returns 500 when getProfile throws', async () => {
    getProfile.mockImplementation(() => { throw new Error('DB error'); });

    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${authToken()}`);

    expect(res.status).toBe(500);
  });
});

// ── PUT /api/profile — sanitization & error paths ────────────────────────────

describe('PUT /api/profile — sanitization', () => {
  it('silently ignores fields not in the MUTABLE_FIELDS allowlist', async () => {
    const updated = { ...COMPLETE_PROFILE, programmingLevel: 'advanced' };
    getProfile.mockReturnValue(COMPLETE_PROFILE);
    updateProfile.mockReturnValue(updated);

    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ programmingLevel: 'advanced', onboardingComplete: false, id: 'hacked' });

    expect(res.status).toBe(200);
    // Only allowed field should be passed to updateProfile
    expect(updateProfile).toHaveBeenCalledWith('user-1', expect.not.objectContaining({ id: 'hacked' }));
    expect(updateProfile).toHaveBeenCalledWith('user-1', expect.not.objectContaining({ onboardingComplete: false }));
  });

  it('merges customApiKeys: keeps stored key when new value is empty string', async () => {
    const existingProfile = {
      ...COMPLETE_PROFILE,
      customApiKeys: { openai: 'existing-key', gemini: '', anthropic: '' },
    };
    getProfile.mockReturnValue(existingProfile);
    updateProfile.mockImplementation((_, updates) => ({ ...existingProfile, ...updates }));

    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ customApiKeys: { openai: '', gemini: 'new-gem-key', anthropic: '' } });

    expect(res.status).toBe(200);
    const saved = updateProfile.mock.calls[0][1];
    expect(saved.customApiKeys.openai).toBe('existing-key');  // preserved
    expect(saved.customApiKeys.gemini).toBe('new-gem-key');   // updated
  });

  it('sanitizes string arrays: slices to 50 items and truncates each to 200 chars', async () => {
    getProfile.mockReturnValue(COMPLETE_PROFILE);
    updateProfile.mockImplementation((_, updates) => ({ ...COMPLETE_PROFILE, ...updates }));

    const longItems = Array.from({ length: 60 }, (_, i) => `item-${'x'.repeat(250)}-${i}`);

    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ topics: longItems });

    expect(res.status).toBe(200);
    const saved = updateProfile.mock.calls[0][1];
    expect(saved.topics.length).toBe(50);
    expect(saved.topics[0].length).toBeLessThanOrEqual(200);
  });

  it('replaces non-array topic values with an empty array', async () => {
    getProfile.mockReturnValue(COMPLETE_PROFILE);
    updateProfile.mockImplementation((_, updates) => ({ ...COMPLETE_PROFILE, ...updates }));

    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ topics: 'not-an-array' });

    expect(res.status).toBe(200);
    const saved = updateProfile.mock.calls[0][1];
    expect(Array.isArray(saved.topics)).toBe(true);
    expect(saved.topics).toEqual([]);
  });

  it('returns 500 when updateProfile throws', async () => {
    getProfile.mockReturnValue(COMPLETE_PROFILE);
    updateProfile.mockImplementation(() => { throw new Error('Write error'); });

    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ programmingLevel: 'advanced' });

    expect(res.status).toBe(500);
  });

  it('strips actual key values from the PUT response body', async () => {
    getProfile.mockReturnValue(COMPLETE_PROFILE);
    updateProfile.mockReturnValue({
      ...COMPLETE_PROFILE,
      customApiKeys: { openai: 'sk-visible', gemini: '', anthropic: '' },
    });

    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ preferredLLM: 'openai' });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('sk-visible');
    expect(res.body.customApiKeysSet).toContain('openai');
  });
});

// ── POST /api/profile/chat-history — error paths ─────────────────────────────

describe('POST /api/profile/chat-history — error paths', () => {
  it('returns 500 when appendChatHistory throws', async () => {
    appendChatHistory.mockRejectedValue(new Error('DB failure'));

    const res = await request(app)
      .post('/api/profile/chat-history')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ],
      });

    expect(res.status).toBe(500);
  });

  it('still returns 200 when summariseSession throws (error is swallowed in background)', async () => {
    appendChatHistory.mockResolvedValue({});
    summariseSession.mockRejectedValue(new Error('LLM error'));

    const res = await request(app)
      .post('/api/profile/chat-history')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ],
      });

    // The response must succeed — errors in the background IIFE are swallowed.
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Allow the background IIFE to run and hit its catch block.
    await new Promise(resolve => setTimeout(resolve, 10));
  });
});

// ── POST /api/profile/onboarding/chat — Phase 2 evidence extraction errors ────

describe('POST /api/profile/onboarding/chat — Phase 2 extraction errors', () => {
  const phase2Profile = {
    userId: 'user-1',
    onboardingPhase: 2,
    onboardingComplete: false,
    selfReportedLevel: 'beginner',
    targetLanguage: 'Java',
    topics: ['loops'],
    learningStyle: 'hands-on',
    realLifeInterests: ['football'],
    diagnosticEvidence: [],
  };

  const phase2Messages = [
    { role: 'user', content: 'Java' },
    { role: 'assistant', content: 'Try this task' },
    { role: 'user', content: 'for loop attempt' },
  ];

  it('stays in Phase 2 and returns the reply when the gate chatCompletion throws', async () => {
    getProfile.mockResolvedValue(phase2Profile);

    chatCompletion
      .mockResolvedValueOnce('Good try!')   // Phase 2 assistant reply
      .mockRejectedValueOnce(new Error('Gate LLM down'));  // gate throws → return null

    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ messages: phase2Messages });

    expect(res.status).toBe(200);
    expect(res.body.onboardingComplete).toBe(false);
    expect(res.body.phase).toBe(2);
    expect(res.body.reply).toBe('Good try!');
  });

  it('stays in Phase 2 when the evidence extraction chatCompletion throws', async () => {
    getProfile.mockResolvedValue(phase2Profile);

    chatCompletion
      .mockResolvedValueOnce('Good try!')    // Phase 2 reply
      .mockResolvedValueOnce('YES')          // gate passes
      .mockRejectedValueOnce(new Error('Extraction LLM down'));  // extraction throws → return null

    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ messages: phase2Messages });

    expect(res.status).toBe(200);
    expect(res.body.onboardingComplete).toBe(false);
    expect(res.body.phase).toBe(2);
  });
});

// ── POST /api/profile/onboarding/chat — Phase 2 auto-advance to Phase 3 ──────

describe('POST /api/profile/onboarding/chat — Phase 2 auto-advance', () => {
  it('auto-advances to Phase 3 and completes onboarding when evidence is captured', async () => {
    // First getProfile call: Phase 2 profile (no evidence yet)
    // Second getProfile call (after appendDiagnosticEvidence): has evidence
    getProfile
      .mockResolvedValueOnce({
        userId: 'user-1',
        onboardingPhase: 2,
        onboardingComplete: false,
        selfReportedLevel: 'beginner',
        targetLanguage: 'Java',
        topics: ['loops'],
        learningStyle: 'hands-on',
        realLifeInterests: ['football'],
        diagnosticEvidence: [],
      })
      .mockResolvedValueOnce({
        userId: 'user-1',
        onboardingPhase: 2,
        onboardingComplete: false,
        selfReportedLevel: 'beginner',
        targetLanguage: 'Java',
        topics: ['loops'],
        learningStyle: 'hands-on',
        realLifeInterests: ['football'],
        diagnosticEvidence: [{ observation: 'wrote a loop', suggestedLevel: 'beginner' }],
      });

    // Phase 2 LLM reply → evidence gate (YES) → evidence extraction → Phase 3 LLM with END_ONBOARDING
    chatCompletion
      .mockResolvedValueOnce('Good try, thanks for sharing!')
      .mockResolvedValueOnce('YES')
      .mockResolvedValueOnce(JSON.stringify({
        observation: 'wrote a loop',
        vocabularyAccurate: true,
        conceptuallyCorrect: true,
        misconceptionFound: null,
        suggestedLevel: 'beginner',
        confidence: 'medium',
      }))
      .mockResolvedValueOnce(
        'Great work! END_ONBOARDING:{"programmingLevel":"beginner","targetLanguage":"Java","topics":["loops"],"learningStyle":"hands-on","realLifeInterests":["football"],"strengths":[],"weaknesses":[]}'
      );

    appendDiagnosticEvidence.mockResolvedValue({});

    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({
        messages: [
          { role: 'user', content: 'Java' },
          { role: 'assistant', content: 'Cool, give me a task' },
          { role: 'user', content: 'I wrote a for loop that prints 1 to 5' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.onboardingComplete).toBe(true);
    expect(res.body.reply).not.toContain('END_ONBOARDING');
  });

  it('returns Phase 3 reply without completing when Phase 3 has no END_ONBOARDING marker after auto-advance', async () => {
    getProfile
      .mockResolvedValueOnce({
        userId: 'user-1',
        onboardingPhase: 2,
        onboardingComplete: false,
        selfReportedLevel: 'beginner',
        targetLanguage: 'Java',
        topics: ['loops'],
        learningStyle: 'hands-on',
        realLifeInterests: ['football'],
        diagnosticEvidence: [],
      })
      .mockResolvedValueOnce({
        userId: 'user-1',
        diagnosticEvidence: [{ observation: 'wrote something', suggestedLevel: 'beginner' }],
        learningStyle: 'hands-on',
        realLifeInterests: ['football'],
      });

    chatCompletion
      .mockResolvedValueOnce('Good try!')
      .mockResolvedValueOnce('YES')
      .mockResolvedValueOnce(JSON.stringify({ observation: 'x', suggestedLevel: 'beginner', confidence: 'low' }))
      .mockResolvedValueOnce('Let me ask you one more question.');

    appendDiagnosticEvidence.mockResolvedValue({});

    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({
        messages: [
          { role: 'user', content: 'Java' },
          { role: 'assistant', content: 'Try this task' },
          { role: 'user', content: 'for loop attempt' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.onboardingComplete).toBe(false);
    expect(res.body.phase).toBe(3);
  });
});

// ── POST /api/profile/onboarding/chat — Phase 3 additional branches ───────────

describe('POST /api/profile/onboarding/chat — Phase 3 branches', () => {
  it('returns Phase 3 reply unchanged when parseEndMarker returns null (no marker)', async () => {
    getProfile.mockResolvedValue({
      userId: 'user-1',
      onboardingPhase: 3,
      onboardingComplete: false,
      selfReportedLevel: 'intermediate',
      targetLanguage: 'Python',
      topics: ['OOP'],
      learningStyle: 'visual',
      realLifeInterests: ['gaming'],
      diagnosticEvidence: [{ observation: 'traced code well', suggestedLevel: 'intermediate' }],
    });

    chatCompletion.mockResolvedValue('I need one more question to finalise your profile.');

    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({
        messages: [
          { role: 'user', content: 'Python' },
          { role: 'assistant', content: 'ok' },
          { role: 'user', content: 'gaming' },
          { role: 'assistant', content: 'task' },
          { role: 'user', content: 'answer' },
          { role: 'assistant', content: 'good' },
          { role: 'user', content: 'next question' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.onboardingComplete).toBe(false);
    expect(res.body.phase).toBe(3);
    expect(res.body.reply).toBe('I need one more question to finalise your profile.');
  });

  it('returns textBefore fallback when END_ONBOARDING JSON is missing', async () => {
    getProfile.mockResolvedValue({
      userId: 'user-1',
      onboardingPhase: 3,
      onboardingComplete: false,
      selfReportedLevel: 'beginner',
      targetLanguage: 'Java',
      topics: [],
      learningStyle: 'hands-on',
      realLifeInterests: ['football'],
      diagnosticEvidence: [{ observation: 'wrote something', suggestedLevel: 'beginner' }],
    });

    // END_ONBOARDING marker present but no JSON object follows
    chatCompletion.mockResolvedValue('Almost there! END_ONBOARDING:');

    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({
        messages: [
          { role: 'user', content: 'Java' },
          { role: 'assistant', content: 'ok' },
          { role: 'user', content: 'football' },
          { role: 'assistant', content: 'task' },
          { role: 'user', content: 'answer' },
          { role: 'assistant', content: 'thanks' },
          { role: 'user', content: 'ok' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.onboardingComplete).toBe(false);
    expect(res.body.reply).toBeTruthy();
  });

  it('returns 500 when chatCompletion throws during onboarding', async () => {
    getProfile.mockResolvedValue({
      userId: 'user-1',
      onboardingPhase: 1,
      onboardingComplete: false,
      selfReportedLevel: null,
      targetLanguage: null,
      topics: null,
      learningStyle: null,
      realLifeInterests: null,
      diagnosticEvidence: [],
    });

    chatCompletion.mockRejectedValue(new Error('LLM unavailable'));

    const res = await request(app)
      .post('/api/profile/onboarding/chat')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to get response/i);
  });
});
