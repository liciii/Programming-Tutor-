import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../services/profileService.js', () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('../../services/llmService.js', () => ({
  detectIntent: vi.fn().mockReturnValue('default-explain'),
  streamChatCompletion: vi.fn(),
  extractProfileUpdates: vi.fn().mockResolvedValue({}),
  INTERNAL_PROVIDER: 'openai',
}));

vi.mock('../../services/templateService.js', () => ({
  buildSystemPrompt: vi.fn().mockResolvedValue('You are a tutor.'),
}));

vi.mock('../../services/fileContentService.js', () => ({
  buildFileContext: vi.fn().mockResolvedValue({ textContext: '', imageFiles: [] }),
}));

import app from '../../app.js';
import { getProfile, updateProfile } from '../../services/profileService.js';
import { streamChatCompletion, extractProfileUpdates } from '../../services/llmService.js';
import { buildSystemPrompt } from '../../services/templateService.js';

const SECRET = 'test-secret';
function token(userId = 'user-1') {
  return jwt.sign({ id: userId, email: 'u@test.com' }, SECRET);
}

const COMPLETE_PROFILE = {
  userId: 'user-1',
  onboardingComplete: true,
  programmingLevel: 'beginner',
  targetLanguage: 'Java',
  preferredLLM: 'openai',
  customApiKeys: {},
  files: [],
  sessionHistory: [],
};

beforeEach(() => vi.clearAllMocks());

// auth

describe('POST /api/chat/message — authentication', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/chat/message').send({ messages: [] });
    expect(res.status).toBe(401);
  });
});

//input validation
describe('POST /api/chat/message — input validation', () => {
  it('returns 400 when messages is missing', async () => {
    getProfile.mockResolvedValue(COMPLETE_PROFILE);
    const res = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when messages is not an array', async () => {
    getProfile.mockResolvedValue(COMPLETE_PROFILE);
    const res = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: 'not an array' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when messages is an empty array', async () => {
    getProfile.mockResolvedValue(COMPLETE_PROFILE);
    const res = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when a message is missing a role', async () => {
    getProfile.mockResolvedValue(COMPLETE_PROFILE);
    const res = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: [{ content: 'hello' }] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when a message has an invalid role', async () => {
    getProfile.mockResolvedValue(COMPLETE_PROFILE);
    const res = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: [{ role: 'system', content: 'hello' }] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when a message content exceeds 20,000 characters', async () => {
    getProfile.mockResolvedValue(COMPLETE_PROFILE);
    const res = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: [{ role: 'user', content: 'x'.repeat(20_001) }] });
    expect(res.status).toBe(400);
  });
});

//onboarding gate
describe('POST /api/chat/message — onboarding gate', () => {
  it('returns 400 when the user has not completed onboarding', async () => {
    getProfile.mockResolvedValue({ ...COMPLETE_PROFILE, onboardingComplete: false });
    const res = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: [{ role: 'user', content: 'hello' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/onboarding/i);
  });
});

//valid request paths
describe('POST /api/chat/message — streaming', () => {
  it('calls streamChatCompletion and returns 200', async () => {
    getProfile.mockResolvedValue(COMPLETE_PROFILE);
    streamChatCompletion.mockImplementation(({ res }) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`data: ${JSON.stringify({ delta: 'Hello' })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true, fullContent: 'Hello' })}\n\n`);
      res.end();
      return Promise.resolve('Hello');
    });

    const res = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: [{ role: 'user', content: 'What is a loop?' }] });

    expect(res.status).toBe(200);
    expect(streamChatCompletion).toHaveBeenCalledOnce();
  });

  it('passes imageFiles from buildFileContext to streamChatCompletion', async () => {
    const fakeImages = [{ name: 'a.png', mimeType: 'image/png', base64: 'abc' }];
    const { buildFileContext } = await import('../../services/fileContentService.js');
    buildFileContext.mockResolvedValue({ textContext: '', imageFiles: fakeImages });

    getProfile.mockResolvedValue(COMPLETE_PROFILE);
    streamChatCompletion.mockImplementation(({ res }) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.end();
      return Promise.resolve('');
    });

    await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: [{ role: 'user', content: 'look at this image' }] });

    expect(streamChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ imageFiles: fakeImages })
    );
  });

  it('appends session history context to systemPrompt when the profile has session history', async () => {
    const profileWithHistory = {
      ...COMPLETE_PROFILE,
      sessionHistory: [
        { summary: 'Learned about loops' },
        { summary: 'Practiced recursion' },
      ],
    };
    getProfile.mockResolvedValue(profileWithHistory);
    streamChatCompletion.mockImplementation(({ res }) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.end();
      return Promise.resolve('');
    });

    await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: [{ role: 'user', content: 'help me' }] });

    expect(streamChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining('Recent session context'),
      })
    );
  });

  it('uses an explicit templateId from the request body when provided', async () => {
    getProfile.mockResolvedValue(COMPLETE_PROFILE);
    streamChatCompletion.mockImplementation(({ res }) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.end();
      return Promise.resolve('');
    });

    await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: [{ role: 'user', content: 'quiz me' }], templateId: 'default-quiz' });

    expect(buildSystemPrompt).toHaveBeenCalledWith('default-quiz', expect.anything(), expect.anything());
  });
});

//background profile update 
describe('POST /api/chat/message — background profile update', () => {
  it('calls extractProfileUpdates when message count warrants it', async () => {
    getProfile.mockResolvedValue({ ...COMPLETE_PROFILE, sessionHistory: [] });
    streamChatCompletion.mockImplementation(({ res }) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.end();
      return Promise.resolve('');
    });
    extractProfileUpdates.mockResolvedValue({ strengths: ['loops'] });

    await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: [{ role: 'user', content: 'I understand loops now' }] });

    // let the fire-and-forget IIFE resolve
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(extractProfileUpdates).toHaveBeenCalledOnce();
  });

  it('updates programmingLevel when extractProfileUpdates returns a different level', async () => {
    getProfile.mockResolvedValue({ ...COMPLETE_PROFILE });
    streamChatCompletion.mockImplementation(({ res }) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.end();
      return Promise.resolve('');
    });
    extractProfileUpdates.mockResolvedValue({ programmingLevel: 'intermediate' });
    updateProfile.mockResolvedValue({});

    await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: [{ role: 'user', content: 'test' }] });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(updateProfile).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ programmingLevel: 'intermediate' })
    );
  });

  it('does not call updateProfile when there are no profile changes to apply', async () => {
    getProfile.mockResolvedValue({ ...COMPLETE_PROFILE });
    streamChatCompletion.mockImplementation(({ res }) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.end();
      return Promise.resolve('');
    });
    extractProfileUpdates.mockResolvedValue({});

    await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: [{ role: 'user', content: 'test' }] });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('returns 500 when streamChatCompletion throws before headers are sent', async () => {
    getProfile.mockResolvedValue(COMPLETE_PROFILE);
    streamChatCompletion.mockRejectedValue(new Error('Provider down'));

    const res = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: [{ role: 'user', content: 'help' }] });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/chat error/i);
  });

  it('updates weaknesses when extractProfileUpdates returns weaknesses', async () => {
    getProfile.mockResolvedValue({ ...COMPLETE_PROFILE });
    streamChatCompletion.mockImplementation(({ res }) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.end();
      return Promise.resolve('');
    });
    extractProfileUpdates.mockResolvedValue({ weaknesses: ['recursion'] });
    updateProfile.mockResolvedValue({});

    await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: [{ role: 'user', content: 'I struggled with recursion' }] });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(updateProfile).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ weaknesses: expect.arrayContaining(['recursion']) })
    );
  });

  it('updates sessionTopics when extractProfileUpdates returns topics', async () => {
    getProfile.mockResolvedValue({ ...COMPLETE_PROFILE });
    streamChatCompletion.mockImplementation(({ res }) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.end();
      return Promise.resolve('');
    });
    extractProfileUpdates.mockResolvedValue({ topics: ['closures'] });
    updateProfile.mockResolvedValue({});

    await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: [{ role: 'user', content: 'let us talk about closures' }] });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(updateProfile).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ sessionTopics: expect.arrayContaining(['closures']) })
    );
  });

  it('swallows extractProfileUpdates errors and does not crash the request', async () => {
    getProfile.mockResolvedValue({ ...COMPLETE_PROFILE });
    streamChatCompletion.mockImplementation(({ res }) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.end();
      return Promise.resolve('');
    });
    extractProfileUpdates.mockRejectedValue(new Error('Extraction failed'));

    const res = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({ messages: [{ role: 'user', content: 'hello' }] });

    //  request should complete successfully even though background extraction threw
    expect(res.status).toBe(200);
    await new Promise(resolve => setTimeout(resolve, 10));
    // No assertion needed on the error — we verify the request didn't fail.
  });

  it('skips profile extraction when user message count is 3 and not divisible by 5', async () => {
    // userMsgCount = 3: not <= 2 and 3 % 5 !== 0, so shouldExtract = false → early return
    getProfile.mockResolvedValue({ ...COMPLETE_PROFILE });
    streamChatCompletion.mockImplementation(({ res }) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.end();
      return Promise.resolve('');
    });

    await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        messages: [
          { role: 'user', content: 'msg 1' },
          { role: 'assistant', content: 'reply 1' },
          { role: 'user', content: 'msg 2' },
          { role: 'assistant', content: 'reply 2' },
          { role: 'user', content: 'msg 3' },
        ],
      });

    await new Promise(resolve => setTimeout(resolve, 10));

    // extractProfileUpdates should NOT be called when shouldExtract is false
    expect(extractProfileUpdates).not.toHaveBeenCalled();
  });
});
