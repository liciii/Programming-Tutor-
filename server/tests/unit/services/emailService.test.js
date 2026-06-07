import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';


const _mocks = {
  sendMail: vi.fn(),
  close: vi.fn(),
  createTransport: vi.fn(),
};

vi.mock('nodemailer', () => {
  return {
    default: {
      createTransport: (...args) => {
        _mocks.createTransport(...args);
        return {
          sendMail: (...a) => _mocks.sendMail(...a),
          close: (...a) => _mocks.close(...a),
        };
      },
    },
  };
});

import { sendPasswordResetEmail } from '../../../services/emailService.js';

const SMTP_ENV = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_USER: 'user@example.com',
  SMTP_PASS: 'secret',
};

function setSmtpEnv(overrides = {}) {
  const merged = { ...SMTP_ENV, ...overrides };
  for (const [k, v] of Object.entries(merged)) {
    process.env[k] = v;
  }
}

function clearSmtpEnv() {
  for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'CLIENT_URL']) {
    delete process.env[k];
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  setSmtpEnv();
});

afterEach(() => {
  clearSmtpEnv();
});

//config errors
describe('sendPasswordResetEmail — missing SMTP configuration', () => {
  it('rejects when SMTP_HOST is not set', async () => {
    clearSmtpEnv();
    process.env.SMTP_USER = 'user@example.com';
    process.env.SMTP_PASS = 'secret';

    await expect(sendPasswordResetEmail('a@b.com', 'tok')).rejects.toThrow(/SMTP not configured/);
    expect(_mocks.createTransport).not.toHaveBeenCalled();
  });

  it('rejects when SMTP_USER is not set', async () => {
    clearSmtpEnv();
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PASS = 'secret';

    await expect(sendPasswordResetEmail('a@b.com', 'tok')).rejects.toThrow(/SMTP not configured/);
  });

  it('rejects when SMTP_PASS is not set', async () => {
    clearSmtpEnv();
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'user@example.com';

    await expect(sendPasswordResetEmail('a@b.com', 'tok')).rejects.toThrow(/SMTP not configured/);
  });
});

describe('sendPasswordResetEmail — successful send', () => {
  it('resolves with the transport info object on success', async () => {
    const fakeInfo = { messageId: 'msg-1' };
    _mocks.sendMail.mockImplementation((_opts, cb) => cb(null, fakeInfo));

    const result = await sendPasswordResetEmail('recipient@test.com', 'reset-token-abc');

    expect(result).toEqual(fakeInfo);
    expect(_mocks.sendMail).toHaveBeenCalledOnce();
    expect(_mocks.close).toHaveBeenCalledOnce();
  });

  it('passes the correct recipient address to sendMail', async () => {
    _mocks.sendMail.mockImplementation((_opts, cb) => cb(null, {}));

    await sendPasswordResetEmail('alice@test.com', 'tok123');

    const mailOptions = _mocks.sendMail.mock.calls[0][0];
    expect(mailOptions.to).toBe('alice@test.com');
  });

  it('includes the reset token in the HTML body', async () => {
    _mocks.sendMail.mockImplementation((_opts, cb) => cb(null, {}));

    await sendPasswordResetEmail('alice@test.com', 'my-special-token');

    const mailOptions = _mocks.sendMail.mock.calls[0][0];
    expect(mailOptions.html).toContain('my-special-token');
  });

  it('constructs the reset URL from CLIENT_URL env var when set', async () => {
    process.env.CLIENT_URL = 'https://myapp.io';
    _mocks.sendMail.mockImplementation((_opts, cb) => cb(null, {}));

    await sendPasswordResetEmail('alice@test.com', 'tok');

    const mailOptions = _mocks.sendMail.mock.calls[0][0];
    expect(mailOptions.html).toContain('https://myapp.io/reset-password?token=tok');
  });

  it('falls back to localhost CLIENT_URL when env var is absent', async () => {
    delete process.env.CLIENT_URL;
    _mocks.sendMail.mockImplementation((_opts, cb) => cb(null, {}));

    await sendPasswordResetEmail('alice@test.com', 'tok');

    const mailOptions = _mocks.sendMail.mock.calls[0][0];
    expect(mailOptions.html).toContain('http://localhost:5173/reset-password?token=tok');
  });

  it('uses SMTP_FROM as the from address when set', async () => {
    process.env.SMTP_FROM = 'noreply@myapp.io';
    _mocks.sendMail.mockImplementation((_opts, cb) => cb(null, {}));

    await sendPasswordResetEmail('alice@test.com', 'tok');

    const mailOptions = _mocks.sendMail.mock.calls[0][0];
    expect(mailOptions.from).toBe('noreply@myapp.io');
  });

  it('falls back to SMTP_USER as the from address when SMTP_FROM is not set', async () => {
    delete process.env.SMTP_FROM;
    _mocks.sendMail.mockImplementation((_opts, cb) => cb(null, {}));

    await sendPasswordResetEmail('alice@test.com', 'tok');

    const mailOptions = _mocks.sendMail.mock.calls[0][0];
    expect(mailOptions.from).toBe('user@example.com');
  });

  it('creates the transport with port 465 when SMTP_PORT=465', async () => {
    process.env.SMTP_PORT = '465';
    _mocks.sendMail.mockImplementation((_opts, cb) => cb(null, {}));

    await sendPasswordResetEmail('alice@test.com', 'tok');

    const transportArgs = _mocks.createTransport.mock.calls[0][0];
    expect(transportArgs.port).toBe(465);
    expect(transportArgs.secure).toBe(true);
  });

  it('uses port 587 and secure=false when SMTP_PORT is 587', async () => {
    _mocks.sendMail.mockImplementation((_opts, cb) => cb(null, {}));

    await sendPasswordResetEmail('alice@test.com', 'tok');

    const transportArgs = _mocks.createTransport.mock.calls[0][0];
    expect(transportArgs.port).toBe(587);
    expect(transportArgs.secure).toBe(false);
  });

  it('defaults to port 587 when SMTP_PORT is not set', async () => {
    delete process.env.SMTP_PORT;
    _mocks.sendMail.mockImplementation((_opts, cb) => cb(null, {}));

    await sendPasswordResetEmail('alice@test.com', 'tok');

    const transportArgs = _mocks.createTransport.mock.calls[0][0];
    expect(transportArgs.port).toBe(587);
  });
});


describe('sendPasswordResetEmail — transport / sendMail errors', () => {
  it('rejects and still calls transporter.close when sendMail returns an error', async () => {
    const smtpError = new Error('Connection refused');
    _mocks.sendMail.mockImplementation((_opts, cb) => cb(smtpError, null));

    await expect(sendPasswordResetEmail('alice@test.com', 'tok')).rejects.toThrow('Connection refused');
    expect(_mocks.close).toHaveBeenCalledOnce();
  });

  it('rejects with the original error from sendMail', async () => {
    const authError = new Error('Invalid credentials');
    _mocks.sendMail.mockImplementation((_opts, cb) => cb(authError, null));

    const err = await sendPasswordResetEmail('alice@test.com', 'tok').catch(e => e);
    expect(err.message).toBe('Invalid credentials');
  });
});
