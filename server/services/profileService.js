import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readJSON, updateJSON } from '../utils/fileLock.js';

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
  await updateJSON(profilePath(userId), () => data);
  return data;
}

export async function updateProfile(userId, updates) {
  return updateJSON(profilePath(userId), (existing) => ({
    ...(existing ?? {}),
    ...updates,
    userId,
    updatedAt: new Date().toISOString(),
  }));
}

export async function appendSessionHistory(userId, entry) {
  return updateJSON(profilePath(userId), (profile) => {
    if (!profile) return null;
    const history = [...(profile.sessionHistory ?? []), { ...entry, timestamp: new Date().toISOString() }];
    if (history.length > 50) history.splice(0, history.length - 50);
    return { ...profile, sessionHistory: history, updatedAt: new Date().toISOString() };
  });
}

export async function appendChatHistory(userId, chat) {
  return updateJSON(profilePath(userId), (profile) => {
    if (!profile) return null;
    const history = [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        messages: chat,
      },
      ...(profile.chatHistory ?? []),
    ];
    if (history.length > 50) history.splice(50);
    return { ...profile, chatHistory: history, updatedAt: new Date().toISOString() };
  });
}

// auto adds one diagnostic evidence object to the array
// reads the current array inside the updater so concurrent Phase 2 turns
// can't overwrite each other's evidence
export async function appendDiagnosticEvidence(userId, evidence) {
  return updateJSON(profilePath(userId), (profile) => {
    if (!profile) return null;
    const existing = profile.diagnosticEvidence ?? [];
    return { ...profile, diagnosticEvidence: [...existing, evidence], updatedAt: new Date().toISOString() };
  });
}

export async function createEmptyProfile(userId) {
  return saveProfile(userId, {
    programmingLevel: null,
    targetLanguage: null,
    learningStyle: null,
    topics: [],
    sessionTopics: [],
    realLifeInterests: [],
    strengths: [],
    weaknesses: [],
    sessionHistory: [],
    chatHistory: [],
    files: [],
    onboardingComplete: false,
    onboardingPhase: 1,
    preferredLLM: 'openai',
    customApiKeys: {},
  });
}
