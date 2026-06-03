import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readJSON, updateJSON } from '../utils/fileLock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const USERS_FILE = join(__dirname, '../data/users/users.json');

export async function getAllUsers() {
  return (await readJSON(USERS_FILE)) ?? [];
}

export async function findUserByEmail(email) {
  const users = (await readJSON(USERS_FILE)) ?? [];
  return users.find(u => u.email === email.toLowerCase()) ?? null;
}

export async function findUserById(id) {
  const users = (await readJSON(USERS_FILE)) ?? [];
  return users.find(u => u.id === id) ?? null;
}

export async function createUser(user) {
  return updateJSON(USERS_FILE, (users) => {
    const list = users ?? [];
    list.push(user);
    return list;
  }).then(() => user);
}

export async function updateUser(id, updates) {
  let updated = null;
  await updateJSON(USERS_FILE, (users) => {
    const list = users ?? [];
    const idx = list.findIndex(u => u.id === id);
    if (idx === -1) return null; // user not found — skip write
    const next = [...list];
    next[idx] = { ...next[idx], ...updates };
    updated = next[idx];
    return next;
  });
  return updated;
}

export async function setResetToken(email, token, expiry) {
  let found = false;
  await updateJSON(USERS_FILE, (users) => {
    const list = users ?? [];
    const idx = list.findIndex(u => u.email === email.toLowerCase());
    if (idx === -1) return null; // no such user — skip write, don't reveal existence
    found = true;
    const next = [...list];
    next[idx] = { ...next[idx], resetToken: token, resetTokenExpiry: expiry };
    return next;
  });
  return found;
}

export async function findUserByResetToken(token) {
  const users = (await readJSON(USERS_FILE)) ?? [];
  return users.find(u => u.resetToken === token) ?? null;
}

export async function clearResetToken(id) {
  await updateJSON(USERS_FILE, (users) => {
    const list = users ?? [];
    const idx = list.findIndex(u => u.id === id);
    if (idx === -1) return null;
    const next = [...list];
    const { resetToken, resetTokenExpiry, ...rest } = next[idx];
    next[idx] = rest;
    return next;
  });
}
