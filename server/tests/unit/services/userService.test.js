import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../utils/fileLock.js', () => {
  const readJSON = vi.fn();
  const writeJSON = vi.fn().mockResolvedValue(undefined);
  const updateJSON = vi.fn(async (path, updater) => {
    const current = await readJSON(path);
    const result = await updater(current);
    if (result != null) await writeJSON(path, result);
    return result;
  });
  return { readJSON, writeJSON, updateJSON };
});

import { readJSON, writeJSON } from '../../../utils/fileLock.js';
import {
  getAllUsers,
  findUserByEmail,
  findUserById,
  createUser,
  updateUser,
  setResetToken,
  findUserByResetToken,
  clearResetToken,
} from '../../../services/userService.js';

const SAMPLE_USERS = [
  { id: 'user-1', email: 'alice@test.com', name: 'Alice', password: 'hash1' },
  { id: 'user-2', email: 'bob@test.com', name: 'Bob', password: 'hash2' },
];

beforeEach(() => {
  vi.clearAllMocks();
  readJSON.mockResolvedValue([...SAMPLE_USERS]);
  writeJSON.mockResolvedValue(undefined);
});

describe('getAllUsers', () => {
  it('returns all users', async () => {
    expect(await getAllUsers()).toHaveLength(2);
  });

  it('returns empty array when file does not exist', async () => {
    readJSON.mockResolvedValue(null);
    expect(await getAllUsers()).toEqual([]);
  });
});

describe('findUserByEmail', () => {
  it('finds user regardless of case', async () => {
    const user = await findUserByEmail('Alice@TEST.com');
    expect(user).toBeDefined();
    expect(user.id).toBe('user-1');
  });

  it('returns null for an unknown email', async () => {
    expect(await findUserByEmail('nobody@test.com')).toBeNull();
  });
});

describe('findUserById', () => {
  it('finds user by id', async () => {
    const user = await findUserById('user-2');
    expect(user.name).toBe('Bob');
  });

  it('returns null for an unknown id', async () => {
    expect(await findUserById('nonexistent')).toBeNull();
  });
});

describe('createUser', () => {
  it('appends the user and writes to file', async () => {
    const newUser = { id: 'user-3', email: 'charlie@test.com', name: 'Charlie', password: 'hash3' };
    const result = await createUser(newUser);
    expect(result).toEqual(newUser);

    const [, written] = writeJSON.mock.calls[0];
    expect(written).toHaveLength(3);
    expect(written[2]).toEqual(newUser);
  });
});

describe('updateUser', () => {
  it('merges updates and persists', async () => {
    const result = await updateUser('user-1', { name: 'Alice Updated' });
    expect(result.name).toBe('Alice Updated');
    expect(result.email).toBe('alice@test.com');

    const [, written] = writeJSON.mock.calls[0];
    expect(written.find(u => u.id === 'user-1').name).toBe('Alice Updated');
  });

  it('returns null when user does not exist', async () => {
    expect(await updateUser('ghost', { name: 'Ghost' })).toBeNull();
    expect(writeJSON).not.toHaveBeenCalled();
  });
});

describe('setResetToken', () => {
  it('stores token and expiry on the matching user', async () => {
    const found = await setResetToken('alice@test.com', 'tok123', '2099-01-01T00:00:00.000Z');
    expect(found).toBe(true);
    const [, written] = writeJSON.mock.calls[0];
    const alice = written.find(u => u.id === 'user-1');
    expect(alice.resetToken).toBe('tok123');
    expect(alice.resetTokenExpiry).toBe('2099-01-01T00:00:00.000Z');
  });

  it('returns false and skips write when email not found', async () => {
    const found = await setResetToken('nobody@test.com', 'tok', 'exp');
    expect(found).toBe(false);
    expect(writeJSON).not.toHaveBeenCalled();
  });

  it('is case-insensitive for the email lookup', async () => {
    const found = await setResetToken('ALICE@TEST.COM', 'tok', 'exp');
    expect(found).toBe(true);
  });
});

describe('findUserByResetToken', () => {
  it('returns the user that holds the matching token', async () => {
    readJSON.mockResolvedValue([
      ...SAMPLE_USERS,
      { id: 'user-3', email: 'carol@test.com', resetToken: 'mytoken', resetTokenExpiry: '2099-01-01T00:00:00.000Z' },
    ]);
    const user = await findUserByResetToken('mytoken');
    expect(user.id).toBe('user-3');
  });

  it('returns null when no user holds that token', async () => {
    expect(await findUserByResetToken('unknown')).toBeNull();
  });
});

describe('clearResetToken', () => {
  it('removes resetToken and resetTokenExpiry from the user', async () => {
    readJSON.mockResolvedValue([
      { id: 'user-1', email: 'alice@test.com', resetToken: 'tok', resetTokenExpiry: 'exp' },
    ]);
    await clearResetToken('user-1');
    const [, written] = writeJSON.mock.calls[0];
    const user = written.find(u => u.id === 'user-1');
    expect(user.resetToken).toBeUndefined();
    expect(user.resetTokenExpiry).toBeUndefined();
  });

  it('skips write when user not found', async () => {
    await clearResetToken('ghost');
    expect(writeJSON).not.toHaveBeenCalled();
  });
});
