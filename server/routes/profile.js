import express from 'express';
import { getProfile, updateProfile } from '../services/profileService.js';
import { chatCompletion } from '../services/llmService.js';

const router = express.Router();

router.get('/', (req, res) => {
  const profile = getProfile(req.user.id);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  res.json(profile);
});

router.put('/', (req, res) => {
  const updated = updateProfile(req.user.id, req.body);
  res.json(updated);
});

// Append a completed chat session to the user's history
router.post('/chat-history', (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages are required' });
  }
  const updated = appendChatHistory(req.user.id, messages);
  res.json(updated);
});

// ---------------------------------------------------------------------------
// ONBOARDING SYSTEM
//
// Three-phase approach to avoid relying on inaccurate self-evaluation:
//
// PHASE 1 — INTAKE (messages 1–3)
//   Collect language, topics, learning style, interests conversationally.
//   Ask for a rough self-assessed level but treat it only as a prior.
//
// PHASE 2 — DIAGNOSTIC (messages 4–6)
//   Embed 2 targeted coding questions matched to their stated language.
//   Questions are open-ended (not multiple choice) so vocabulary, accuracy,
//   and confidence of the answer can all be observed.
//   The LLM evaluates the response against a rubric and records evidence.
//
// PHASE 3 — CALIBRATION & COMMIT
//   Reconcile self-reported level with diagnostic evidence.
//   If they diverge, the evidence wins. Commit the resolved profile.
//   The student never sees the calibration logic — it is invisible.
// ---------------------------------------------------------------------------

router.post('/onboarding/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const profile = getProfile(req.user.id);

    // Count only user turns to track progress through the phases
    const userTurns = messages.filter(m => m.role === 'user').length;

    // Determine current phase
    // Phase 1: turns 1-2  — intake (language, goals, style, interests, self-level)
    // Phase 2: turns 3-5  — diagnostic questions embedded naturally
    // Phase 3: turn 6+    — reconcile and finalise
    const phase = userTurns <= 2 ? 1 : userTurns <= 5 ? 2 : 3;

    // Partial profile state passed into every prompt so the LLM knows
    // what has already been collected and what is still missing
    const collectedSoFar = {
      selfReportedLevel: profile?.selfReportedLevel || null,
      targetLanguage:    profile?.targetLanguage    || null,
      topics:            profile?.topics            || null,
      learningStyle:     profile?.learningStyle     || null,
      interests:         profile?.interests         || null,
      diagnosticEvidence: profile?.diagnosticEvidence || [],
    };

    const systemPrompt = buildOnboardingPrompt(phase, collectedSoFar);
    const reply = await chatCompletion({ messages, systemPrompt });

    // -----------------------------------------------------------------------
    // Intermediate profile saves after phase 1 so partial data is not lost
    // -----------------------------------------------------------------------
    if (phase === 1) {
      const partial = await extractPartialProfile(messages, reply);
      if (partial) updateProfile(req.user.id, partial);
      return res.json({ reply, onboardingComplete: false, phase: 1 });
    }

    // -----------------------------------------------------------------------
    // After each diagnostic turn, extract and save the evidence the LLM
    // observed about the student's actual competency
    // -----------------------------------------------------------------------
    if (phase === 2) {
      const evidence = await extractDiagnosticEvidence(messages, reply);
      if (evidence) {
        const existing = profile?.diagnosticEvidence || [];
        updateProfile(req.user.id, { diagnosticEvidence: [...existing, evidence] });
      }
      return res.json({ reply, onboardingComplete: false, phase: 2 });
    }

    // -----------------------------------------------------------------------
    // Phase 3 — reconcile and commit
    // -----------------------------------------------------------------------
    const END_MARKER = 'END_ONBOARDING:';
    if (reply.includes(END_MARKER)) {
      const jsonStart = reply.indexOf(END_MARKER) + END_MARKER.length;
      const extracted = JSON.parse(reply.substring(jsonStart).trim());

      // Reconcile: override self-reported level with calibrated level
      const finalProfile = {
        ...extracted,
        // Keep the raw self-report for research/transparency
        selfReportedLevel: collectedSoFar.selfReportedLevel,
        // programmingLevel in extracted is now the evidence-based calibrated level
        diagnosticEvidence: profile?.diagnosticEvidence || [],
        onboardingComplete: true,
        calibrationNote: extracted.programmingLevel !== collectedSoFar.selfReportedLevel
          ? `Self-reported ${collectedSoFar.selfReportedLevel}, calibrated to ${extracted.programmingLevel} based on diagnostic responses.`
          : `Self-reported level confirmed by diagnostic.`,
      };

      updateProfile(req.user.id, finalProfile);

      const cleanReply = reply.substring(0, reply.indexOf(END_MARKER)).trim() ||
        "Great — I've got a clear picture of where you are. Your personalised tutor is ready. Let's get started!";

      return res.json({ reply: cleanReply, onboardingComplete: true, profile: finalProfile });
    }

    // Still in phase 3 but not yet ready to commit — keep conversing
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
You need to naturally collect the following through conversation:
1. What programming language they want to learn or improve in.
2. What specific topics or goals they have (e.g. "build websites", "learn algorithms").
3. How they prefer to learn (visual examples, hands-on practice, reading explanations, or a mix).
4. Their personal interests outside coding (used later to make examples feel relevant).
5. Their self-assessed programming level — ask something like "How would you describe your experience so far?"
   Accept whatever they say, but note it only as a starting point you will verify later.

Keep the conversation natural. Do NOT mention that you will test them later.
Do NOT commit a level yet — just gather the self-report.`;
  }

  if (phase === 2) {
    return base + `
PHASE: DIAGNOSTIC
You have collected their self-assessed level (${collected.selfReportedLevel || 'unknown'}) and their target language (${collected.targetLanguage || 'unknown'}).
Now embed 1–2 short diagnostic questions naturally into the conversation.

Rules for diagnostic questions:
- Frame them as getting to know their experience better, NOT as a test. e.g. "Just so I can pitch things at the right level — how would you explain what a function is in your own words?"
- Match difficulty to their stated level but probe one level above to check if they were underselling themselves, or one level below to check for overconfidence.
- For a self-reported BEGINNER: ask them to explain a basic concept (variables, loops, or conditionals) in their own words. A correct, confident explanation suggests they may be higher than beginner.
- For a self-reported INTERMEDIATE: ask them to explain a moderately complex concept (e.g. what recursion is, or what a list comprehension does). Also show a 3–5 line code snippet with a subtle bug and ask what it does or if they spot any issues.
- For a self-reported ADVANCED: show a code snippet involving a non-obvious pattern (e.g. a closure, a generator, a decorator) and ask them to explain what it does and why it works that way.

After they answer, respond conversationally — acknowledge their response, gently correct any misconceptions without being condescending, then transition naturally to asking about their learning preferences or interests if not yet collected.

Internally note (but do NOT state aloud):
- Vocabulary used (do they use correct technical terms?)
- Accuracy (is the explanation correct?)
- Confidence (hedging vs direct?)
- Any misconceptions revealed
These observations will be used to calibrate their level.`;
  }

  // Phase 3
  return base + `
PHASE: CALIBRATION AND COMMIT
You now have enough information to finalise the learner profile.

Self-reported level: ${collected.selfReportedLevel || 'not provided'}
Diagnostic evidence gathered: ${JSON.stringify(collected.diagnosticEvidence)}

Your task:
1. Reconcile the self-reported level with the diagnostic evidence.
   - If evidence SUPPORTS the self-reported level: confirm it.
   - If evidence suggests OVERCONFIDENCE (they said intermediate but couldn't explain basic concepts accurately): set level to beginner or lower-intermediate.
   - If evidence suggests UNDERSELLING (they said beginner but demonstrated strong vocabulary, accurate explanations, spotted the bug): set level to intermediate or advanced.
2. Produce one final warm closing message that summarises what you've learned about them and what to expect from their tutor. Do NOT mention that you tested them or calibrated their level — just say you have a good picture of where they are.
3. End your message with EXACTLY this marker and JSON (nothing after it):
END_ONBOARDING:{"programmingLevel":"<calibrated level: beginner|intermediate|advanced>","targetLanguage":"...","topics":[...],"learningStyle":"...","interests":[...],"strengths":[<any demonstrated strengths from diagnostic>],"weaknesses":[<any misconceptions or gaps revealed>]}

The programmingLevel field must reflect your calibrated assessment, NOT simply echo back the self-reported level.`;
}

// ---------------------------------------------------------------------------
// EXTRACTION HELPERS
// Called after phase 1 and phase 2 turns to persist partial data
// ---------------------------------------------------------------------------

async function extractPartialProfile(messages, lastReply) {
  const systemPrompt = `Extract any of the following fields from this onboarding conversation if clearly stated.
Return ONLY a JSON object with the fields found. If a field is not clearly present, omit it entirely.
Fields: selfReportedLevel (string), targetLanguage (string), topics (array), learningStyle (string), interests (array).
Do not infer or guess. Only extract what was explicitly stated by the user.`;

  try {
    const context = messages.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n');
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
  const systemPrompt = `You are analysing a programming tutor onboarding conversation.
The last user message is a response to a diagnostic question about their programming knowledge.
Extract observable evidence about their actual competency level.
Return a JSON object with:
{
  "observation": "<one sentence: what the student said or demonstrated>",
  "vocabularyAccurate": true/false,
  "conceptuallyCorrect": true/false,
  "misconceptionFound": "<describe any misconception, or null>",
  "suggestedLevel": "beginner" | "intermediate" | "advanced",
  "confidence": "low" | "medium" | "high"
}
Base suggestedLevel only on what was demonstrated in this response, not on what they claimed.`;

  try {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return null;
    const result = await chatCompletion({
      messages: [{ role: 'user', content: `Student response to diagnostic question: "${lastUserMsg.content}"` }],
      systemPrompt,
      jsonMode: true,
    });
    return JSON.parse(result);
  } catch {
    return null;
  }
}

export default router;
