import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readJSON, writeJSON } from '../utils/fileLock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const USERS_FILE = join(__dirname, '../data/users/users.json');

async function readUsers() {
  return (await readJSON(USERS_FILE)) ?? [];
}

export async function getAllUsers() {
  return readUsers();
}

export async function findUserByEmail(email) {
  const users = await readUsers();
  return users.find(u => u.email === email.toLowerCase()) ?? null;
}

export async function findUserById(id) {
  const users = await readUsers();
  return users.find(u => u.id === id) ?? null;
}

export async function createUser(user) {
  const users = await readUsers();
  users.push(user);
  await writeJSON(USERS_FILE, users);
  return user;
}

export async function updateUser(id, updates) {
  const users = await readUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...updates };
  await writeJSON(USERS_FILE, users);
  return users[idx];
}
