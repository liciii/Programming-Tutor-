import express from 'express';
import multer from 'multer';
import { unlink } from 'fs/promises';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { getProfile, updateProfile } from '../services/profileService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UPLOAD_DIR = join(__dirname, '../data/uploads');
const MAX_FILES_PER_USER = 20;

// MIME whitelist for non-code file types.
const ALLOWED_MIME = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/json',
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

// Extension-based whitelist for code files. 
const CODE_EXTENSIONS = new Set([
  // sys/comp
  '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp',
  '.cs', '.go', '.rs', '.swift',
  // jvm
  '.java', '.kt', '.kts', '.scala', '.groovy',
  // scripting
  '.py', '.rb', '.php', '.lua', '.pl', '.pro',
  // web
  '.js', '.mjs', '.ts', '.jsx', '.tsx',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.vue', '.svelte',
  // shell / config
  '.sh', '.bash', '.zsh', '.fish',
  '.xml', '.yaml', '.yml', '.toml',
  // data / query
  '.sql', '.r',
  // other academic langu
  '.hs', '.ex', '.exs', '.erl', '.ml', '.mli',
  '.m',   // MATLAB / octave
  '.f', '.f90', '.f95', // fortran
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, _file, cb) => cb(null, randomUUID()),
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (CODE_EXTENSIONS.has(ext) || ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

const router = express.Router();

// file download; checks that the file belongs to the requesting user.
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

      const ext = extname(req.file.originalname).toLowerCase();
      const fileMeta = {
        id:         req.file.filename,                   // UUID, also the disk filename
        name:       req.file.originalname,               // original name for display/download
        path:       `/api/files/${req.file.filename}`,   // authenticated download URL
        // normalise code files to text/plain; browser MIME for src files is
        // unreliable and buildFileContext keys off this field for extraction
        mimeType:   CODE_EXTENSIONS.has(ext) ? 'text/plain' : req.file.mimetype,
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
