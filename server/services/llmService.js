import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ---------------------------------------------------------------------------
// Intent detection — more specific patterns listed first to prevent broad
// patterns (e.g. "what is") from masking specific ones (e.g. "what is wrong")
// ---------------------------------------------------------------------------
export function detectIntent(message) {
  const msg = message.toLowerCase();
  if (/debug|error|bug|broken|not working|fix|wrong|fail/.test(msg))  return 'default-debug';
  if (/exercise|practice|challenge|task|problem|assignment/.test(msg)) return 'default-exercise';
  if (/quiz|test me|question|check my knowledge/.test(msg))           return 'default-quiz';
  if (/review|feedback|check my code|look at this/.test(msg))        return 'default-feedback';
  if (/explain|what is|how does|tell me about|describe|understand/.test(msg)) return 'default-explain';
  return 'default-explain';
}

// ---------------------------------------------------------------------------
// Client factories
// ---------------------------------------------------------------------------

function openAIClient(apiKey) {
  return new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });
}

function anthropicClient(apiKey) {
  return new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
}

function geminiClient(apiKey) {
  return new GoogleGenerativeAI(apiKey || process.env.GEMINI_API_KEY);
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function setSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
}

function endSse(res, fullContent) {
  res.write(`data: ${JSON.stringify({ done: true, fullContent })}\n\n`);
  res.end();
}

// ---------------------------------------------------------------------------
// OpenAI streaming
// ---------------------------------------------------------------------------

async function streamOpenAI({ messages, systemPrompt, apiKey, res }) {
  const client = openAIClient(apiKey);

  // Create the stream before setting SSE headers so auth errors are still
  // catchable as JSON responses in the route's try/catch block
  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1500,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ],
  });

  setSseHeaders(res);

  let fullContent = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    if (delta) {
      fullContent += delta;
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }
  }

  endSse(res, fullContent);
  return fullContent;
}

// ---------------------------------------------------------------------------
// Anthropic Claude streaming
// ---------------------------------------------------------------------------

async function streamAnthropic({ messages, systemPrompt, apiKey, res }) {
  const client = anthropicClient(apiKey);

  const stream = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1500,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    stream: true,
  });

  setSseHeaders(res);

  let fullContent = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const delta = event.delta.text;
      if (delta) {
        fullContent += delta;
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
    }
  }

  endSse(res, fullContent);
  return fullContent;
}

// ---------------------------------------------------------------------------
// Google Gemini streaming
// ---------------------------------------------------------------------------

// Converts the messages array to Gemini's { history, lastMessage } format.
// Gemini requires strictly alternating user/model turns so consecutive
// same-role messages are merged before building the history.
function toGeminiFormat(messages) {
  const normalized = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    if (normalized.length > 0 && normalized[normalized.length - 1].role === role) {
      normalized[normalized.length - 1].parts[0].text += '\n' + m.content;
    } else {
      normalized.push({ role, parts: [{ text: m.content }] });
    }
  }

  const last = normalized.pop() ?? null;
  return {
    history: normalized,
    lastMessage: last?.parts[0].text ?? null,
  };
}

async function streamGemini({ messages, systemPrompt, apiKey, res }) {
  const genAI = geminiClient(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
  });

  const { history, lastMessage } = toGeminiFormat(messages);
  if (!lastMessage) throw new Error('No user message to send to Gemini');

  // Create stream before setting headers so errors are catchable upstream
  const chat = model.startChat({ history });
  const result = await chat.sendMessageStream(lastMessage);

  setSseHeaders(res);

  let fullContent = '';
  for await (const chunk of result.stream) {
    const delta = chunk.text();
    if (delta) {
      fullContent += delta;
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }
  }

  endSse(res, fullContent);
  return fullContent;
}

// ---------------------------------------------------------------------------
// Public streaming entry point
// ---------------------------------------------------------------------------

export async function streamChatCompletion({ messages, systemPrompt, provider = 'openai', apiKey, res }) {
  switch (provider) {
    case 'anthropic': return streamAnthropic({ messages, systemPrompt, apiKey, res });
    case 'gemini':    return streamGemini({ messages, systemPrompt, apiKey, res });
    default:          return streamOpenAI({ messages, systemPrompt, apiKey, res });
  }
}

// ---------------------------------------------------------------------------
// Non-streaming call — used internally (onboarding, profile extraction).
// Always uses OpenAI because internal calls need JSON mode and a reliable
// server-side key regardless of the user's preferred provider.
// ---------------------------------------------------------------------------

export async function chatCompletion({ messages, systemPrompt, apiKey, jsonMode = false }) {
  const client = openAIClient(apiKey);

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1000,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ],
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });

  return response.choices[0].message.content;
}

// ---------------------------------------------------------------------------
// Profile update extraction — runs after each chat turn
// ---------------------------------------------------------------------------

export async function extractProfileUpdates(conversationSummary, currentProfile, openaiApiKey) {
  const systemPrompt = `You are analyzing a tutoring conversation to extract learner insights.
Based on the conversation, identify any NEW information about the learner.
Return a JSON object with ONLY the fields that should be updated. Use null for fields with no new info.
Fields: programmingLevel (beginner/intermediate/advanced), strengths (array), weaknesses (array), topics (array).
Only add to strengths/weaknesses if there is clear evidence from the conversation. Do not repeat existing items.`;

  try {
    const result = await chatCompletion({
      messages: [{ role: 'user', content: conversationSummary }],
      systemPrompt,
      apiKey: openaiApiKey,
      jsonMode: true,
    });
    return JSON.parse(result);
  } catch {
    return {};
  }
}
