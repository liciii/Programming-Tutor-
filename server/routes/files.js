import express from 'express';
import multer from 'multer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getProfile, updateProfile } from '../services/profileService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UPLOAD_DIR = join(__dirname, '../data/uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

const router = express.Router();

// Upload a file and attach it to the user's profile
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    const userId = req.user.id;
    const profile = getProfile(userId);
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
    updateProfile(userId, { files });

    res.json({ file: fileMeta });
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
