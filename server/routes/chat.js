import express from 'express';
import { getProfile, updateProfile, appendSessionHistory } from '../services/profileService.js';
import { buildSystemPrompt } from '../services/templateService.js';
import { streamChatCompletion, detectIntent, extractProfileUpdates } from '../services/llmService.js';

const router = express.Router();

router.post('/message', async (req, res) => {
  try {
    const { messages, templateId } = req.body;
    const userId = req.user.id;
    const profile = await getProfile(userId);

    if (!profile?.onboardingComplete) {
      return res.status(400).json({ error: 'Please complete onboarding first' });
    }

    const baseUrl = process.env.SERVER_URL || 'http://localhost:3001';
    const fileContext = (profile.files || [])
      .map(f => `- ${f.name} (${f.mimeType}) — ${baseUrl}${f.path}`)
      .join('\n');
    const filePrompt = fileContext
      ? `\n\nThe user has uploaded these files (you can reference them by name):\n${fileContext}\n`
      : '';

    const sourceContext = (profile.externalSources || [])
      .map(s => `- ${s.url}`)
      .join('\n');
    const sourcePrompt = sourceContext
      ? `\n\nThe user has provided these online sources (you can reference them as needed):\n${sourceContext}\n`
      : '';

    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    const resolvedTemplateId = templateId || detectIntent(lastUserMessage);

    const provider = profile.preferredLLM || 'openai';
    // Use the key that matches the selected provider for streaming
    const chatApiKey = profile.customApiKeys?.[provider] || null;
    // Internal operations (extraction) always use OpenAI regardless of provider
    const openaiApiKey = profile.customApiKeys?.openai || null;

    let systemPrompt = await buildSystemPrompt(resolvedTemplateId, profile, userId);
    if (!systemPrompt) {
      systemPrompt = await buildSystemPrompt('default-explain', profile, userId);
    }

    systemPrompt += filePrompt + sourcePrompt;

    const recentHistory = (profile.sessionHistory || []).slice(-5);
    if (recentHistory.length > 0) {
      const historyContext = recentHistory.map(h => `- ${h.summary}`).join('\n');
      systemPrompt += `\n\nRecent session context:\n${historyContext}`;
    }

    await streamChatCompletion({ messages, systemPrompt, provider, apiKey: chatApiKey, res });

    // Background profile update — runs after the response has been sent
    setTimeout(async () => {
      try {
        const conversationSummary = messages.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n');
        const updates = await extractProfileUpdates(conversationSummary, profile, openaiApiKey);

        const profileUpdates = {};
        if (updates.strengths?.length) {
          profileUpdates.strengths = [...new Set([...(profile.strengths || []), ...updates.strengths])];
        }
        if (updates.weaknesses?.length) {
          profileUpdates.weaknesses = [...new Set([...(profile.weaknesses || []), ...updates.weaknesses])];
        }
        if (updates.topics?.length) {
          profileUpdates.topics = [...new Set([...(profile.topics || []), ...updates.topics])];
        }

        if (Object.keys(profileUpdates).length > 0) {
          await updateProfile(userId, profileUpdates);
        }

        await appendSessionHistory(userId, {
          summary: `Discussed: ${lastUserMessage.substring(0, 80)}`,
          templateUsed: resolvedTemplateId,
        });
      } catch (e) {
        console.error('Profile update error:', e);
      }
    }, 100);

  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Chat error' });
    }
  }
});

export default router;
