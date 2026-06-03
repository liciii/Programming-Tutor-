import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ---------------------------------------------------------------------------
// Model constants — change once here to affect the whole service
// ---------------------------------------------------------------------------
const MODELS = {
  openai:    'gpt-4o',
  anthropic: 'claude-opus-4-8',
  gemini:    'gemini-3.0-flash',
};

// Maximum number of conversation turns to send to the LLM.
// Keeps token usage bounded as conversations grow long.
const MAX_CONTEXT_MESSAGES = 40;

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
// Client factories — lazy singletons for server-key clients so the SDK does
// not create a new HTTP agent on every request. Custom-key clients are always
// fresh (different key = different client).
// ---------------------------------------------------------------------------

let _defaultOpenAI = null;
let _defaultAnthropic = null;
let _defaultGemini = null;

function openAIClient(apiKey) {
  if (apiKey) return new OpenAI({ apiKey });
  return (_defaultOpenAI ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
}

function anthropicClient(apiKey) {
  if (apiKey) return new Anthropic({ apiKey });
  return (_defaultAnthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
}

function geminiClient(apiKey) {
  if (apiKey) return new GoogleGenerativeAI(apiKey);
  return (_defaultGemini ??= new GoogleGenerativeAI(process.env.GEMINI_API_KEY));
}

// Picks the first server-side provider that has an env key configured.
// Used by internal background tasks (extraction, summarisation) so they are
// never dependent on the user's chosen provider or custom keys.
function serverProvider() {
  if (process.env.OPENAI_API_KEY)    return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY)    return 'gemini';
  throw new Error('No server-side API key configured (OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY)');
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

// Trim conversation to the most recent MAX_CONTEXT_MESSAGES turns so token
// usage stays bounded as conversations grow.
function trimMessages(messages) {
  if (messages.length <= MAX_CONTEXT_MESSAGES) return messages;
  return messages.slice(-MAX_CONTEXT_MESSAGES);
}

// ---------------------------------------------------------------------------
// OpenAI streaming
// ---------------------------------------------------------------------------

async function streamOpenAI({ messages, systemPrompt, apiKey, res }) {
  const client = openAIClient(apiKey);

  // Create the stream before setting SSE headers so auth errors are still
  // catchable as JSON responses in the route's try/catch block
  const stream = await client.chat.completions.create({
    model: MODELS.openai,
    max_tokens: 1500,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      ...trimMessages(messages).map(m => ({ role: m.role, content: m.content })),
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
    model: MODELS.anthropic,
    max_tokens: 1500,
    system: systemPrompt,
    messages: trimMessages(messages).map(m => ({
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
    model: MODELS.gemini,
    systemInstruction: systemPrompt,
  });

  const { history, lastMessage } = toGeminiFormat(trimMessages(messages));
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
// Non-streaming call — used internally (onboarding, profile extraction,
// session summarisation). Supports all three providers so background tasks
// use the same provider the user chose for their chat session.
// Internal onboarding calls omit `provider` and default to 'openai'.
// ---------------------------------------------------------------------------

async function chatCompletionOpenAI({ messages, systemPrompt, apiKey, jsonMode }) {
  const client = openAIClient(apiKey);
  const response = await client.chat.completions.create({
    model: MODELS.openai,
    max_tokens: 1000,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ],
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });
  const choice = response.choices?.[0];
  const content = choice?.message?.content;
  if (content == null) {
    const reason = choice?.finish_reason ?? 'unknown';
    throw new Error(`Empty LLM response (finish_reason: ${reason})`);
  }
  return content;
}

async function chatCompletionAnthropic({ messages, systemPrompt, apiKey, jsonMode }) {
  const client = anthropicClient(apiKey);
  const sys = jsonMode
    ? `${systemPrompt}\n\nRespond with valid JSON only — no prose, no markdown fences.`
    : systemPrompt;
  const response = await client.messages.create({
    model: MODELS.anthropic,
    max_tokens: 1000,
    system: sys,
    messages: messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  });
  const content = response.content?.[0]?.text;
  if (content == null) throw new Error('Empty Anthropic response');
  return content;
}

async function chatCompletionGemini({ messages, systemPrompt, apiKey, jsonMode }) {
  const client = geminiClient(apiKey);
  const model = client.getGenerativeModel({
    model: MODELS.gemini,
    systemInstruction: systemPrompt,
    ...(jsonMode ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
  });
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const result = await model.generateContent({ contents });
  const content = result.response.text();
  if (content == null) throw new Error('Empty Gemini response');
  return content;
}

export async function chatCompletion({ messages, systemPrompt, provider = 'openai', apiKey, jsonMode = false }) {
  switch (provider) {
    case 'anthropic': return chatCompletionAnthropic({ messages, systemPrompt, apiKey, jsonMode });
    case 'gemini':    return chatCompletionGemini({ messages, systemPrompt, apiKey, jsonMode });
    default:          return chatCompletionOpenAI({ messages, systemPrompt, apiKey, jsonMode });
  }
}

// ---------------------------------------------------------------------------
// Profile update extraction — runs after each chat turn
// ---------------------------------------------------------------------------

export async function extractProfileUpdates(conversationSummary, currentProfile) {
  const systemPrompt = `You are analyzing a tutoring conversation to extract learner insights.
Based on the conversation, identify any NEW information about the learner.
Return a JSON object with ONLY the fields that should be updated. Use null for fields with no new info.
Fields: programmingLevel (beginner/intermediate/advanced), strengths (array), weaknesses (array), topics (array).
Only add to strengths/weaknesses if there is clear evidence from the conversation. Do not repeat existing items.`;

  try {
    const result = await chatCompletion({
      messages: [{ role: 'user', content: conversationSummary }],
      systemPrompt,
      provider: serverProvider(),
      jsonMode: true,
    });
    return JSON.parse(result);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Session summarisation — produces a meaningful one-sentence summary of
// what was actually learned or discussed, rather than truncating the input.
// ---------------------------------------------------------------------------

export async function summariseSession(messages) {
  const systemPrompt = `You are summarising a programming tutoring session in ONE concise sentence (max 120 characters).
Focus on what was learned or practised, not on pleasantries.
Examples: "Learned recursion with factorial examples in Python."
          "Debugged an off-by-one error in a bubble-sort implementation."
          "Practised list comprehensions with real-world filtering exercises."
Return only the summary sentence, no quotes or extra text.`;

  try {
    const context = messages
      .slice(-8)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    return await chatCompletion({
      messages: [{ role: 'user', content: context }],
      systemPrompt,
      provider: serverProvider(),
    });
  } catch {
    // Graceful fallback — never break the chat flow
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    return `Discussed: ${(lastUser?.content ?? 'programming topic').substring(0, 80)}`;
  }
}
