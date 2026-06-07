import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ---------------------------------------------------------------------------
// model names, update here to change them everywhere
// ---------------------------------------------------------------------------
const MODELS = {
  openai:    'gpt-4o',
  anthropic: 'claude-opus-4-8',
  gemini:    'gemini-3.0-flash',
};

// max turns sent to LLM 
const MAX_CONTEXT_MESSAGES = 40;

// intent detection 
export function detectIntent(message) {
  const msg = message.toLowerCase();
  if (/debug|error|bug|broken|not working|fix|wrong|fail/.test(msg))  return 'default-debug';
  if (/exercise|practice|challenge|task|problem|assignment/.test(msg)) return 'default-exercise';
  if (/quiz|test me|question|check my knowledge/.test(msg))           return 'default-quiz';
  if (/review|feedback|check my code|look at this/.test(msg))        return 'default-feedback';
  if (/explain|what is|how does|tell me about|describe|understand/.test(msg)) return 'default-explain';
  return 'default-explain';
}

// client factories - reuse instances for server keys
//  custom keys always get a fresh client

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

// one fixed provider for all internal tasks (onboarding, profile extraction, summaries etc)
// keeps JSON output consistent and separate from whatever provider the user picked
// set INTERNAL_LLM_PROVIDER to override (openai | anthropic | gemini)
export const INTERNAL_PROVIDER = process.env.INTERNAL_LLM_PROVIDER || 'openai';

// ---------------------------------------------------------------------------
// multimodal helpers - attach image files to the last user message
// each provider has its own content shape so we need separate functions
// ---------------------------------------------------------------------------

function injectImagesOpenAI(messages, imageFiles) {
  if (!imageFiles.length) return messages;
  const idx = messages.findLastIndex(m => m.role === 'user');
  if (idx === -1) return messages;
  return messages.map((m, i) => i !== idx ? m : {
    role: m.role,
    content: [
      { type: 'text', text: m.content },
      ...imageFiles.map(img => ({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
      })),
    ],
  });
}

function injectImagesAnthropic(messages, imageFiles) {
  if (!imageFiles.length) return messages;
  const idx = messages.findLastIndex(m => m.role === 'user');
  if (idx === -1) return messages;
  return messages.map((m, i) => i !== idx ? m : {
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: [
      ...imageFiles.map(img => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
      })),
      { type: 'text', text: m.content },
    ],
  });
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

// cut down to the last N messages so long conversations don't eat up the token budget
function trimMessages(messages) {
  if (messages.length <= MAX_CONTEXT_MESSAGES) return messages;
  return messages.slice(-MAX_CONTEXT_MESSAGES);
}

// ---------------------------------------------------------------------------
// OpenAI streaming
// ---------------------------------------------------------------------------

async function streamOpenAI({ messages, systemPrompt, apiKey, res, imageFiles = [] }) {
  const client = openAIClient(apiKey);

  const trimmed = injectImagesOpenAI(
    trimMessages(messages).map(m => ({ role: m.role, content: m.content })),
    imageFiles,
  );

  // start the stream before setting SSE headers so auth errors can still be caught as JSON
  const stream = await client.chat.completions.create({
    model: MODELS.openai,
    max_tokens: 1500,
    stream: true,
    messages: [{ role: 'system', content: systemPrompt }, ...trimmed],
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

async function streamAnthropic({ messages, systemPrompt, apiKey, res, imageFiles = [] }) {
  const client = anthropicClient(apiKey);

  const trimmed = injectImagesAnthropic(
    trimMessages(messages).map(m => ({ role: m.role, content: m.content })),
    imageFiles,
  );

  const stream = await client.messages.create({
    model: MODELS.anthropic,
    max_tokens: 1500,
    system: systemPrompt,
    messages: trimmed,
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

// converts messages to Gemini's format with history + lastMessage
// Gemini needs strictly alternating turns so we merge consecutive same-role messages
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

async function streamGemini({ messages, systemPrompt, apiKey, res, imageFiles = [] }) {
  const genAI = geminiClient(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODELS.gemini,
    systemInstruction: systemPrompt,
  });

  const { history, lastMessage } = toGeminiFormat(trimMessages(messages));
  if (!lastMessage) throw new Error('No user message to send to Gemini');

  // images go first in the parts array then the text
  const lastParts = [
    ...imageFiles.map(img => ({ inlineData: { data: img.base64, mimeType: img.mimeType } })),
    { text: lastMessage },
  ];

  // start stream before setting headers so errors bubble up as JSON
  const chat = model.startChat({ history });
  const result = await chat.sendMessageStream(lastParts);

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
// public streaming entry point
// ---------------------------------------------------------------------------

export async function streamChatCompletion({ messages, systemPrompt, provider = 'openai', apiKey, imageFiles = [], res }) {
  switch (provider) {
    case 'anthropic': return streamAnthropic({ messages, systemPrompt, apiKey, imageFiles, res });
    case 'gemini':    return streamGemini({ messages, systemPrompt, apiKey, imageFiles, res });
    default:          return streamOpenAI({ messages, systemPrompt, apiKey, imageFiles, res });
  }
}

// ---------------------------------------------------------------------------
// non-streaming version for internal tasks like onboarding, profile extraction
// and session summaries - always goes through INTERNAL_PROVIDER so background
// tasks stay on one vendor regardless of what the user picked
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
    ? `${systemPrompt}\n\nRespond with valid JSON only, no prose, no markdown fences.`
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

// only exported for unit tests
export { injectImagesOpenAI, injectImagesAnthropic, trimMessages };

// profile update extraction, runs after each chat turn

export async function extractProfileUpdates(conversationSummary, _currentProfile) {
  const systemPrompt = `You are analyzing a tutoring conversation to extract learner insights.
Based on the conversation, identify any NEW information about the learner.
Return a JSON object with ONLY the fields that should be updated. Use null for fields with no new info.
Fields: programmingLevel (beginner/intermediate/advanced), strengths (array), weaknesses (array), topics (array).
Only add to strengths/weaknesses if there is clear evidence from the conversation. Do not repeat existing items.`;

  try {
    const result = await chatCompletion({
      messages: [{ role: 'user', content: conversationSummary }],
      systemPrompt,
      provider: INTERNAL_PROVIDER,
      jsonMode: true,
    });
    return JSON.parse(result);
  } catch {
    return {};
  }
}

// session summarization - one sentence about what was learned or discussed
// instead of just truncating the raw conversation

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
      provider: INTERNAL_PROVIDER,
    });
  } catch {
    // if summarization fails just use whatever the user last said
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    return `Discussed: ${(lastUser?.content ?? 'programming topic').substring(0, 80)}`;
  }
}
