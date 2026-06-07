import express from 'express';
import { getProfile, updateProfile, appendChatHistory, appendSessionHistory, appendDiagnosticEvidence } from '../services/profileService.js';
import { chatCompletion, summariseSession, INTERNAL_PROVIDER } from '../services/llmService.js';

const router = express.Router();

// what a user is permitted to update directly
// anything not in this set is silently ignored, preventing privilege escalation.
const MUTABLE_FIELDS = new Set([
  'programmingLevel', 'targetLanguage', 'learningStyle',
  'topics', 'realLifeInterests', 'strengths', 'weaknesses',
  'preferredLLM', 'customApiKeys',
]);

const MAX_ARRAY_ITEMS = 50;
const MAX_ITEM_LENGTH = 200;

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

  // update a provider's key if the user explicitly typed a new non-empty value; an empty string means "keep whatever is stored".
  if (result.customApiKeys !== undefined) {
    const incoming = result.customApiKeys;
    const prev = existing?.customApiKeys || {};
    result.customApiKeys = {
      openai:    (typeof incoming.openai    === 'string' && incoming.openai.trim())    ? incoming.openai.trim()    : (prev.openai    || ''),
      gemini:    (typeof incoming.gemini    === 'string' && incoming.gemini.trim())    ? incoming.gemini.trim()    : (prev.gemini    || ''),
      anthropic: (typeof incoming.anthropic === 'string' && incoming.anthropic.trim()) ? incoming.anthropic.trim() : (prev.anthropic || ''),
    };
  }

  for (const field of ['topics', 'realLifeInterests', 'strengths', 'weaknesses']) {
    if (field in result) result[field] = sanitizeStringArray(result[field]);
  }

  return result;
}

router.get('/', async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    // Strip actual key values; return only which providers have a key configured
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
    await appendChatHistory(req.user.id, messages);
    res.json({ success: true });

    // summarise the conversation and append one sessionHistory entry per saved chat.
    // runs after the response so the client is never blocked on the LLM call.
    (async () => {
      try {
        const summary = await summariseSession(messages);
        await appendSessionHistory(req.user.id, { summary });
      } catch (e) {
        console.error('Session summary error:', e);
      }
    })();
  } catch (err) {
    console.error('POST /profile/chat-history error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// ONBOARDING SYSTEM
//
// Three-phase approach to avoid relying on inaccurate self-evaluation:
//
// PHASE 1: INTAKE 
// PHASE 2: DIAGNOSTIC 
// PHASE 3: CALIBRATION & COMMIT


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

    const hasRequiredIntake  = profile?.realLifeInterests?.length > 0 && !!profile?.learningStyle;
    const hasDiagnosticEvidence = (profile?.diagnosticEvidence?.length ?? 0) > 0;
    const derivedPhase = !hasRequiredIntake ? 1 : !hasDiagnosticEvidence ? 2 : 3;
    
    const storedPhase = userTurns <= 1 ? 1 : (profile?.onboardingPhase ?? 1);
    const phase = Math.max(derivedPhase, storedPhase);

    // advance the stored phase if we've moved forward.
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
    const reply = await chatCompletion({ messages, systemPrompt, provider: INTERNAL_PROVIDER });

    if (phase === 1) {
      const partial = await extractPartialProfile(messages, reply);
      if (partial) await updateProfile(req.user.id, partial);
      return res.json({ reply, onboardingComplete: false, phase: 1 });
    }

    if (phase === 2) {
      const evidence = await extractDiagnosticEvidence(messages, reply);
      // appendDiagnosticEvidence is atomic: reads current array inside the updater
      if (evidence) {
        await appendDiagnosticEvidence(req.user.id, evidence);

        // evidence captured; advance directly to Phase 3 in this same request.
        const freshProfile = await getProfile(req.user.id);
        const freshCollected = {
          selfReportedLevel:  freshProfile?.selfReportedLevel  || null,
          targetLanguage:     freshProfile?.targetLanguage     || null,
          topics:             freshProfile?.topics             || null,
          learningStyle:      freshProfile?.learningStyle      || null,
          realLifeInterests:  freshProfile?.realLifeInterests  || null,
          diagnosticEvidence: freshProfile?.diagnosticEvidence || [],
        };
        const phase3Prompt = buildOnboardingPrompt(3, freshCollected);
        const phase3Reply = await chatCompletion({ messages, systemPrompt: phase3Prompt, provider: INTERNAL_PROVIDER });
        await updateProfile(req.user.id, { onboardingPhase: 3 });

        const parsed = parseEndMarker(phase3Reply);
        if (parsed?.extracted) {
          const finalProfile = buildFinalProfile(parsed.extracted, freshCollected, freshProfile);
          await updateProfile(req.user.id, finalProfile);
          const cleanReply = parsed.textBefore || "Great! I've got a clear picture of where you are. Your personalised tutor is ready. Let's get started!";
          return res.json({ reply: cleanReply, onboardingComplete: true, profile: finalProfile });
        }
        // phase 3 didn't emit END_ONBOARDING, so surface the reply and let the
        // next user turn re-enter Phase 3.
        return res.json({ reply: phase3Reply, onboardingComplete: false, phase: 3 });
      }

      return res.json({ reply, onboardingComplete: false, phase: 2 });
    }

    // phase 3: reconcile and commit
    const parsed = parseEndMarker(reply);
    if (!parsed) {
      return res.json({ reply, onboardingComplete: false, phase: 3 });
    }
    if (!parsed.extracted) {
      return res.json({
        reply: parsed.textBefore || "Almost there! Let me gather just a bit more.",
        onboardingComplete: false,
        phase: 3,
      });
    }

    const finalProfile = buildFinalProfile(parsed.extracted, collectedSoFar, profile);
    await updateProfile(req.user.id, finalProfile);
    const cleanReply = parsed.textBefore || "Great! I've got a clear picture of where you are. Your personalised tutor is ready. Let's get started!";
    return res.json({ reply: cleanReply, onboardingComplete: true, profile: finalProfile });

  } catch (err) {
    console.error('Onboarding error:', err);
    res.status(500).json({ error: 'Failed to get response' });
  }
});


// ONBOARDING HELPERS
function parseEndMarker(reply) {
  const END_MARKER = 'END_ONBOARDING:';
  if (!reply.includes(END_MARKER)) return null;
  const markerIdx = reply.indexOf(END_MARKER);
  const textBefore = reply.substring(0, markerIdx).trim();
  const jsonStr = reply.substring(markerIdx + END_MARKER.length).trim();
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { textBefore, extracted: null };
  try { return { textBefore, extracted: JSON.parse(jsonMatch[0]) }; }
  catch { return { textBefore, extracted: null }; }
}

function buildFinalProfile(extracted, collected, profile) {
  const safeExtracted = Object.fromEntries(
    Object.entries(extracted).filter(([, v]) =>
      Array.isArray(v) || (v !== null && v !== undefined && v !== '')
    )
  );

  return {
    ...safeExtracted,
    selfReportedLevel: collected.selfReportedLevel,
    diagnosticEvidence: profile?.diagnosticEvidence || [],
    onboardingComplete: true,
    onboardingPhase: 3,
    calibrationNote: extracted.programmingLevel !== collected.selfReportedLevel
      ? `Self-reported ${collected.selfReportedLevel}, calibrated to ${extracted.programmingLevel} based on diagnostic responses.`
      : `Self-reported level confirmed by diagnostic.`,
  };
}

// PROMPT BUILDERS

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

Before giving the diagnostic task:
- If any Phase 1 information is still missing (learning style, real-life interests), collect it first with a direct, standalone question. Do NOT connect it to the upcoming task in any way.

What kind of task to give (choose based on their stated level):
- BEGINNER (self-reported): Ask them to write a short piece of code from scratch. e.g. "Write a loop in ${collected.targetLanguage || 'their language'} that prints the numbers 1 to 5, but skips 3."
- INTERMEDIATE (self-reported): Show a 4–8 line code snippet in their language that contains a subtle bug or non-obvious behaviour. Ask them to trace what it outputs, or to find and fix the bug.
- ADVANCED (self-reported): Show a code snippet using a non-obvious pattern (closure, generator, decorator, pointer arithmetic, etc.) and ask them to explain what it does and why it works that way. Or give a design problem.

After they respond to the task:
- Give a brief, neutral acknowledgement only (e.g. "Thanks for sharing that!" or "Got it, appreciate you giving that a go!").
- Do NOT correct their code. Do NOT explain what was right or wrong. Do NOT provide a revised or corrected version. Do NOT teach them anything. Your job here is purely to observe, not to instruct — the tutor will handle all teaching after onboarding is complete.
- Do NOT ask about real-life interests, learning style, or any other unrelated topic after the task — pivoting away from the task will feel abrupt and confusing. Any missing intake info must have been collected before the task was posed.
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
2. Produce one final warm closing message (2–3 sentences maximum). Open with a single warm sentence that acknowledges their task attempt without correcting or evaluating it (e.g. "Thanks for giving that a go!"). Then summarise what you know about them and what their tutor will focus on. Do NOT mention testing, calibration, or levels — just say you have a good picture of where they are.
3. End your message with EXACTLY this marker and JSON (nothing after it):
END_ONBOARDING:{"programmingLevel":"<calibrated level: beginner|intermediate|advanced>","targetLanguage":"...","topics":[...],"learningStyle":"...","realLifeInterests":[<array of their real-life hobbies and interests, e.g. "football", "cooking", "hip-hop music">],"strengths":[<any demonstrated strengths from diagnostic>],"weaknesses":[<any misconceptions or gaps revealed>]}

The programmingLevel field must reflect your calibrated assessment, NOT simply echo back the self-reported level.
The realLifeInterests array must contain ONLY real-life, non-coding interests mentioned by the student.`}`;
}

// EXTRACTION HELPERS

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
      provider: INTERNAL_PROVIDER,
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
      provider: INTERNAL_PROVIDER,
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
      provider: INTERNAL_PROVIDER,
      jsonMode: true,
    });
    return JSON.parse(result);
  } catch {
    return null;
  }
}

export default router;
