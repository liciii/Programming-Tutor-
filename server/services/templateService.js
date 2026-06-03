import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { readJSON, updateJSON } from '../utils/fileLock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATES_FILE = join(__dirname, '../data/templates/templates.json');

const DEFAULT_TEMPLATES = [
  {
    id: 'default-explain',
    name: 'Explain a Concept',
    description: 'Used when the learner asks to explain or understand a topic.',
    isDefault: true,
    systemPrompt: `You are an expert programming tutor using the Socratic method. The student is a {{programmingLevel}} level programmer learning {{targetLanguage}}.
Their learning style preference is: {{learningStyle}}.
When choosing examples or analogies, draw on their real-life interests: {{realLifeInterests}}.
Their known weaknesses are: {{weaknesses}}. Their strengths are: {{strengths}}.

Your goal is to guide the student to construct understanding themselves — do NOT simply explain the concept up front.

How to proceed:
1. Start by asking what they already know or think about the concept. e.g. "Before I explain — what's your current understanding of X? Even a rough guess is fine."
2. Build on whatever they say. If they are partially right, affirm what is correct and ask a follow-up question that nudges them toward the gap. If they are wrong, do not correct directly — ask a question that exposes the contradiction. e.g. "Interesting — if that were true, what would you expect to happen when...?"
3. Use concrete examples and analogies matched to their real-life interests to make abstract ideas tangible. Introduce an example and ask them to reason through it rather than explaining the outcome yourself.
4. Only provide a direct explanation as a last resort — after at least 2–3 exchanges — or if the student is clearly stuck and asks you outright.
5. Close each turn with exactly ONE question that moves understanding forward. Never ask multiple questions at once.

Adjust depth by level:
- Beginner: use everyday analogies, avoid jargon, ask simple "what do you think happens if…" questions.
- Intermediate: probe the "why" behind mechanics, ask them to predict edge cases.
- Advanced: surface subtle invariants, trade-offs, and failure modes through targeted hypotheticals.`,
  },
  {
    id: 'default-exercise',
    name: 'Assign Practice Exercise',
    description: 'Used when the learner wants to practice or do exercises.',
    isDefault: true,
    systemPrompt: `You are an expert programming tutor creating a practice exercise.
Student level: {{programmingLevel}} | Language: {{targetLanguage}} | Learning style: {{learningStyle}}.
Real-life interests to use for context (makes exercises more engaging): {{realLifeInterests}}.
Current weaknesses to target: {{weaknesses}}.

Your task: Create ONE focused practice exercise.
- State the problem clearly.
- Include expected input/output examples.
- Where possible, frame the exercise around one of the student's real-life interests.
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

// In-memory cache for the default template set — these never change at runtime.
// Only user-custom templates require a disk read.
const DEFAULT_TEMPLATE_MAP = new Map(DEFAULT_TEMPLATES.map(t => [t.id, t]));

async function readCustomTemplates() {
  const all = (await readJSON(TEMPLATES_FILE)) ?? [];
  return all.filter(t => !t.isDefault);
}

async function writeCustomTemplates(templates) {
  return updateJSON(TEMPLATES_FILE, (existing) => {
    const defaults = (existing ?? []).filter(t => t.isDefault);
    return [...defaults, ...templates];
  });
}

export async function seedDefaultTemplates() {
  let added = 0;
  let updated = 0;

  await updateJSON(TEMPLATES_FILE, (current) => {
    const existing = current ?? [];
    const map = new Map(existing.map(t => [t.id, t]));
    let changed = false;

    for (const tmpl of DEFAULT_TEMPLATES) {
      const stored = map.get(tmpl.id);
      if (!stored) {
        map.set(tmpl.id, tmpl);
        added++;
        changed = true;
      } else if (stored.systemPrompt !== tmpl.systemPrompt) {
        map.set(tmpl.id, { ...stored, ...tmpl });
        updated++;
        changed = true;
      }
    }

    // Return null to skip the write if nothing changed.
    return changed ? [...map.values()] : null;
  });

  if (added > 0) console.log(`Seeded ${added} default templates.`);
  if (updated > 0) console.log(`Updated ${updated} default templates.`);
}

export async function getAllTemplates(userId) {
  const custom = await readCustomTemplates();
  return [
    ...DEFAULT_TEMPLATES,
    ...custom.filter(t => t.ownerId === userId),
  ];
}

export async function getTemplateById(id, userId) {
  if (DEFAULT_TEMPLATE_MAP.has(id)) return DEFAULT_TEMPLATE_MAP.get(id);
  const custom = await readCustomTemplates();
  const t = custom.find(t => t.id === id);
  if (!t) return null;
  if (t.ownerId !== userId) return null;
  return t;
}

export async function createTemplate(userId, data) {
  const newTemplate = {
    id: uuidv4(),
    ownerId: userId,
    isDefault: false,
    createdAt: new Date().toISOString(),
    ...data,
  };
  await updateJSON(TEMPLATES_FILE, (existing) => [...(existing ?? []), newTemplate]);
  return newTemplate;
}

export async function updateTemplate(id, userId, updates) {
  if (DEFAULT_TEMPLATE_MAP.has(id)) return { statusCode: 403, error: 'Cannot edit default templates' };

  let result = { statusCode: 404, error: 'Not found' };
  await updateJSON(TEMPLATES_FILE, (templates) => {
    const list = templates ?? [];
    const idx = list.findIndex(t => t.id === id);
    if (idx === -1) return list;
    if (list[idx].ownerId !== userId) {
      result = { statusCode: 403, error: 'Forbidden' };
      return list;
    }
    list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
    result = list[idx];
    return list;
  });
  return result;
}

export async function deleteTemplate(id, userId) {
  if (DEFAULT_TEMPLATE_MAP.has(id)) return { statusCode: 403, error: 'Cannot delete default templates' };

  let result = { statusCode: 404, error: 'Not found' };
  await updateJSON(TEMPLATES_FILE, (templates) => {
    const list = templates ?? [];
    const t = list.find(t => t.id === id);
    if (!t) return list;
    if (t.ownerId !== userId) {
      result = { statusCode: 403, error: 'Forbidden' };
      return list;
    }
    result = { success: true };
    return list.filter(t => t.id !== id);
  });
  return result;
}

export async function buildSystemPrompt(templateId, profile, userId) {
  const template = await getTemplateById(templateId, userId);
  if (!template) return null;

  const replacements = {
    '{{programmingLevel}}':  profile.programmingLevel  || 'beginner',
    '{{targetLanguage}}':    profile.targetLanguage    || 'Python',
    '{{learningStyle}}':     profile.learningStyle     || 'reading explanations',
    '{{realLifeInterests}}': (profile.realLifeInterests || []).join(', ') || 'general topics',
    '{{weaknesses}}':        (profile.weaknesses       || []).join(', ') || 'none identified yet',
    '{{strengths}}':         (profile.strengths        || []).join(', ') || 'none identified yet',
    '{{topics}}':            (profile.topics           || []).join(', ') || 'general programming',
  };

  let prompt = template.systemPrompt;
  for (const [key, val] of Object.entries(replacements)) {
    prompt = prompt.replaceAll(key, val);
  }
  return prompt;
}

export { DEFAULT_TEMPLATES };
