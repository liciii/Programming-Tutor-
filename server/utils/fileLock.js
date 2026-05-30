import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

// Per-file write queue: each file path maps to a Promise chain so concurrent
// writes are serialised without blocking the event loop.
const queues = new Map();

export async function readJSON(filePath) {
  if (!existsSync(filePath)) return null;
  const text = await readFile(filePath, 'utf-8');
  return JSON.parse(text);
}

export async function writeJSON(filePath, data) {
  const prev = queues.get(filePath) ?? Promise.resolve();
  const next = prev.then(() => writeFile(filePath, JSON.stringify(data, null, 2)));
  // Swallow the error in the queued slot so a failed write doesn't permanently
  // block future writes to the same file.
  queues.set(filePath, next.catch(() => {}));
  return next;
}
