import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getProfile, updateProfile, appendChatHistory, appendDiagnosticEvidence } from '../services/profileService.js';
import { chatCompletion } from '../services/llmService.js';

const router = express.Router();

// Fields a user is permitted to update directly.
// Anything not in this set is silently ignored, preventing privilege escalation.
const MUTABLE_FIELDS = new Set([
  'programmingLevel', 'targetLanguage', 'learningStyle',
  'topics', 'realLifeInterests', 'strengths', 'weaknesses',
  'preferredLLM', 'customApiKeys', 'externalSources',
]);

const MAX_ARRAY_ITEMS = 50;
const MAX_ITEM_LENGTH = 200;
const MAX_URL_LENGTH = 500;

function sanitizeStringArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .slice(0, MAX_ARRAY_ITEMS)
    .map(s => String(s).slice(0, MAX_ITEM_LENGTH))
    .filter(Boolean);
}

function sanitizeProfileUpdate(body, existing) {
  const result = {};
  for (const key of MUTABLE_FIELDS) {
    if (key in body) result[key] = body[key];
  }

  // Validate customApiKeys — only update a provider's key if the user explicitly
  // typed a new non-empty value; an empty string means "keep whatever is stored".
  if (result.customApiKeys !== undefined) {
    const incoming = result.customApiKeys;
    const prev = existing?.customApiKeys || {};
    result.customApiKeys = {
      openai:    (typeof incoming.openai    === 'string' && incoming.openai.trim())    ? incoming.openai.trim()    : (prev.openai    || ''),
      gemini:    (typeof incoming.gemini    === 'string' && incoming.gemini.trim())    ? incoming.gemini.trim()    : (prev.gemini    || ''),
      anthropic: (typeof incoming.anthropic === 'string' && incoming.anthropic.trim()) ? incoming.anthropic.trim() : (prev.anthropic || ''),
    };
  }

  // Validate externalSources — require valid http/https URL, enforce length limits
  if (result.externalSources !== undefined) {
    if (!Array.isArray(result.externalSources)) {
      delete result.externalSources;
    } else {
      result.externalSources = result.externalSources
        .filter(s => s && typeof s.url === 'string')
        .filter(s => {
          try {
            const u = new URL(s.url);
            return u.protocol === 'https:' || u.protocol === 'http:';
          } catch { return false; }
        })
        .slice(0, MAX_ARRAY_ITEMS)
        .map(s => ({
          id:      s.id || uuidv4(),
          url:     s.url.slice(0, MAX_URL_LENGTH),
          addedAt: s.addedAt || new Date().toISOString(),
        }));
    }
  }

  // Enforce size limits on all string array fields
  for (const field of ['topics', 'realLifeInterests', 'strengths', 'weaknesses']) {
    if (field in result) result[field] = sanitizeStringArray(result[field]);
  }

  return result;
}

router.get('/', async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    // Strip actual key values — return only which providers have a key configured
    const { customApiKeys, ...safeProfile } = profile;
    safeProfile.customApiKeysSet = Object.keys(customApiKeys || {}).filter(k => customApiKeys[k]);
    res.json(safeProfile);
  } catch (err) {
    console.error('GET /profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/', async (req, res) => {
  try {
    const existing = await getProfile(req.user.id);
    const safeUpdates = sanitizeProfileUpdate(req.body, existing);
    const updated = await updateProfile(req.user.id, safeUpdates);
    const { customApiKeys, ...safe } = updated;
    safe.customApiKeysSet = Object.keys(customApiKeys || {}).filter(k => customApiKeys[k]);
    res.json(safe);
  } catch (err) {
    console.error('PUT /profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/chat-history', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages are required' });
    }
    const updated = await appendChatHistory(req.user.id, messages);
    res.json({ success: true });
  } catch (err) {
    console.error('POST /profile/chat-history error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// ONBOARDING SYSTEM
//
// Three-phase approach to avoid relying on inaccurate self-evaluation:
//
// PHASE 1 — INTAKE (messages 1–2)
//   Collect language, topics, learning style, real-life interests, and
//   coding goals conversationally.  Ask for a rough self-assessed level but
//   treat it only as a prior.
//
// PHASE 2 — DIAGNOSTIC (messages 3–5)
//   Embed 2 targeted coding questions matched to their stated language.
//   Questions are open-ended so vocabulary, accuracy, and confidence can
//   all be observed.  The LLM evaluates responses and records evidence.
//
// PHASE 3 — CALIBRATION & COMMIT
//   Reconcile self-reported level with diagnostic evidence.
//   If they diverge, the evidence wins.  The student never sees this logic.
//
// Phase is persisted in the profile (onboardingPhase field) so it can only
// advance forward — never jump back or skip ahead due to message count tricks.
// ---------------------------------------------------------------------------

const ONBOARDING_VALID_ROLES = new Set(['user', 'assistant']);
const ONBOARDING_MAX_MSG_LENGTH = 10_000;

router.post('/onboarding/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    for (const m of messages) {
      if (!m || typeof m.content !== 'string' || !ONBOARDING_VALID_ROLES.has(m.role)) {
        return res.status(400).json({ error: 'Each message must have a valid role and string content' });
      }
      if (m.content.length > ONBOARDING_MAX_MSG_LENGTH) {
        return res.status(400).json({ error: `Message content exceeds ${ONBOARDING_MAX_MSG_LENGTH} characters` });
      }
    }

    const profile = await getProfile(req.user.id);

    const userTurns = messages.filter(m => m.role === 'user').length;
    const derivedPhase = userTurns <= 2 ? 1 : userTurns <= 5 ? 2 : 3;
    // Reset stored phase for a fresh session (≤1 user turn) so a previously
    // completed or partially-completed profile never skips the user forward.
    // For later turns the stored phase acts as a floor so the user can't
    // replay old message counts to force an earlier phase.
    const storedPhase = userTurns <= 1 ? 1 : (profile?.onboardingPhase ?? 1);
    const phase = Math.max(derivedPhase, storedPhase);

    // Advance the stored phase if we've moved forward.
    if (phase > storedPhase) {
      await updateProfile(req.user.id, { onboardingPhase: phase });
    }

    const collectedSoFar = {
      selfReportedLevel:   profile?.selfReportedLevel   || null,
      targetLanguage:      profile?.targetLanguage      || null,
      topics:              profile?.topics              || null,
      learningStyle:       profile?.learningStyle       || null,
      realLifeInterests:   profile?.realLifeInterests   || null,
      diagnosticEvidence:  profile?.diagnosticEvidence  || [],
    };

    const systemPrompt = buildOnboardingPrompt(phase, collectedSoFar);
    const reply = await chatCompletion({ messages, systemPrompt });

    if (phase === 1) {
      const partial = await extractPartialProfile(messages, reply);
      if (partial) await updateProfile(req.user.id, partial);
      return res.json({ reply, onboardingComplete: false, phase: 1 });
    }

    if (phase === 2) {
      const evidence = await extractDiagnosticEvidence(messages, reply);
      // appendDiagnosticEvidence is atomic — reads current array inside the updater
      if (evidence) await appendDiagnosticEvidence(req.user.id, evidence);
      return res.json({ reply, onboardingComplete: false, phase: 2 });
    }

    // Phase 3 — reconcile and commit
    const END_MARKER = 'END_ONBOARDING:';
    if (reply.includes(END_MARKER)) {
      const markerIdx = reply.indexOf(END_MARKER);
      const jsonStr = reply.substring(markerIdx + END_MARKER.length).trim();

      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.json({
          reply: reply.substring(0, markerIdx).trim() || "Almost there! Let me gather just a bit more.",
          onboardingComplete: false,
          phase: 3,
        });
      }

      let extracted;
      try {
        extracted = JSON.parse(jsonMatch[0]);
      } catch {
        return res.json({
          reply: reply.substring(0, markerIdx).trim() || "Almost there! Let me gather just a bit more.",
          onboardingComplete: false,
          phase: 3,
        });
      }

      const finalProfile = {
        ...extracted,
        selfReportedLevel: collectedSoFar.selfReportedLevel,
        diagnosticEvidence: profile?.diagnosticEvidence || [],
        onboardingComplete: true,
        onboardingPhase: 3,
        calibrationNote: extracted.programmingLevel !== collectedSoFar.selfReportedLevel
          ? `Self-reported ${collectedSoFar.selfReportedLevel}, calibrated to ${extracted.programmingLevel} based on diagnostic responses.`
          : `Self-reported level confirmed by diagnostic.`,
      };

      await updateProfile(req.user.id, finalProfile);

      const cleanReply = reply.substring(0, markerIdx).trim() ||
        "Great — I've got a clear picture of where you are. Your personalised tutor is ready. Let's get started!";

      return res.json({ reply: cleanReply, onboardingComplete: true, profile: finalProfile });
    }

    res.json({ reply, onboardingComplete: false, phase: 3 });

  } catch (err) {
    console.error('Onboarding error:', err);
    res.status(500).json({ error: 'Failed to get response' });
  }
});

// ---------------------------------------------------------------------------
// PROMPT BUILDERS
// ---------------------------------------------------------------------------

function buildOnboardingPrompt(phase, collected) {
  const base = `You are a warm, friendly onboarding assistant for an intelligent programming tutor called CodeTutor AI.
Your job is to build an accurate learner profile through natural conversation — never make it feel like a form.
Ask one or two questions at a time. Be encouraging and supportive throughout.

Current collected information:
${JSON.stringify(collected, null, 2)}
`;

  if (phase === 1) {
    return base + `
PHASE: INTAKE
You need to naturally collect ALL of the following through conversation — do not skip any item even if the user volunteers partial information upfront:
1. What programming language they want to learn or improve in.
2. What SPECIFIC topics or goals they have — even if they say "improve my Java skills", dig deeper:
   ask what areas specifically (data structures, OOP, algorithms, frameworks, a project they want to build, etc.).
3. How they prefer to learn (visual examples, hands-on practice, reading explanations, or a mix).
4. Their self-assessed programming level — ask something like "How would you describe your experience so far?"
   Accept whatever they say, but note it only as a starting point you will verify later.
5. Their REAL-LIFE INTERESTS — hobbies, things they enjoy outside of coding, e.g. sports, music, gaming,
   cooking, travel, movies, fitness, fashion, etc. This is IMPORTANT: the tutor will use these to make
   coding examples feel personally relevant. Ask something like:
   "What do you enjoy doing outside of coding? Any hobbies or interests — doesn't matter how unrelated they seem!"
   Be genuinely curious and encourage them to share multiple interests.
   Collect this in the 'realLifeInterests' field.

STRICT RULES:
- Ask only 1–2 questions per turn — never fire all questions at once.
- You MUST have at least 2 back-and-forth exchanges in this phase before moving on.
- If the user volunteers some information in their first message, acknowledge it warmly and ask about the remaining items one at a time.
- Do NOT mention that you will test them later.
- Do NOT commit a level yet — just gather the self-report.`;
  }

  if (phase === 2) {
    return base + `
PHASE: DIAGNOSTIC
You have collected their self-assessed level (${collected.selfReportedLevel || 'unknown'}) and their target language (${collected.targetLanguage || 'unknown'}).
Topics or concepts they say they already know: ${JSON.stringify(collected.topics)}.

YOUR ONLY JOB THIS PHASE: verify their actual ability with a hands-on task. Do NOT move to phase 3 until you have done this.

CRITICAL RULES — read every word:
1. What the student has already SAID about their knowledge is NOT evidence. Verbal claims ("I'm comfortable with X", "I know loops") tell you nothing about actual ability — anyone can say that. You must see them DO something.
2. You MUST pose at least one concrete task before this phase can end. If you have not yet given them a task to attempt, give one NOW before replying to anything else.
3. The task must TARGET what they claimed to know. If they said they know loops and conditionals in Java, give them a Java problem involving loops and conditionals — not something unrelated.
4. Do NOT frame the task as optional. Say something like "Let's try a quick one to make sure I pitch things at the right level for you:" and then give the task.
5. Wait for their attempt before drawing any conclusions. Do not assess them based on how they described their own knowledge.

What kind of task to give (choose based on their stated level):
- BEGINNER (self-reported): Ask them to write a short piece of code from scratch. e.g. "Write a loop in ${collected.targetLanguage || 'their language'} that prints the numbers 1 to 5, but skips 3."
- INTERMEDIATE (self-reported): Show a 4–8 line code snippet in their language that contains a subtle bug or non-obvious behaviour. Ask them to trace what it outputs, or to find and fix the bug.
- ADVANCED (self-reported): Show a code snippet using a non-obvious pattern (closure, generator, decorator, pointer arithmetic, etc.) and ask them to explain what it does and why it works that way. Or give a design problem.

After they respond to the task:
- Acknowledge what they got right and gently address any gaps — do not be condescending.
- If any intake information (learning style, real-life interests) is still missing, collect it naturally now.
- Mark this phase as done in your mind; phase 3 will handle final calibration.

Internally note (but do NOT state aloud):
- Did they attempt the task or dodge it?
- Vocabulary used (correct technical terms vs hand-wavy?)
- Accuracy of their solution or explanation
- Any misconceptions, off-by-one errors, logic gaps
- Confidence level (hedging vs direct)`;
  }

  const hasEvidence = collected.diagnosticEvidence?.length > 0;

  return base + `
PHASE: CALIBRATION AND COMMIT

Self-reported level: ${collected.selfReportedLevel || 'not provided'}
Diagnostic evidence gathered: ${hasEvidence ? JSON.stringify(collected.diagnosticEvidence) : 'NONE — no hands-on task has been completed yet'}

${!hasEvidence ? `IMPORTANT: The diagnostic evidence array is empty. This means the student has NOT yet attempted any hands-on task. You MUST NOT emit the END_ONBOARDING marker yet. Instead, give them a concrete task NOW (same rules as Phase 2: write code, trace output, fix a bug) and wait for their response before finalising.` : `Your task:
1. Reconcile the self-reported level with the diagnostic evidence from their task attempt.
   - If evidence SUPPORTS the self-reported level: confirm it.
   - If evidence suggests OVERCONFIDENCE (they said intermediate but made basic errors): set level to beginner.
   - If evidence suggests UNDERSELLING (they said beginner but demonstrated strong accuracy and vocabulary): set level to intermediate or advanced.
2. Produce one final warm closing message that summarises what you've learned about them and what to expect from their tutor. Do NOT mention that you tested them or calibrated their level — just say you have a good picture of where they are.
3. End your message with EXACTLY this marker and JSON (nothing after it):
END_ONBOARDING:{"programmingLevel":"<calibrated level: beginner|intermediate|advanced>","targetLanguage":"...","topics":[...],"learningStyle":"...","realLifeInterests":[<array of their real-life hobbies and interests, e.g. "football", "cooking", "hip-hop music">],"strengths":[<any demonstrated strengths from diagnostic>],"weaknesses":[<any misconceptions or gaps revealed>]}

The programmingLevel field must reflect your calibrated assessment, NOT simply echo back the self-reported level.
The realLifeInterests array must contain ONLY real-life, non-coding interests mentioned by the student.`}`;
}

// ---------------------------------------------------------------------------
// EXTRACTION HELPERS
// ---------------------------------------------------------------------------

async function extractPartialProfile(messages, lastReply) {
  const systemPrompt = `Extract any of the following fields from this onboarding conversation if clearly stated.
Return ONLY a JSON object with the fields found. If a field is not clearly present, omit it entirely.
Fields:
- selfReportedLevel (string): their stated programming skill level
- targetLanguage (string): programming language they want to learn
- topics (array of strings): specific programming topics or goals
- learningStyle (string): how they prefer to learn
- realLifeInterests (array of strings): ONLY real-life, non-coding interests (hobbies, sports, music, games, food, travel, etc.)
Do not infer or guess. Only extract what was explicitly stated by the user.`;

  try {
    const context = [
      ...messages.slice(-6).map(m => `${m.role}: ${m.content}`),
      `assistant: ${lastReply}`,
    ].join('\n');

    const result = await chatCompletion({
      messages: [{ role: 'user', content: context }],
      systemPrompt,
      jsonMode: true,
    });
    const parsed = JSON.parse(result);
    return Object.keys(parsed).length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

async function extractDiagnosticEvidence(messages, lastReply) {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return null;

  // Find the last assistant message before this user reply — that is the
  // message the student was responding to. If it didn't contain a concrete
  // task (code to analyse, something to write, a question to answer), the
  // student's reply is just conversation, not diagnostic evidence.
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  const precedingAssistantMsg = assistantMessages[assistantMessages.length - 1];

  const gatekeepPrompt = `You are reviewing an onboarding conversation for a programming tutor.
The assistant's last message before the student replied is shown below.
Did the assistant give the student a concrete hands-on diagnostic task to attempt?
A concrete task means: asking them to write code, trace the output of a code snippet, find a bug, or explain a specific concept in detail.
It does NOT count if the assistant only asked a general question like "what's your level?" or simply acknowledged what the student said.
Reply with ONLY the word YES or NO.

Assistant message: """${precedingAssistantMsg?.content || ''}"""`;

  try {
    const gateResult = await chatCompletion({
      messages: [{ role: 'user', content: 'Assess the message above.' }],
      systemPrompt: gatekeepPrompt,
    });
    if (!gateResult.trim().toUpperCase().startsWith('YES')) return null;
  } catch {
    return null;
  }

  const systemPrompt = `You are analysing a programming tutor onboarding conversation.
The student just responded to a concrete diagnostic task (writing code, tracing output, or explaining a concept in detail).
Extract observable evidence about their actual demonstrated competency — ignore anything they merely claimed before the task.
Return a JSON object with:
{
  "observation": "<one sentence: what the student actually did or wrote>",
  "vocabularyAccurate": true/false,
  "conceptuallyCorrect": true/false,
  "misconceptionFound": "<describe any misconception or error, or null>",
  "suggestedLevel": "beginner" | "intermediate" | "advanced",
  "confidence": "low" | "medium" | "high"
}
Base suggestedLevel only on what was demonstrated in this response, not on what they previously claimed.`;

  try {
    const result = await chatCompletion({
      messages: [{ role: 'user', content: `Student response to diagnostic task: "${lastUserMsg.content}"\n\nTutor reply: "${lastReply}"` }],
      systemPrompt,
      jsonMode: true,
    });
    return JSON.parse(result);
  } catch {
    return null;
  }
}

export default router;
