import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { findUserByEmail, createUser, findUserById, setResetToken, findUserByResetToken, clearResetToken, updateUser } from '../services/userService.js';
import { createEmptyProfile, getProfile } from '../services/profileService.js';
import { authenticateToken } from '../middleware/auth.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name)
      return res.status(400).json({ error: 'Name, email and password are required' });

    if (!EMAIL_RE.test(email))
      return res.status(400).json({ error: 'Invalid email address' });

    if (password.length < MIN_PASSWORD_LENGTH)
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });

    if (await findUserByEmail(email))
      return res.status(409).json({ error: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await createUser({
      id: uuidv4(),
      email: email.toLowerCase(),
      name,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
    });

    await createEmptyProfile(user.id);

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    const user = await findUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const profile = await getProfile(user.id);

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
      onboardingComplete: profile?.onboardingComplete || false,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

    const found = await setResetToken(email, token, expiry);

    // send email if user exists, don't reveal whether email is registered 
    if (found) {
      await sendPasswordResetEmail(email.toLowerCase(), token);
    }

    res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot-password error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password)
      return res.status(400).json({ error: 'Token and new password are required' });

    if (password.length < MIN_PASSWORD_LENGTH)
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });

    const user = await findUserByResetToken(token);
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset link' });

    if (new Date(user.resetTokenExpiry) < new Date())
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });

    const hashedPassword = await bcrypt.hash(password, 12);
    await updateUser(user.id, { password: hashedPassword });
    await clearResetToken(user.id);

    res.json({ message: 'Password updated successfully. You can now sign in.' });
  } catch (err) {
    console.error('Reset-password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// reuse authetoken instead of duplicating JWT verification logic.
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const profile = await getProfile(user.id);
    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      onboardingComplete: profile?.onboardingComplete || false,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
