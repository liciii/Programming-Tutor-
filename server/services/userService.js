import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const USERS_FILE = join(__dirname, '../data/users/users.json');

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

export function getAllUsers() {
  return readUsers();
}

export function findUserByEmail(email) {
  return readUsers().find(u => u.email === email.toLowerCase());
}

export function findUserById(id) {
  return readUsers().find(u => u.id === id);
}

export function createUser(user) {
  const users = readUsers();
  users.push(user);
  writeUsers(users);
  return user;
}

export function updateUser(id, updates) {
  const users = readUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...updates };
  writeUsers(users);
  return users[idx];
}
