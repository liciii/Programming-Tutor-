import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../utils/fileLock.js', () => {
  const readJSON = vi.fn();
  const writeJSON = vi.fn().mockResolvedValue(undefined);
  const updateJSON = vi.fn(async (path, updater) => {
    const current = await readJSON(path);
    const result = await updater(current);
    if (result != null) await writeJSON(path, result);
    return result;
  });
  return { readJSON, writeJSON, updateJSON };
});

import { readJSON, writeJSON } from '../../../utils/fileLock.js';
import {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  buildSystemPrompt,
  seedDefaultTemplates,
  DEFAULT_TEMPLATES,
} from '../../../services/templateService.js';

const USER_TEMPLATE = {
  id: 'tmpl-custom',
  ownerId: 'user-1',
  isDefault: false,
  name: 'My Template',
  systemPrompt: 'Hello {{programmingLevel}} student learning {{targetLanguage}}.',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const ALL_TEMPLATES = [...DEFAULT_TEMPLATES, USER_TEMPLATE];

beforeEach(() => {
  vi.clearAllMocks();
  readJSON.mockResolvedValue([...ALL_TEMPLATES]);
  writeJSON.mockResolvedValue(undefined);
});

describe('getAllTemplates', () => {
  it('includes default templates for every user', async () => {
    const templates = await getAllTemplates('user-99');
    expect(templates.some(t => t.id === 'default-explain')).toBe(true);
    expect(templates.some(t => t.id === 'default-debug')).toBe(true);
  });

  it("includes the owner's custom template", async () => {
    const templates = await getAllTemplates('user-1');
    expect(templates.some(t => t.id === 'tmpl-custom')).toBe(true);
  });

  it("does not expose another user's custom template", async () => {
    const templates = await getAllTemplates('user-2');
    expect(templates.some(t => t.id === 'tmpl-custom')).toBe(false);
  });
});

describe('getTemplateById', () => {
  it('returns a default template for any user', async () => {
    const t = await getTemplateById('default-explain', 'user-99');
    expect(t).not.toBeNull();
    expect(t.id).toBe('default-explain');
  });

  it('returns a custom template only for its owner', async () => {
    expect(await getTemplateById('tmpl-custom', 'user-1')).not.toBeNull();
    expect(await getTemplateById('tmpl-custom', 'user-2')).toBeNull();
  });

  it('returns null for a non-existent id', async () => {
    expect(await getTemplateById('ghost', 'user-1')).toBeNull();
  });
});

describe('createTemplate', () => {
  it('creates template with generated id and correct metadata', async () => {
    const t = await createTemplate('user-1', { name: 'New', systemPrompt: 'Be helpful.', description: 'Desc' });
    expect(t.id).toBeDefined();
    expect(t.ownerId).toBe('user-1');
    expect(t.isDefault).toBe(false);
    expect(t.name).toBe('New');
    expect(t.createdAt).toBeDefined();

    const [, written] = writeJSON.mock.calls[0];
    expect(written.at(-1).name).toBe('New');
  });
});

describe('updateTemplate', () => {
  it('updates a custom template owned by the user', async () => {
    const result = await updateTemplate('tmpl-custom', 'user-1', { name: 'Renamed' });
    expect(result.name).toBe('Renamed');
    expect(result.updatedAt).toBeDefined();
  });

  it('refuses to edit a default template with 403', async () => {
    const result = await updateTemplate('default-explain', 'user-1', { name: 'Hacked' });
    expect(result.error).toBeDefined();
    expect(result.statusCode).toBe(403);
  });

  it("refuses to edit another user's template with 403", async () => {
    const result = await updateTemplate('tmpl-custom', 'user-2', { name: 'Stolen' });
    expect(result.error).toBe('Forbidden');
    expect(result.statusCode).toBe(403);
  });

  it('returns 404 for a non-existent id', async () => {
    const result = await updateTemplate('ghost', 'user-1', {});
    expect(result.statusCode).toBe(404);
    expect(result.error).toBeDefined();
  });
});

describe('deleteTemplate', () => {
  it('deletes a custom template owned by the user', async () => {
    const result = await deleteTemplate('tmpl-custom', 'user-1');
    expect(result.success).toBe(true);
    const [, written] = writeJSON.mock.calls[0];
    expect(written.some(t => t.id === 'tmpl-custom')).toBe(false);
  });

  it('refuses to delete a default template with 403', async () => {
    const result = await deleteTemplate('default-explain', 'user-1');
    expect(result.error).toBeDefined();
    expect(result.statusCode).toBe(403);
    expect(writeJSON).not.toHaveBeenCalled();
  });

  it("refuses to delete another user's template with 403", async () => {
    const result = await deleteTemplate('tmpl-custom', 'user-2');
    expect(result.error).toBe('Forbidden');
    expect(result.statusCode).toBe(403);
  });

  it('returns 404 for a non-existent template', async () => {
    readJSON.mockResolvedValue([]);
    const result = await deleteTemplate('ghost', 'user-1');
    expect(result.statusCode).toBe(404);
    expect(result.error).toBe('Not found');
  });
});

describe('buildSystemPrompt', () => {
  it('replaces all profile placeholders', async () => {
    const profile = {
      programmingLevel: 'intermediate',
      targetLanguage: 'JavaScript',
      learningStyle: 'hands-on',
      realLifeInterests: ['games', 'music'],
      weaknesses: ['async'],
      strengths: ['loops'],
      topics: ['arrays'],
    };
    const prompt = await buildSystemPrompt('default-explain', profile, 'user-1');
    expect(prompt).toContain('intermediate');
    expect(prompt).toContain('JavaScript');
    expect(prompt).toContain('hands-on');
    expect(prompt).toContain('games, music');
    expect(prompt).toContain('async');
    expect(prompt).toContain('loops');
  });

  it('substitutes default values when profile fields are absent', async () => {
    const prompt = await buildSystemPrompt('default-explain', {}, 'user-1');
    expect(prompt).toContain('beginner');
    expect(prompt).toContain('Python');
    expect(prompt).toContain('none identified yet');
  });

  it('replaces placeholders in a custom template', async () => {
    const prompt = await buildSystemPrompt('tmpl-custom', { programmingLevel: 'advanced', targetLanguage: 'Go' }, 'user-1');
    expect(prompt).toBe('Hello advanced student learning Go.');
  });

  it('returns null for a non-existent template', async () => {
    expect(await buildSystemPrompt('ghost', {}, 'user-1')).toBeNull();
  });

  it('resolves {{recentTopics}} from session topics when present', async () => {
    const prompt = await buildSystemPrompt(
      'default-exercise',
      { sessionTopics: ['recursion'], topics: ['arrays'] },
      'user-1',
    );
    expect(prompt).toContain('recursion');
  });

  it('falls back to standing topics for {{recentTopics}} when no session topics', async () => {
    const prompt = await buildSystemPrompt(
      'default-exercise',
      { sessionTopics: [], topics: ['arrays'] },
      'user-1',
    );
    expect(prompt).toContain('arrays');
  });

  it('uses a default for {{recentTopics}} when no topics at all', async () => {
    const prompt = await buildSystemPrompt('default-exercise', {}, 'user-1');
    expect(prompt).toContain('none yet this session');
  });

  it('strips unresolved placeholders from a custom template', async () => {
    readJSON.mockResolvedValue([
      {
        id: 'tmpl-typo',
        ownerId: 'user-1',
        isDefault: false,
        name: 'Typo',
        systemPrompt: 'Hello {{programmingLevel}} learner. Focus: {{topcis}}.',
      },
    ]);
    const prompt = await buildSystemPrompt('tmpl-typo', { programmingLevel: 'advanced' }, 'user-1');
    expect(prompt).not.toContain('{{');
    expect(prompt).not.toContain('}}');
    expect(prompt).toContain('advanced');
  });
});

describe('seedDefaultTemplates', () => {
  it('writes all default templates when the file is empty (null)', async () => {
    readJSON.mockResolvedValue(null);

    await seedDefaultTemplates();

    expect(writeJSON).toHaveBeenCalledOnce();
    const [, written] = writeJSON.mock.calls[0];
    const ids = written.map(t => t.id);
    expect(ids).toContain('default-explain');
    expect(ids).toContain('default-exercise');
    expect(ids).toContain('default-feedback');
    expect(ids).toContain('default-debug');
    expect(ids).toContain('default-quiz');
  });

  it('writes all default templates when the file is an empty array', async () => {
    readJSON.mockResolvedValue([]);

    await seedDefaultTemplates();

    expect(writeJSON).toHaveBeenCalledOnce();
    const [, written] = writeJSON.mock.calls[0];
    expect(written.length).toBeGreaterThanOrEqual(DEFAULT_TEMPLATES.length);
  });

  it('updates a default template whose systemPrompt has changed', async () => {
    const stale = { ...DEFAULT_TEMPLATES[0], systemPrompt: 'outdated prompt' };
    readJSON.mockResolvedValue([stale]);

    await seedDefaultTemplates();

    expect(writeJSON).toHaveBeenCalledOnce();
    const [, written] = writeJSON.mock.calls[0];
    const refreshed = written.find(t => t.id === DEFAULT_TEMPLATES[0].id);
    expect(refreshed.systemPrompt).toBe(DEFAULT_TEMPLATES[0].systemPrompt);
  });

  it('skips the write entirely when all default templates are already up to date', async () => {
    readJSON.mockResolvedValue([...DEFAULT_TEMPLATES]);

    await seedDefaultTemplates();

    expect(writeJSON).not.toHaveBeenCalled();
  });

  it('preserves existing user-created (non-default) templates during seed', async () => {
    readJSON.mockResolvedValue([USER_TEMPLATE]);

    await seedDefaultTemplates();

    expect(writeJSON).toHaveBeenCalledOnce();
    const [, written] = writeJSON.mock.calls[0];
    expect(written.some(t => t.id === 'tmpl-custom')).toBe(true);
  });
});
