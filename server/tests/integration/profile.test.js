import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../services/profileService.js', () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  saveProfile: vi.fn(),
  appendSessionHistory: vi.fn(),
  appendChatHistory: vi.fn(),
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
}));

import app from '../../app.js';
import { getProfile, updateProfile } from '../../services/profileService.js';

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
