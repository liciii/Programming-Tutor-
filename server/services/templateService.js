import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { readJSON, writeJSON } from '../utils/fileLock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATES_FILE = join(__dirname, '../data/templates/templates.json');

const DEFAULT_TEMPLATES = [
  {
    id: 'default-explain',
    name: 'Explain a Concept',
    description: 'Used when the learner asks to explain or understand a topic.',
    isDefault: true,
    systemPrompt: `You are an expert programming tutor. The student is a {{programmingLevel}} level programmer learning {{targetLanguage}}.
Their learning style preference is: {{learningStyle}}.
When giving examples, relate them to their interests: {{interests}}.
Their known weaknesses are: {{weaknesses}}. Proactively address these if relevant.
Their strengths are: {{strengths}}.

Your task: Explain the concept clearly and at the right level of depth.
- For beginners: use simple analogies and avoid jargon.
- For intermediate: explain the "why", not just the "how".
- For advanced: discuss edge cases, performance implications, and best practices.
After your explanation, ask ONE concise check-for-understanding question.`,
  },
  {
    id: 'default-exercise',
    name: 'Assign Practice Exercise',
    description: 'Used when the learner wants to practice or do exercises.',
    isDefault: true,
    systemPrompt: `You are an expert programming tutor creating a practice exercise.
Student level: {{programmingLevel}} | Language: {{targetLanguage}} | Learning style: {{learningStyle}}.
Their interests (use for context): {{interests}}.
Current weaknesses to target: {{weaknesses}}.

Your task: Create ONE focused practice exercise.
- State the problem clearly.
- Include expected input/output examples.
- Give a small hint if the student is a beginner.
- Do NOT provide the solution yet. Wait for the student's attempt.
- Keep the exercise achievable in under 20 minutes.`,
  },
  {
    id: 'default-feedback',
    name: 'Code Feedback',
    description: 'Used when the learner submits code for review.',
    isDefault: true,
    systemPrompt: `You are an expert programming tutor reviewing student code.
Student level: {{programmingLevel}} | Language: {{targetLanguage}}.
Known weaknesses: {{weaknesses}}.

Your task: Give constructive, educational feedback on the submitted code.
- First, acknowledge what they did well (be specific).
- Then identify up to 3 improvements (prioritize correctness, then readability, then efficiency).
- For each issue, explain WHY it matters, not just what to fix.
- If the code is correct, suggest one way to make it more idiomatic or efficient.
- End with an encouraging note and one follow-up challenge if they seem ready.`,
  },
  {
    id: 'default-debug',
    name: 'Debugging Help',
    description: 'Used when the learner is stuck on a bug.',
    isDefault: true,
    systemPrompt: `You are an expert programming tutor helping debug code.
Student level: {{programmingLevel}} | Language: {{targetLanguage}}.

Your task: Guide the student to find the bug themselves using the Socratic method.
- Do NOT immediately give away the answer.
- Ask targeted questions that lead them to discover the issue.
- If they are very stuck after 2 exchanges, reveal the bug with a clear explanation.
- Explain the bug type (e.g. off-by-one, null reference) so they recognize it in future.`,
  },
  {
    id: 'default-quiz',
    name: 'Quick Quiz',
    description: 'Used when the learner wants to test their knowledge.',
    isDefault: true,
    systemPrompt: `You are an expert programming tutor administering a quiz.
Student level: {{programmingLevel}} | Language: {{targetLanguage}}.
Topics they are learning: {{topics}}.
Known weaknesses: {{weaknesses}}.

Your task: Ask ONE multiple-choice or short-answer quiz question targeting their current topics.
- Weight questions toward areas of weakness.
- After they answer, explain whether they were right or wrong, and why.
- Keep a running count if multiple questions are asked in the session.`,
  },
];

async function readTemplates() {
  return (await readJSON(TEMPLATES_FILE)) ?? [];
}

async function writeTemplates(templates) {
  return writeJSON(TEMPLATES_FILE, templates);
}

export async function seedDefaultTemplates() {
  const existing = await readTemplates();
  const existingIds = new Set(existing.map(t => t.id));
  const toAdd = DEFAULT_TEMPLATES.filter(t => !existingIds.has(t.id));
  if (toAdd.length > 0) {
    await writeTemplates([...existing, ...toAdd]);
    console.log(`Seeded ${toAdd.length} default templates.`);
  }
}

export async function getAllTemplates(userId) {
  const all = await readTemplates();
  return all.filter(t => t.isDefault || t.ownerId === userId);
}

export async function getTemplateById(id, userId) {
  const all = await readTemplates();
  const t = all.find(t => t.id === id);
  if (!t) return null;
  if (!t.isDefault && t.ownerId !== userId) return null;
  return t;
}

export async function createTemplate(userId, data) {
  const templates = await readTemplates();
  const newTemplate = {
    id: uuidv4(),
    ownerId: userId,
    isDefault: false,
    createdAt: new Date().toISOString(),
    ...data,
  };
  templates.push(newTemplate);
  await writeTemplates(templates);
  return newTemplate;
}

export async function updateTemplate(id, userId, updates) {
  const templates = await readTemplates();
  const idx = templates.findIndex(t => t.id === id);
  if (idx === -1) return { statusCode: 404, error: 'Not found' };
  const t = templates[idx];
  if (t.isDefault) return { statusCode: 403, error: 'Cannot edit default templates' };
  if (t.ownerId !== userId) return { statusCode: 403, error: 'Forbidden' };
  templates[idx] = { ...t, ...updates, updatedAt: new Date().toISOString() };
  await writeTemplates(templates);
  return templates[idx];
}

export async function deleteTemplate(id, userId) {
  const templates = await readTemplates();
  const t = templates.find(t => t.id === id);
  if (!t) return { statusCode: 404, error: 'Not found' };
  if (t.isDefault) return { statusCode: 403, error: 'Cannot delete default templates' };
  if (t.ownerId !== userId) return { statusCode: 403, error: 'Forbidden' };
  await writeTemplates(templates.filter(t => t.id !== id));
  return { success: true };
}

export async function buildSystemPrompt(templateId, profile, userId) {
  const template = await getTemplateById(templateId, userId);
  if (!template) return null;

  const replacements = {
    '{{programmingLevel}}': profile.programmingLevel || 'beginner',
    '{{targetLanguage}}': profile.targetLanguage || 'Python',
    '{{learningStyle}}': profile.learningStyle || 'reading explanations',
    '{{interests}}': (profile.interests || []).join(', ') || 'general topics',
    '{{weaknesses}}': (profile.weaknesses || []).join(', ') || 'none identified yet',
    '{{strengths}}': (profile.strengths || []).join(', ') || 'none identified yet',
    '{{topics}}': (profile.topics || []).join(', ') || 'general programming',
  };

  let prompt = template.systemPrompt;
  for (const [key, val] of Object.entries(replacements)) {
    prompt = prompt.replaceAll(key, val);
  }
  return prompt;
}

export { DEFAULT_TEMPLATES };
