import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { findUserByEmail, createUser, findUserById } from '../services/userService.js';
import { createEmptyProfile, getProfile } from '../services/profileService.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name)
      return res.status(400).json({ error: 'Name, email and password are required' });

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

router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await findUserById(decoded.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const profile = await getProfile(user.id);
    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      onboardingComplete: profile?.onboardingComplete || false,
    });
  } catch {
    res.status(403).json({ error: 'Invalid token' });
  }
});

export default router;
