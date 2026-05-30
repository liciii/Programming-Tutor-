import express from 'express';
import multer from 'multer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getProfile, updateProfile } from '../services/profileService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UPLOAD_DIR = join(__dirname, '../data/uploads');

// Explicit MIME whitelist — block HTML/scripts to prevent stored XSS
const ALLOWED_MIME = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/json',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

const router = express.Router();

router.post('/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const userId = req.user.id;
      const profile = await getProfile(userId);
      if (!profile) return res.status(404).json({ error: 'Profile not found' });

      const fileMeta = {
        id: req.file.filename,
        name: req.file.originalname,
        path: `/uploads/${req.file.filename}`,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedAt: new Date().toISOString(),
      };

      const files = [...(profile.files || []), fileMeta];
      await updateProfile(userId, { files });

      res.json({ file: fileMeta });
    } catch (uploadErr) {
      console.error('File upload error:', uploadErr);
      res.status(500).json({ error: 'Upload failed' });
    }
  });
});

export default router;
