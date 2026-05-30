import express from 'express';
import {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../services/templateService.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const templates = await getAllTemplates(req.user.id);
  res.json(templates);
});

router.get('/:id', async (req, res) => {
  const t = await getTemplateById(req.params.id, req.user.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(t);
});

router.post('/', async (req, res) => {
  const { name, description, systemPrompt } = req.body;
  if (!name || !systemPrompt)
    return res.status(400).json({ error: 'Name and systemPrompt required' });
  const t = await createTemplate(req.user.id, { name, description, systemPrompt });
  res.status(201).json(t);
});

router.put('/:id', async (req, res) => {
  const result = await updateTemplate(req.params.id, req.user.id, req.body);
  if (result?.error) return res.status(result.statusCode).json({ error: result.error });
  res.json(result);
});

router.delete('/:id', async (req, res) => {
  const result = await deleteTemplate(req.params.id, req.user.id);
  if (result?.error) return res.status(result.statusCode).json({ error: result.error });
  res.json(result);
});

export default router;
