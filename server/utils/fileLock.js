import { readFile, writeFile } from 'fs/promises';

const queues = new Map();

function enqueue(filePath, task) {
  const prev = queues.get(filePath) ?? Promise.resolve();
  const next = prev.then(task);
  const stored = next.catch(() => {}).then(() => {
    if (queues.get(filePath) === stored) queues.delete(filePath);
  });
  queues.set(filePath, stored);
  return next; 
}

export async function readJSON(filePath) {
  try {
    const text = await readFile(filePath, 'utf-8');
    return JSON.parse(text);
  } catch (err) {
    if (err.code === 'ENOENT' || err instanceof SyntaxError) return null;
    throw err;
  }
}

export async function writeJSON(filePath, data) {
  return enqueue(filePath, () => writeFile(filePath, JSON.stringify(data, null, 2)));
}

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
    if (updated == null) return updated;
    await writeFile(filePath, JSON.stringify(updated, null, 2));
    return updated;
  });
}
