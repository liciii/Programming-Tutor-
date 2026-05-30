import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readJSON, writeJSON } from '../utils/fileLock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROFILES_DIR = join(__dirname, '../data/profiles');

function profilePath(userId) {
  return join(PROFILES_DIR, `${userId}.json`);
}

export async function getProfile(userId) {
  return readJSON(profilePath(userId));
}

export async function saveProfile(userId, profile) {
  const data = { ...profile, userId, updatedAt: new Date().toISOString() };
  await writeJSON(profilePath(userId), data);
  return data;
}

export async function updateProfile(userId, updates) {
  const existing = (await getProfile(userId)) ?? {};
  return saveProfile(userId, { ...existing, ...updates });
}

export async function appendSessionHistory(userId, entry) {
  const profile = await getProfile(userId);
  if (!profile) return null;
  const history = profile.sessionHistory ?? [];
  history.push({ ...entry, timestamp: new Date().toISOString() });
  if (history.length > 50) history.splice(0, history.length - 50);
  return updateProfile(userId, { sessionHistory: history });
}

export async function appendChatHistory(userId, chat) {
  const profile = await getProfile(userId);
  if (!profile) return null;
  const history = profile.chatHistory ?? [];
  history.unshift({
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    messages: chat,
  });
  if (history.length > 50) history.splice(50);
  return updateProfile(userId, { chatHistory: history });
}

export async function createEmptyProfile(userId) {
  return saveProfile(userId, {
    programmingLevel: null,
    targetLanguage: null,
    learningStyle: null,
    topics: [],
    interests: [],
    strengths: [],
    weaknesses: [],
    sessionHistory: [],
    chatHistory: [],
    files: [],
    externalSources: [],
    onboardingComplete: false,
    preferredLLM: 'openai',
    customApiKeys: {},
  });
}
