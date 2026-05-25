import express from 'express';
import {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../services/templateService.js';

const router = express.Router();

router.get('/', (req, res) => {
  const templates = getAllTemplates(req.user.id);
  res.json(templates);
});

router.get('/:id', (req, res) => {
  const t = getTemplateById(req.params.id, req.user.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(t);
});

router.post('/', (req, res) => {
  const { name, description, systemPrompt } = req.body;
  if (!name || !systemPrompt)
    return res.status(400).json({ error: 'Name and systemPrompt required' });
  const t = createTemplate(req.user.id, { name, description, systemPrompt });
  res.status(201).json(t);
});

router.put('/:id', (req, res) => {
  const result = updateTemplate(req.params.id, req.user.id, req.body);
  if (result?.error) return res.status(403).json(result);
  if (!result) return res.status(404).json({ error: 'Not found' });
  res.json(result);
});

router.delete('/:id', (req, res) => {
  const result = deleteTemplate(req.params.id, req.user.id);
  if (result?.error) return res.status(403).json(result);
  res.json(result);
});

export default router;
