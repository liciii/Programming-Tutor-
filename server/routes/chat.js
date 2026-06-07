import express from 'express';
import { getProfile, updateProfile } from '../services/profileService.js';
import { buildSystemPrompt } from '../services/templateService.js';
import { streamChatCompletion, detectIntent, extractProfileUpdates } from '../services/llmService.js';
import { buildFileContext } from '../services/fileContentService.js';

const router = express.Router();

// hardcoded fallback used only if both template lookups return null 
const FALLBACK_SYSTEM_PROMPT = `You are an expert programming tutor. Help the student learn programming clearly and encouragingly.`;

router.post('/message', async (req, res) => {
  try {
    const { messages, templateId } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages must be a non-empty array' });
    }
    const VALID_ROLES = new Set(['user', 'assistant']);
    const MAX_MSG_LENGTH = 20_000;
    for (const m of messages) {
      if (!m || typeof m.content !== 'string' || !VALID_ROLES.has(m.role)) {
        return res.status(400).json({ error: 'Each message must have role "user" or "assistant" and a string content' });
      }
      if (m.content.length > MAX_MSG_LENGTH) {
        return res.status(400).json({ error: `Message content exceeds ${MAX_MSG_LENGTH} characters` });
      }
    }

    const userId = req.user.id;
    const profile = await getProfile(userId);

    if (!profile?.onboardingComplete) {
      return res.status(400).json({ error: 'Please complete onboarding first' });
    }

    const { textContext, imageFiles } = await buildFileContext(profile.files || []);
    const filePrompt = textContext;

    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    const resolvedTemplateId = templateId || detectIntent(lastUserMessage);

    const provider = profile.preferredLLM || 'openai';
    const chatApiKey = profile.customApiKeys?.[provider] || null;

    let systemPrompt =
      (await buildSystemPrompt(resolvedTemplateId, profile, userId)) ||
      (await buildSystemPrompt('default-explain', profile, userId)) ||
      FALLBACK_SYSTEM_PROMPT;

    systemPrompt += filePrompt;

    const recentHistory = (profile.sessionHistory || []).slice(-5);
    if (recentHistory.length > 0) {
      const historyContext = recentHistory.map(h => `- ${h.summary}`).join('\n');
      systemPrompt += `\n\nRecent session context:\n${historyContext}`;
    }

    await streamChatCompletion({ messages, systemPrompt, provider, apiKey: chatApiKey, imageFiles, res });

    // bckrnd profile update, fire-and-forget
    // prof extraction skipped after first 2 turns, then only every 5 turns(skills change slowly and extraction costs an API call)
    (async () => {
      try {
        const userMsgCount = messages.filter(m => m.role === 'user').length;
        const shouldExtract = userMsgCount <= 2 || userMsgCount % 5 === 0;
        if (!shouldExtract) return;

        const conversationSummary = messages.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n');
        const updates = await extractProfileUpdates(conversationSummary, profile);

        const profileUpdates = {};
        if (updates.strengths?.length) {
          profileUpdates.strengths = [...new Set([...(profile.strengths || []), ...updates.strengths])];
        }
        if (updates.weaknesses?.length) {
          profileUpdates.weaknesses = [...new Set([...(profile.weaknesses || []), ...updates.weaknesses])];
        }
        if (updates.topics?.length) {
          profileUpdates.sessionTopics = [...new Set([...(profile.sessionTopics || []), ...updates.topics])];
        }
        if (updates.programmingLevel && updates.programmingLevel !== profile.programmingLevel) {
          profileUpdates.programmingLevel = updates.programmingLevel;
        }

        if (Object.keys(profileUpdates).length > 0) {
          await updateProfile(userId, profileUpdates);
        }
      } catch (e) {
        console.error('Profile update error:', e);
      }
    })();

  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Chat error' });
    }
  }
});

export default router;
