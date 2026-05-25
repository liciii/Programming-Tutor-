import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROFILES_DIR = join(__dirname, '../data/profiles');

function profilePath(userId) {
  return join(PROFILES_DIR, `${userId}.json`);
}

export function getProfile(userId) {
  const path = profilePath(userId);
  if (!fs.existsSync(path)) return null;
  return JSON.parse(fs.readFileSync(path, 'utf-8'));
}

export function saveProfile(userId, profile) {
  const data = {
    ...profile,
    userId,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(profilePath(userId), JSON.stringify(data, null, 2));
  return data;
}

export function updateProfile(userId, updates) {
  const existing = getProfile(userId) || {};
  return saveProfile(userId, { ...existing, ...updates });
}

export function appendSessionHistory(userId, entry) {
  const profile = getProfile(userId);
  if (!profile) return null;
  const history = profile.sessionHistory || [];
  history.push({ ...entry, timestamp: new Date().toISOString() });
  // Keep last 50 entries
  if (history.length > 50) history.splice(0, history.length - 50);
  return updateProfile(userId, { sessionHistory: history });
}

export function appendChatHistory(userId, chat) {
  const profile = getProfile(userId);
  if (!profile) return null;
  const history = profile.chatHistory || [];
  history.unshift({
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    messages: chat,
  });
  // Keep last 50 chats
  if (history.length > 50) history.splice(50);
  return updateProfile(userId, { chatHistory: history });
}

export function isProfileComplete(profile) {
  if (!profile) return false;
  return !!(
    profile.programmingLevel &&
    profile.targetLanguage &&
    profile.learningStyle &&
    profile.topics?.length > 0
  );
}

export function createEmptyProfile(userId) {
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
