import express from 'express';
import { getProfile, updateProfile, appendSessionHistory } from '../services/profileService.js';
import { buildSystemPrompt } from '../services/templateService.js';
import { streamChatCompletion, detectIntent, extractProfileUpdates } from '../services/llmService.js';

const router = express.Router();

// SSE streaming chat endpoint
router.post('/message', async (req, res) => {
  try {
    const { messages, templateId, overrideSystemPrompt } = req.body;
    const userId = req.user.id;
    const profile = getProfile(userId);

    if (!profile?.onboardingComplete) {
      return res.status(400).json({ error: 'Please complete onboarding first' });
    }

    // Provide the model with any uploaded files the user has shared
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

    // Determine which template to use
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    const resolvedTemplateId = templateId || detectIntent(lastUserMessage);

    // Build system prompt from template + profile
    const apiKey = profile.customApiKeys?.openai || null;
    const provider = profile.preferredLLM || 'openai';

    let systemPrompt;
    if (overrideSystemPrompt) {
      systemPrompt = overrideSystemPrompt;
    } else {
      systemPrompt = buildSystemPrompt(resolvedTemplateId, profile, userId);
      if (!systemPrompt) {
        systemPrompt = buildSystemPrompt('default-explain', profile, userId);
      }
    }

    // Include uploaded file + online source context in prompt if available
    systemPrompt += filePrompt + sourcePrompt;

    // Append recent session history context
    const recentHistory = (profile.sessionHistory || []).slice(-5);
    if (recentHistory.length > 0) {
      const historyContext = recentHistory.map(h => `- ${h.summary}`).join('\n');
      systemPrompt += `\n\nRecent session context:\n${historyContext}`;
    }

    // Stream response
    await streamChatCompletion({ messages, systemPrompt, provider, apiKey, res });

    // After streaming, async background update of profile
    setTimeout(async () => {
      try {
        const conversationSummary = messages.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n');
        const updates = await extractProfileUpdates(conversationSummary, profile, apiKey);

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
          updateProfile(userId, profileUpdates);
        }

        appendSessionHistory(userId, {
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
