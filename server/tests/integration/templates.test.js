import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../services/templateService.js', () => ({
  getAllTemplates: vi.fn(),
  getTemplateById: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  buildSystemPrompt: vi.fn(),
  seedDefaultTemplates: vi.fn(),
  DEFAULT_TEMPLATES: [],
}));

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

import app from '../../app.js';
import {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../../services/templateService.js';

const SECRET = 'test-secret';

function authToken(userId = 'user-1') {
  return jwt.sign({ id: userId, email: 'alice@test.com' }, SECRET);
}

const DEFAULT_T = { id: 'default-explain', isDefault: true, name: 'Explain' };
const CUSTOM_T  = { id: 'tmpl-1', ownerId: 'user-1', isDefault: false, name: 'Custom', systemPrompt: 'Custom prompt' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/templates', () => {
  it('returns templates for the authenticated user', async () => {
    getAllTemplates.mockResolvedValue([DEFAULT_T, CUSTOM_T]);

    const res = await request(app)
      .get('/api/templates')
      .set('Authorization', `Bearer ${authToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(getAllTemplates).toHaveBeenCalledWith('user-1');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/templates');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/templates/:id', () => {
  it('returns a template by id', async () => {
    getTemplateById.mockResolvedValue(CUSTOM_T);

    const res = await request(app)
      .get('/api/templates/tmpl-1')
      .set('Authorization', `Bearer ${authToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('tmpl-1');
  });

  it('returns 404 for unknown or forbidden template', async () => {
    getTemplateById.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/templates/ghost')
      .set('Authorization', `Bearer ${authToken()}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/templates', () => {
  it('creates a template and returns 201', async () => {
    createTemplate.mockResolvedValue({ ...CUSTOM_T, id: 'tmpl-new' });

    const res = await request(app)
      .post('/api/templates')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ name: 'Custom', systemPrompt: 'Custom prompt', description: 'Test' });

    expect(res.status).toBe(201);
    expect(createTemplate).toHaveBeenCalledWith('user-1', expect.objectContaining({ name: 'Custom' }));
  });

  it('returns 400 when name or systemPrompt are missing', async () => {
    const res = await request(app)
      .post('/api/templates')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ name: 'No prompt here' });

    expect(res.status).toBe(400);
    expect(createTemplate).not.toHaveBeenCalled();
  });
});

describe('PUT /api/templates/:id', () => {
  it('updates a template successfully', async () => {
    updateTemplate.mockResolvedValue({ ...CUSTOM_T, name: 'Renamed' });

    const res = await request(app)
      .put('/api/templates/tmpl-1')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ name: 'Renamed' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
  });

  it('returns 403 when update is forbidden', async () => {
    updateTemplate.mockResolvedValue({ statusCode: 403, error: 'Forbidden' });

    const res = await request(app)
      .put('/api/templates/tmpl-1')
      .set('Authorization', `Bearer ${authToken('user-2')}`)
      .send({ name: 'Steal' });

    expect(res.status).toBe(403);
  });

  it('returns 404 when template is not found', async () => {
    updateTemplate.mockResolvedValue({ statusCode: 404, error: 'Not found' });

    const res = await request(app)
      .put('/api/templates/ghost')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({});

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/templates/:id', () => {
  it('deletes a template successfully', async () => {
    deleteTemplate.mockResolvedValue({ success: true });

    const res = await request(app)
      .delete('/api/templates/tmpl-1')
      .set('Authorization', `Bearer ${authToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 when deletion is forbidden', async () => {
    deleteTemplate.mockResolvedValue({ statusCode: 403, error: 'Cannot delete default templates' });

    const res = await request(app)
      .delete('/api/templates/default-explain')
      .set('Authorization', `Bearer ${authToken()}`);

    expect(res.status).toBe(403);
  });
});
