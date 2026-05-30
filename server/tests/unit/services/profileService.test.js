import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the I/O layer — services must not touch the real filesystem in unit tests
vi.mock('../../../utils/fileLock.js', () => ({
  readJSON: vi.fn(),
  writeJSON: vi.fn().mockResolvedValue(undefined),
}));

import { readJSON, writeJSON } from '../../../utils/fileLock.js';
import {
  getProfile,
  saveProfile,
  updateProfile,
  appendSessionHistory,
  appendChatHistory,
  createEmptyProfile,
} from '../../../services/profileService.js';

const BASE_PROFILE = {
  userId: 'user-1',
  programmingLevel: 'beginner',
  targetLanguage: 'Python',
  learningStyle: 'hands-on',
  topics: ['functions', 'loops'],
  interests: ['games'],
  strengths: [],
  weaknesses: [],
  sessionHistory: [],
  chatHistory: [],
  onboardingComplete: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  readJSON.mockResolvedValue({ ...BASE_PROFILE });
  writeJSON.mockResolvedValue(undefined);
});

describe('getProfile', () => {
  it('returns parsed profile when file exists', async () => {
    const p = await getProfile('user-1');
    expect(p.programmingLevel).toBe('beginner');
  });

  it('returns null when file does not exist', async () => {
    readJSON.mockResolvedValue(null);
    expect(await getProfile('user-1')).toBeNull();
  });
});

describe('saveProfile', () => {
  it('writes profile with userId and updatedAt stamped', async () => {
    await saveProfile('user-1', { programmingLevel: 'intermediate' });
    const [, written] = writeJSON.mock.calls[0];
    expect(written.userId).toBe('user-1');
    expect(written.programmingLevel).toBe('intermediate');
    expect(written.updatedAt).toBeDefined();
  });
});

describe('updateProfile', () => {
  it('merges updates with the existing profile', async () => {
    await updateProfile('user-1', { programmingLevel: 'intermediate' });
    const [, written] = writeJSON.mock.calls[0];
    expect(written.programmingLevel).toBe('intermediate');
    expect(written.targetLanguage).toBe('Python');
  });

  it('starts from empty object when no existing profile', async () => {
    readJSON.mockResolvedValue(null);
    await updateProfile('new-user', { programmingLevel: 'beginner' });
    const [, written] = writeJSON.mock.calls[0];
    expect(written.programmingLevel).toBe('beginner');
  });
});

describe('appendSessionHistory', () => {
  it('appends entry with a timestamp', async () => {
    await appendSessionHistory('user-1', { summary: 'Discussed loops', templateUsed: 'default-explain' });
    const [, written] = writeJSON.mock.calls[0];
    expect(written.sessionHistory).toHaveLength(1);
    expect(written.sessionHistory[0].summary).toBe('Discussed loops');
    expect(written.sessionHistory[0].timestamp).toBeDefined();
  });

  it('trims history to the last 50 entries', async () => {
    const bigHistory = Array.from({ length: 50 }, (_, i) => ({ summary: `S${i}`, timestamp: '' }));
    readJSON.mockResolvedValue({ ...BASE_PROFILE, sessionHistory: bigHistory });
    await appendSessionHistory('user-1', { summary: 'newest' });
    const [, written] = writeJSON.mock.calls[0];
    expect(written.sessionHistory).toHaveLength(50);
    expect(written.sessionHistory[49].summary).toBe('newest');
  });

  it('returns null when profile does not exist', async () => {
    readJSON.mockResolvedValue(null);
    expect(await appendSessionHistory('ghost', { summary: 'x' })).toBeNull();
  });
});

describe('appendChatHistory', () => {
  it('prepends the new chat to history', async () => {
    const chat = [{ role: 'user', content: 'hello' }];
    await appendChatHistory('user-1', chat);
    const [, written] = writeJSON.mock.calls[0];
    expect(written.chatHistory[0].messages).toEqual(chat);
    expect(written.chatHistory[0].createdAt).toBeDefined();
  });

  it('trims chat history to 50 entries', async () => {
    const bigChats = Array.from({ length: 50 }, (_, i) => ({ id: String(i), createdAt: '', messages: [] }));
    readJSON.mockResolvedValue({ ...BASE_PROFILE, chatHistory: bigChats });
    await appendChatHistory('user-1', []);
    const [, written] = writeJSON.mock.calls[0];
    expect(written.chatHistory).toHaveLength(50);
  });

  it('returns null when profile does not exist', async () => {
    readJSON.mockResolvedValue(null);
    expect(await appendChatHistory('ghost', [])).toBeNull();
  });
});

describe('createEmptyProfile', () => {
  it('writes correct default shape', async () => {
    await createEmptyProfile('new-user');
    const [, written] = writeJSON.mock.calls[0];
    expect(written.onboardingComplete).toBe(false);
    expect(written.topics).toEqual([]);
    expect(written.preferredLLM).toBe('openai');
    expect(written.customApiKeys).toEqual({});
    expect(written.sessionHistory).toEqual([]);
    expect(written.chatHistory).toEqual([]);
  });
});
