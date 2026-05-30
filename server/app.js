import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import chatRoutes from './routes/chat.js';
import templateRoutes from './routes/templates.js';
import fileRoutes from './routes/files.js';
import { authenticateToken } from './middleware/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dirs = ['data/profiles', 'data/templates', 'data/users', 'data/uploads'];
dirs.forEach(dir => {
  const fullPath = join(__dirname, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

const app = express();

// CORS: allow localhost in dev; set ALLOWED_ORIGIN env var for production
const corsOrigin = process.env.ALLOWED_ORIGIN ?? /^http:\/\/localhost:\d+$/;
app.use(cors({ origin: corsOrigin, credentials: true }));

app.use(express.json());

// Brute-force protection on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/profile', authenticateToken, profileRoutes);
app.use('/api/chat', authenticateToken, chatRoutes);
app.use('/api/templates', authenticateToken, templateRoutes);
app.use('/api/files', authenticateToken, fileRoutes);

// Serve uploads as attachments to prevent in-browser rendering of uploaded files (XSS mitigation)
app.use('/uploads', express.static(join(__dirname, 'data', 'uploads'), {
  setHeaders: (res) => {
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Serve built React client when running in production (Docker)
const publicDir = join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/^(?!\/api).*$/, (_req, res) => res.sendFile(join(publicDir, 'index.html')));
}

export default app;
