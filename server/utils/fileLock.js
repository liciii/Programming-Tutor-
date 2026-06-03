import { readFile, writeFile } from 'fs/promises';

// Per-file write queue: each file path maps to a Promise chain so concurrent
// writes are serialised without blocking the event loop.
const queues = new Map();

function enqueue(filePath, task) {
  const prev = queues.get(filePath) ?? Promise.resolve();
  const next = prev.then(task);
  // Store a version that never rejects so future entries don't inherit a broken chain.
  // Clean up the entry once this slot resolves to prevent unbounded Map growth.
  const stored = next.catch(() => {}).then(() => {
    if (queues.get(filePath) === stored) queues.delete(filePath);
  });
  queues.set(filePath, stored);
  return next; // callers get the real promise (with rejection)
}

export async function readJSON(filePath) {
  try {
    const text = await readFile(filePath, 'utf-8');
    return JSON.parse(text);
  } catch (err) {
    // ENOENT → file doesn't exist yet; SyntaxError → corrupted file
    if (err.code === 'ENOENT' || err instanceof SyntaxError) return null;
    throw err;
  }
}

export async function writeJSON(filePath, data) {
  return enqueue(filePath, () => writeFile(filePath, JSON.stringify(data, null, 2)));
}

// Atomic read-modify-write: the updater fn receives the current value (or null)
// and returns the new value to persist.  Runs inside the write queue so no
// concurrent writer can interleave between the read and the write.
export async function updateJSON(filePath, updater) {
  return enqueue(filePath, async () => {
    let current = null;
    try {
      const text = await readFile(filePath, 'utf-8');
      current = JSON.parse(text);
    } catch (err) {
      if (err.code !== 'ENOENT' && !(err instanceof SyntaxError)) throw err;
    }
    const updated = await updater(current);
    // null/undefined return from updater means "no change" — skip the write.
    if (updated == null) return updated;
    await writeFile(filePath, JSON.stringify(updated, null, 2));
    return updated;
  });
}
