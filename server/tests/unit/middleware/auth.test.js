import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../../../middleware/auth.js';

const SECRET = 'test-secret';

describe('authenticateToken', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    next = vi.fn();
  });

  it('returns 401 when Authorization header is absent', () => {
    authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token part of header is empty', () => {
    req.headers['authorization'] = 'Bearer ';
    authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for a malformed token', () => {
    req.headers['authorization'] = 'Bearer this.is.garbage';
    authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for a token signed with the wrong secret', () => {
    const token = jwt.sign({ id: 'user-1' }, 'wrong-secret');
    req.headers['authorization'] = `Bearer ${token}`;
    authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 403 for an expired token', () => {
    const token = jwt.sign({ id: 'user-1' }, SECRET, { expiresIn: -1 });
    req.headers['authorization'] = `Bearer ${token}`;
    authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('calls next() and attaches decoded user for a valid token', () => {
    const payload = { id: 'user-1', email: 'alice@test.com' };
    const token = jwt.sign(payload, SECRET, { expiresIn: '1h' });
    req.headers['authorization'] = `Bearer ${token}`;
    authenticateToken(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user.id).toBe('user-1');
    expect(req.user.email).toBe('alice@test.com');
  });
});
