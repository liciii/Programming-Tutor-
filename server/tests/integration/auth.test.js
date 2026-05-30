import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock service modules before app is imported
vi.mock('../../services/userService.js', () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  createUser: vi.fn(),
  getAllUsers: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('../../services/profileService.js', () => ({
  createEmptyProfile: vi.fn(),
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  updateProfile: vi.fn(),
  appendSessionHistory: vi.fn(),
  appendChatHistory: vi.fn(),
}));

import app from '../../app.js';
import { findUserByEmail, findUserById, createUser } from '../../services/userService.js';
import { createEmptyProfile, getProfile } from '../../services/profileService.js';

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
