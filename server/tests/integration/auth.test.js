import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

vi.mock('../../services/userService.js', () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  createUser: vi.fn(),
  getAllUsers: vi.fn(),
  updateUser: vi.fn(),
  setResetToken: vi.fn(),
  findUserByResetToken: vi.fn(),
  clearResetToken: vi.fn(),
}));

vi.mock('../../services/profileService.js', () => ({
  createEmptyProfile: vi.fn(),
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  updateProfile: vi.fn(),
  appendSessionHistory: vi.fn(),
  appendChatHistory: vi.fn(),
  appendDiagnosticEvidence: vi.fn(),
}));

vi.mock('../../services/emailService.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

import app from '../../app.js';
import { findUserByEmail, findUserById, createUser, setResetToken, findUserByResetToken, clearResetToken, updateUser } from '../../services/userService.js';
import { createEmptyProfile, getProfile } from '../../services/profileService.js';
import { sendPasswordResetEmail } from '../../services/emailService.js';

const SECRET = 'test-secret';
let TEST_HASH;

beforeAll(async () => {
  TEST_HASH = await bcrypt.hash('password123', 4);
});

beforeEach(() => {
  vi.clearAllMocks();
});

const MOCK_USER = () => ({
  id: 'user-1',
  email: 'alice@test.com',
  name: 'Alice',
  password: TEST_HASH,
});

// refiister

describe('POST /api/auth/register', () => {
  it('creates a user and returns a token', async () => {
    findUserByEmail.mockReturnValue(undefined);
    createUser.mockImplementation(u => u);
    createEmptyProfile.mockReturnValue({});

    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@test.com',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('alice@test.com');
  });

  it('returns 409 when email is already registered', async () => {
    findUserByEmail.mockReturnValue(MOCK_USER());

    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@test.com',
      password: 'password123',
    });

    expect(res.status).toBe(409);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'x@test.com' });
    expect(res.status).toBe(400);
  });
});

// login

describe('POST /api/auth/login', () => {
  it('returns token and profile flag for valid credentials', async () => {
    findUserByEmail.mockReturnValue(MOCK_USER());
    getProfile.mockReturnValue({ onboardingComplete: true });

    const res = await request(app).post('/api/auth/login').send({
      email: 'alice@test.com',
      password: 'password123',
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.onboardingComplete).toBe(true);
  });

  it('returns 401 for a non-existent user', async () => {
    findUserByEmail.mockReturnValue(undefined);

    const res = await request(app).post('/api/auth/login').send({
      email: 'ghost@test.com',
      password: 'password123',
    });

    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong password', async () => {
    findUserByEmail.mockReturnValue(MOCK_USER());

    const res = await request(app).post('/api/auth/login').send({
      email: 'alice@test.com',
      password: 'wrongpassword',
    });

    expect(res.status).toBe(401);
  });

  it('returns 400 when fields are missing', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'x@test.com' });
    expect(res.status).toBe(400);
  });
});


describe('GET /api/auth/me', () => {
  it('returns user info for a valid token', async () => {
    const token = jwt.sign({ id: 'user-1', email: 'alice@test.com' }, SECRET);
    findUserById.mockReturnValue(MOCK_USER());
    getProfile.mockReturnValue({ onboardingComplete: true });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe('user-1');
    expect(res.body.onboardingComplete).toBe(true);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 403 for an invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer bogus.token.here');
    expect(res.status).toBe(403);
  });

  it('returns 404 when user id from token does not exist', async () => {
    const token = jwt.sign({ id: 'deleted-user' }, SECRET);
    findUserById.mockReturnValue(undefined);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

//forgor password

describe('POST /api/auth/forgot-password', () => {
  it('returns 400 when email is missing', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({});
    expect(res.status).toBe(400);
  });

  it('sends email and returns generic message when account exists', async () => {
    setResetToken.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'alice@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
    expect(sendPasswordResetEmail).toHaveBeenCalledWith('alice@test.com', expect.any(String));
  });

  it('returns same generic message and skips email when account does not exist', async () => {
    setResetToken.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

//reset password
describe('POST /api/auth/reset-password', () => {
  it('returns 400 when token or password is missing', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'abc' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'abc', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid or unknown token', async () => {
    findUserByResetToken.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'badtoken', password: 'newpassword123' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for an expired token', async () => {
    findUserByResetToken.mockResolvedValue({
      id: 'user-1',
      resetToken: 'expiredtok',
      resetTokenExpiry: new Date(Date.now() - 1000).toISOString(),
    });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'expiredtok', password: 'newpassword123' });

    expect(res.status).toBe(400);
  });

  it('updates password and clears token for a valid request', async () => {
    findUserByResetToken.mockResolvedValue({
      id: 'user-1',
      resetToken: 'validtok',
      resetTokenExpiry: new Date(Date.now() + 3_600_000).toISOString(),
    });
    updateUser.mockResolvedValue({ id: 'user-1' });
    clearResetToken.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'validtok', password: 'newpassword123' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
    expect(updateUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ password: expect.any(String) }));
    expect(clearResetToken).toHaveBeenCalledWith('user-1');
  });
});

// 500 error paths
describe('POST /api/auth/register — server error', () => {
  it('returns 500 when createUser throws', async () => {
    findUserByEmail.mockReturnValue(undefined);
    createUser.mockRejectedValue(new Error('DB failure'));

    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@test.com',
      password: 'password123',
    });

    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/login — server error', () => {
  it('returns 500 when findUserByEmail throws', async () => {
    findUserByEmail.mockRejectedValue(new Error('DB failure'));

    const res = await request(app).post('/api/auth/login').send({
      email: 'alice@test.com',
      password: 'password123',
    });

    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/forgot-password — server error', () => {
  it('returns 500 when setResetToken throws', async () => {
    setResetToken.mockRejectedValue(new Error('DB failure'));

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'alice@test.com' });

    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/reset-password — server error', () => {
  it('returns 500 when updateUser throws', async () => {
    findUserByResetToken.mockResolvedValue({
      id: 'user-1',
      resetToken: 'tok',
      resetTokenExpiry: new Date(Date.now() + 3_600_000).toISOString(),
    });
    updateUser.mockRejectedValue(new Error('DB write failure'));

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'tok', password: 'newpassword123' });

    expect(res.status).toBe(500);
  });
});

describe('GET /api/auth/me — server error', () => {
  it('returns 500 when findUserById throws', async () => {
    const token = jwt.sign({ id: 'user-1' }, SECRET);
    findUserById.mockRejectedValue(new Error('DB failure'));

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/register — validation edge cases', () => {
  it('returns 400 for an invalid email format', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice',
      email: 'not-an-email',
      password: 'password123',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@test.com',
      password: 'short',
    });
    expect(res.status).toBe(400);
  });
});
