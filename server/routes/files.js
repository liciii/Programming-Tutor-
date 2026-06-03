import express from 'express';
import multer from 'multer';
import { unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { getProfile, updateProfile } from '../services/profileService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UPLOAD_DIR = join(__dirname, '../data/uploads');
const MAX_FILES_PER_USER = 20;

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
  // Use an opaque UUID as the disk filename so the URL is unguessable.
  // The original name is preserved in profile metadata only.
  filename: (_req, _file, cb) => cb(null, randomUUID()),
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

// Authenticated file download — checks that the file belongs to the requesting user.
router.get('/:fileId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileId } = req.params;

    const profile = await getProfile(userId);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const file = (profile.files || []).find(f => f.id === fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const diskPath = join(UPLOAD_DIR, fileId);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(diskPath, (err) => {
      if (err && !res.headersSent) res.status(500).json({ error: 'Download failed' });
    });
  } catch (err) {
    console.error('File download error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
  }
});

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

      const existingFiles = profile.files || [];
      if (existingFiles.length >= MAX_FILES_PER_USER) {
        await unlink(req.file.path).catch(() => {});
        return res.status(400).json({ error: `File limit reached (max ${MAX_FILES_PER_USER} files). Delete some files before uploading more.` });
      }

      const fileMeta = {
        id:         req.file.filename,                   // UUID — also the disk filename
        name:       req.file.originalname,               // original name for display/download
        path:       `/api/files/${req.file.filename}`,   // authenticated download URL
        mimeType:   req.file.mimetype,
        size:       req.file.size,
        uploadedAt: new Date().toISOString(),
      };

      const files = [...existingFiles, fileMeta];
      await updateProfile(userId, { files });

      res.json({ file: fileMeta });
    } catch (uploadErr) {
      console.error('File upload error:', uploadErr);
      res.status(500).json({ error: 'Upload failed' });
    }
  });
});

router.delete('/:fileId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileId } = req.params;

    const profile = await getProfile(userId);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const file = (profile.files || []).find(f => f.id === fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });

    // Remove from disk (best-effort — don't fail if already gone)
    const diskPath = join(UPLOAD_DIR, fileId);
    await unlink(diskPath).catch(() => {});

    const files = (profile.files || []).filter(f => f.id !== fileId);
    await updateProfile(userId, { files });

    res.json({ success: true });
  } catch (err) {
    console.error('File delete error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

export default router;
