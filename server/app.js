import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import chatRoutes from './routes/chat.js';
import templateRoutes from './routes/templates.js';
import fileRoutes from './routes/files.js';
import { authenticateToken } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dirs = ['data/profiles', 'data/templates', 'data/users', 'data/uploads'];
dirs.forEach(dir => {
  const fullPath = join(__dirname, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc:    ["'self'", 'data:'],
      objectSrc:  ["'none'"],
      frameSrc:   ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(compression());

const corsOrigin = process.env.ALLOWED_ORIGIN
  ?? (process.env.NODE_ENV === 'production' ? false : /^http:\/\/localhost:\d+$/);
app.use(cors({ origin: corsOrigin, credentials: true }));

app.use(express.json());

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset attempts. Please wait before trying again.' },
});

app.use('/api/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/profile', authenticateToken, profileRoutes);
app.use('/api/chat', authenticateToken, chatRoutes);
app.use('/api/templates', authenticateToken, templateRoutes);
app.use('/api/files', authenticateToken, fileRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

const publicDir = join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/^(?!\/api).*$/, (_req, res) => res.sendFile(join(publicDir, 'index.html')));
}

export default app;
