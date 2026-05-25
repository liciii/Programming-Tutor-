import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

// Detect which template to use based on message intent
export function detectIntent(message) {
  const msg = message.toLowerCase();
  if (/explain|what is|how does|tell me about|describe|understand/.test(msg)) return 'default-explain';
  if (/exercise|practice|challenge|task|problem|assignment/.test(msg)) return 'default-exercise';
  if (/debug|error|bug|broken|not working|why does this|fix/.test(msg)) return 'default-debug';
  if (/quiz|test me|question|check my knowledge/.test(msg)) return 'default-quiz';
  if (/review|feedback|check my code|look at this/.test(msg)) return 'default-feedback';
  return 'default-explain'; // fallback
}

function getOpenAIClient(apiKey) {
  return new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });
}

export async function streamChatCompletion({ messages, systemPrompt, provider = 'openai', apiKey, res }) {
  if (provider === 'openai' || !provider) {
    return streamOpenAI({ messages, systemPrompt, apiKey, res });
  }
  // Extend here for other providers
  return streamOpenAI({ messages, systemPrompt, apiKey, res });
}

async function streamOpenAI({ messages, systemPrompt, apiKey, res }) {
  const client = getOpenAIClient(apiKey);

  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: formattedMessages,
    stream: true,
    max_tokens: 1500,
  });

  let fullContent = '';

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    if (delta) {
      fullContent += delta;
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }
  }

  res.write(`data: ${JSON.stringify({ done: true, fullContent })}\n\n`);
  res.end();

  return fullContent;
}

// Non-streaming call used internally (e.g. onboarding profile extraction)
export async function chatCompletion({ messages, systemPrompt, provider = 'openai', apiKey, jsonMode = false }) {
  const client = getOpenAIClient(apiKey);

  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: formattedMessages,
    max_tokens: 1000,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });

  return response.choices[0].message.content;
}

// Used to update the learner profile after each chat turn
export async function extractProfileUpdates(conversationSummary, currentProfile, apiKey) {
  const systemPrompt = `You are analyzing a tutoring conversation to extract learner insights.
Based on the conversation, identify any NEW information about the learner.
Return a JSON object with ONLY the fields that should be updated. Use null for fields with no new info.
Fields: programmingLevel (beginner/intermediate/advanced), strengths (array), weaknesses (array), topics (array).
Only add to strengths/weaknesses if there is clear evidence from the conversation. Do not repeat existing items.`;

  try {
    const result = await chatCompletion({
      messages: [{ role: 'user', content: conversationSummary }],
      systemPrompt,
      apiKey,
      jsonMode: true,
    });
    return JSON.parse(result);
  } catch {
    return {};
  }
}
