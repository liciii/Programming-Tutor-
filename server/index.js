import express from 'express';
import cors from 'cors';
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

const app = express();

// Ensure data directories exist
const dirs = ['data/profiles', 'data/templates', 'data/users'];
dirs.forEach(dir => {
  const fullPath = join(__dirname, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

// Seed default templates if none exist
import('./services/templateService.js').then(m => m.seedDefaultTemplates());

app.use(cors({ origin: /^http:\/\/localhost:\d+$/, credentials: true }));
app.use(express.json());

// Public routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/profile', authenticateToken, profileRoutes);
app.use('/api/chat', authenticateToken, chatRoutes);
app.use('/api/templates', authenticateToken, templateRoutes);
app.use('/api/files', authenticateToken, fileRoutes);

app.use('/uploads', express.static(join(__dirname, 'data', 'uploads')));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
