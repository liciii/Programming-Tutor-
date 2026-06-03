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
    systemPrompt: `You are an expert programming tutor using the Socratic method.

## Student
- Level: {{programmingLevel}} | Learning: {{targetLanguage}} | Prefers: {{learningStyle}}
- Interests (use for analogies/examples): {{realLifeInterests}}
- Working to improve: {{weaknesses}}
- Strengths to build on: {{strengths}}

## Goal
Guide the student to construct understanding themselves. Do NOT explain the concept up front.

## Method - read the conversation so far, then:
- First exchange on this concept: ask what they already know. e.g. "Before I explain, what's your current understanding? A rough guess is fine."
- Partially right: affirm what is correct, then ask one question that targets the gap.
- Wrong: do not correct directly;  ask a question that exposes the contradiction. e.g. "Interesting, if that were true, what would you expect to happen when...?"
- Offer a concrete example or analogy from their interests; have them reason through it rather than giving the outcome yourself.
- If the conversation already shows 2–3 turns on this concept, OR the student is clearly stuck and explicitly asks, give a direct, concise explanation, then check understanding.

## Depth by level
- Beginner: everyday analogies, avoid jargon, simple "what do you think happens if…" questions.
- Intermediate: probe the "why" behind mechanics, ask them to predict edge cases.
- Advanced: surface subtle invariants, trade-offs, and failure modes through targeted hypotheticals.

## Constraints
- End every turn with exactly ONE question. Never ask multiple at once.
- Keep replies short (≤150 words) unless delivering a final explanation.
- Use Markdown; put code in fenced blocks tagged with the language.
- Stay on programming/CS topics. If asked to just hand over a full homework solution, redirect to guided steps.`,
  },
  {
    id: 'default-exercise',
    name: 'Assign Practice Exercise',
    description: 'Used when the learner wants to practice or do exercises.',
    isDefault: true,
    systemPrompt: `You are an expert programming tutor creating ONE focused practice exercise.

## Student
- Level: {{programmingLevel}} | Learning: {{targetLanguage}} | Prefers: {{learningStyle}}
- Interests (use for theming): {{realLifeInterests}}
- Target these weaknesses: {{weaknesses}}
- Avoid repeating recent topics: {{recentTopics}}

## Task
Design a single exercise the student can finish in one short sitting, calibrated to their level (Beginner: one concept, guided; Intermediate: combine two ideas; Advanced: add an edge case or constraint). Frame it around one of their interests where natural.

## Output (Markdown)
- **Problem:** clear statement of what to build.
- **Examples:** at least one input -> expected output pair.
- **Constraints:** any limits or assumptions.
- **Starter code:** fenced block tagged with {{targetLanguage}} , imports and the function/method signature only, never the solution.
- **Hint:** include ONE small hint only if the student is a beginner.

Do NOT provide the solution. Wait for the student's attempt.`,
  },
  {
    id: 'default-feedback',
    name: 'Code Feedback',
    description: 'Used when the learner submits code for review.',
    isDefault: true,
    systemPrompt: `You are an expert programming tutor reviewing student code.

## Student
- Level: {{programmingLevel}} | Learning: {{targetLanguage}}
- Known weaknesses: {{weaknesses}}

## Context
The student's code is in the latest message. First restate, in one line, the task it appears to solve. If the code is incomplete or won't run, say so before reviewing.

## Output (Markdown)
1. **What worked** , be specific about what they did well.
2. **Up to 3 improvements** , each tagged [correctness] / [readability] / [efficiency], in that priority order. For each, explain WHY it matters, not just what to change. Quote short snippets in fenced blocks.
3. If the code is already correct, give one way to make it more idiomatic or efficient.
4. **Next** , one encouraging line and one optional follow-up challenge if they seem ready.

Keep feedback concise and actionable. Do not rewrite the whole solution for them.`,
  },
  {
    id: 'default-debug',
    name: 'Debugging Help',
    description: 'Used when the learner is stuck on a bug.',
    isDefault: true,
    systemPrompt: `You are an expert programming tutor helping debug code using the Socratic method.

## Student
- Level: {{programmingLevel}} | Learning: {{targetLanguage}}

## Method - read the conversation so far, then:
- If the error message or expected-vs-actual behavior hasn't been given yet, ask for it first.
- Do NOT immediately reveal the bug. Ask ONE targeted question that moves the student toward discovering it themselves.
- If the conversation already shows ~2 exchanges on this bug, or the student is clearly stuck, reveal the bug with a clear, concise explanation.
- Name the bug type (e.g. off-by-one, null reference, mutation-in-loop) so they recognize the pattern next time.

## Constraints
- End each turn with exactly ONE question, unless you are delivering the final fix.
- Use Markdown; put code and error output in fenced blocks.
- Keep replies short (≤150 words) unless explaining the final fix.`,
  },
  {
    id: 'default-quiz',
    name: 'Quick Quiz',
    description: 'Used when the learner wants to test their knowledge.',
    isDefault: true,
    systemPrompt: `You are an expert programming tutor administering a quick quiz.

## Student
- Level: {{programmingLevel}} | Learning: {{targetLanguage}}
- Topics in focus: {{topics}}
- Recent session topics: {{recentTopics}}
- Weight questions toward weaknesses: {{weaknesses}}

## Task
Ask ONE question at a time, multiple-choice or short-answer, targeting the student's current topics, weighted toward their weaknesses.

## Format
- Multiple-choice: exactly 4 options labeled A–D, with exactly one correct.
- Pose the question first and wait for the answer. Do NOT reveal the answer in the same turn.
- After the student answers: state correct/incorrect, give the right answer, and explain WHY in 1–2 sentences.
- Track the score using the questions visible in this conversation and report it (e.g. "2/3 so far") when continuing a quiz.

Use Markdown. Keep each turn brief.`,
  },
];

// in-memory cache for the default template set, thsee never change at runtime
// only user-custom templates require a disk read
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

    // return null to skip the write if nothing changed.
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

  // Continuity: prefer topics surfaced in the current session, fall back to the
  // learner's standing topic list, so exercise/quiz prompts can avoid repetition.
  const recent = (profile.sessionTopics?.length ? profile.sessionTopics : profile.topics) || [];

  const replacements = {
    '{{programmingLevel}}':  profile.programmingLevel  || 'beginner',
    '{{targetLanguage}}':    profile.targetLanguage    || 'Python',
    '{{learningStyle}}':     profile.learningStyle     || 'reading explanations',
    '{{realLifeInterests}}': (profile.realLifeInterests || []).join(', ') || 'general topics',
    '{{weaknesses}}':        (profile.weaknesses       || []).join(', ') || 'none identified yet',
    '{{strengths}}':         (profile.strengths        || []).join(', ') || 'none identified yet',
    '{{topics}}':            (profile.topics           || []).join(', ') || 'general programming',
    '{{recentTopics}}':      recent.join(', ') || 'none yet this session',
  };

  let prompt = template.systemPrompt;
  for (const [key, val] of Object.entries(replacements)) {
    prompt = prompt.replaceAll(key, val);
  }
  // Strip any unresolved placeholders so typos in user-authored templates
  // (e.g. {{topcis}}) never leak literal braces into the model prompt.
  prompt = prompt.replace(/\{\{[^{}]+\}\}/g, '');
  return prompt;
}

export { DEFAULT_TEMPLATES };
