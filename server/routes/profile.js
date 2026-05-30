import express from 'express';
import { getProfile, updateProfile, appendChatHistory } from '../services/profileService.js';
import { chatCompletion } from '../services/llmService.js';

const router = express.Router();

// Fields a user is permitted to update directly.
// Anything not in this set is silently ignored, preventing privilege escalation.
const MUTABLE_FIELDS = new Set([
  'programmingLevel', 'targetLanguage', 'learningStyle',
  'topics', 'interests', 'strengths', 'weaknesses',
  'preferredLLM', 'customApiKeys', 'externalSources',
]);

function sanitizeProfileUpdate(body, existing) {
  const result = {};
  for (const key of MUTABLE_FIELDS) {
    if (key in body) result[key] = body[key];
  }

  // Validate customApiKeys — accept exactly the three supported providers
  if (result.customApiKeys !== undefined) {
    const incoming = result.customApiKeys;
    const prev = existing?.customApiKeys || {};
    result.customApiKeys = {
      openai:    typeof incoming.openai    === 'string' ? incoming.openai.trim()    : (prev.openai    || ''),
      gemini:    typeof incoming.gemini    === 'string' ? incoming.gemini.trim()    : (prev.gemini    || ''),
      anthropic: typeof incoming.anthropic === 'string' ? incoming.anthropic.trim() : (prev.anthropic || ''),
    };
  }

  // Validate externalSources structure
  if (result.externalSources !== undefined) {
    if (!Array.isArray(result.externalSources)) {
      delete result.externalSources;
    } else {
      result.externalSources = result.externalSources
        .filter(s => s && typeof s.url === 'string')
        .map(s => ({
          id: s.id || Date.now().toString(),
          url: s.url,
          addedAt: s.addedAt || new Date().toISOString(),
        }));
    }
  }

  return result;
}

router.get('/', async (req, res) => {
  const profile = await getProfile(req.user.id);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  // Strip actual key values — return only which providers have a key configured
  const { customApiKeys, ...safeProfile } = profile;
  safeProfile.customApiKeysSet = Object.keys(customApiKeys || {}).filter(k => customApiKeys[k]);
  res.json(safeProfile);
});

router.put('/', async (req, res) => {
  const existing = await getProfile(req.user.id);
  const safeUpdates = sanitizeProfileUpdate(req.body, existing);
  const updated = await updateProfile(req.user.id, safeUpdates);
  // Strip key values from response as well
  const { customApiKeys, ...safe } = updated;
  safe.customApiKeysSet = Object.keys(customApiKeys || {}).filter(k => customApiKeys[k]);
  res.json(safe);
});

router.post('/chat-history', async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages are required' });
  }
  const updated = await appendChatHistory(req.user.id, messages);
  res.json(updated);
});

// ---------------------------------------------------------------------------
// ONBOARDING SYSTEM
//
// Three-phase approach to avoid relying on inaccurate self-evaluation:
//
// PHASE 1 — INTAKE (messages 1–2)
//   Collect language, topics, learning style, interests conversationally.
//   Ask for a rough self-assessed level but treat it only as a prior.
//
// PHASE 2 — DIAGNOSTIC (messages 3–5)
//   Embed 2 targeted coding questions matched to their stated language.
//   Questions are open-ended so vocabulary, accuracy, and confidence can
//   all be observed.  The LLM evaluates responses and records evidence.
//
// PHASE 3 — CALIBRATION & COMMIT
//   Reconcile self-reported level with diagnostic evidence.
//   If they diverge, the evidence wins.  The student never sees this logic.
// ---------------------------------------------------------------------------

router.post('/onboarding/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const profile = await getProfile(req.user.id);

    const userTurns = messages.filter(m => m.role === 'user').length;
    const phase = userTurns <= 2 ? 1 : userTurns <= 5 ? 2 : 3;

    const collectedSoFar = {
      selfReportedLevel:  profile?.selfReportedLevel  || null,
      targetLanguage:     profile?.targetLanguage     || null,
      topics:             profile?.topics             || null,
      learningStyle:      profile?.learningStyle      || null,
      interests:          profile?.interests          || null,
      diagnosticEvidence: profile?.diagnosticEvidence || [],
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
      if (evidence) {
        const existing = profile?.diagnosticEvidence || [];
        await updateProfile(req.user.id, { diagnosticEvidence: [...existing, evidence] });
      }
      return res.json({ reply, onboardingComplete: false, phase: 2 });
    }

    // Phase 3 — reconcile and commit
    const END_MARKER = 'END_ONBOARDING:';
    if (reply.includes(END_MARKER)) {
      const markerIdx = reply.indexOf(END_MARKER);
      const jsonStr = reply.substring(markerIdx + END_MARKER.length).trim();

      // Extract the JSON object even if the LLM appended trailing text
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // Malformed marker — keep the conversation going
        return res.json({ reply: reply.substring(0, markerIdx).trim() || "Almost there! Let me gather just a bit more.", onboardingComplete: false, phase: 3 });
      }

      let extracted;
      try {
        extracted = JSON.parse(jsonMatch[0]);
      } catch {
        return res.json({ reply: reply.substring(0, markerIdx).trim() || "Almost there! Let me gather just a bit more.", onboardingComplete: false, phase: 3 });
      }

      const finalProfile = {
        ...extracted,
        selfReportedLevel: collectedSoFar.selfReportedLevel,
        diagnosticEvidence: profile?.diagnosticEvidence || [],
        onboardingComplete: true,
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
// ---------------------------------------------------------------------------

async function extractPartialProfile(messages, lastReply) {
  const systemPrompt = `Extract any of the following fields from this onboarding conversation if clearly stated.
Return ONLY a JSON object with the fields found. If a field is not clearly present, omit it entirely.
Fields: selfReportedLevel (string), targetLanguage (string), topics (array), learningStyle (string), interests (array).
Do not infer or guess. Only extract what was explicitly stated by the user.`;

  try {
    // Include the last assistant reply so the extractor sees any confirmed summaries
    const context = [
      ...messages.slice(-4).map(m => `${m.role}: ${m.content}`),
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
      messages: [{ role: 'user', content: `Student response to diagnostic question: "${lastUserMsg.content}"\n\nTutor reply: "${lastReply}"` }],
      systemPrompt,
      jsonMode: true,
    });
    return JSON.parse(result);
  } catch {
    return null;
  }
}

export default router;
