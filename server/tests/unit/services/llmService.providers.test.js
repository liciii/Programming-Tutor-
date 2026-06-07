/**
 * llmService — provider-level tests for streaming and non-streaming calls.
 *
 *  three SDK imports (openai, @anthropic-ai/sdk, @google/generative-ai) are
 * mocked at the module level so no real HTTP traffic is ever made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// sdk mocks
// OpenAI mock
vi.mock('openai', () => {
  const createMock = vi.fn();
  class OpenAI {
    constructor() {
      this.chat = { completions: { create: createMock } };
    }
  }
  OpenAI.__createMock = createMock;
  return { default: OpenAI };
});

// Anthropic mock 
vi.mock('@anthropic-ai/sdk', () => {
  const createMock = vi.fn();
  class Anthropic {
    constructor() {
      this.messages = { create: createMock };
    }
  }
  Anthropic.__createMock = createMock;
  return { default: Anthropic };
});

// Google Generative AI mock 
vi.mock('@google/generative-ai', () => {
  const sendMessageStreamMock = vi.fn();
  const startChatMock = vi.fn(() => ({ sendMessageStream: sendMessageStreamMock }));
  const generateContentMock = vi.fn();
  const getGenerativeModelMock = vi.fn(() => ({
    startChat: startChatMock,
    generateContent: generateContentMock,
  }));
  class GoogleGenerativeAI {
    constructor() {
      this.getGenerativeModel = getGenerativeModelMock;
    }
  }
  GoogleGenerativeAI.__sendMessageStreamMock = sendMessageStreamMock;
  GoogleGenerativeAI.__startChatMock = startChatMock;
  GoogleGenerativeAI.__generateContentMock = generateContentMock;
  GoogleGenerativeAI.__getGenerativeModelMock = getGenerativeModelMock;
  return { GoogleGenerativeAI };
});

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

import {
  streamChatCompletion,
  chatCompletion,
  extractProfileUpdates,
  summariseSession,
} from '../../../services/llmService.js';

// grab  shared mock functions from the classes
const openaiCreate  = OpenAI.__createMock;
const anthropicCreate = Anthropic.__createMock;
const geminiSendStream = GoogleGenerativeAI.__sendMessageStreamMock;
const geminiGenContent = GoogleGenerativeAI.__generateContentMock;

// helper: build a minimal mock SSE response object
function makeFakeRes() {
  const headers = {};
  const written = [];
  return {
    setHeader: (k, v) => { headers[k] = v; },
    write: (chunk) => written.push(chunk),
    end: vi.fn(),
    _headers: headers,
    _written: written,
  };
}

// helper: make an async generator that yields the given chunks
async function* asyncChunks(chunks) {
  for (const c of chunks) yield c;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// streamChatCompetion openai

describe('streamChatCompletion — OpenAI provider', () => {
  it('sets SSE headers and streams delta chunks to the response', async () => {
    const fakeStream = asyncChunks([
      { choices: [{ delta: { content: 'Hello' } }] },
      { choices: [{ delta: { content: ' world' } }] },
      { choices: [{ delta: {} }] },
    ]);
    openaiCreate.mockResolvedValue(fakeStream);

    const res = makeFakeRes();
    const result = await streamChatCompletion({
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompt: 'You are a tutor.',
      provider: 'openai',
      apiKey: null,
      imageFiles: [],
      res,
    });

    expect(res._headers['Content-Type']).toBe('text/event-stream');
    expect(result).toBe('Hello world');
    expect(res.end).toHaveBeenCalledOnce();
    const lastFrame = res._written[res._written.length - 1];
    expect(JSON.parse(lastFrame.replace('data: ', ''))).toMatchObject({ done: true, fullContent: 'Hello world' });
  });

  it('skips empty delta strings', async () => {
    const fakeStream = asyncChunks([
      { choices: [{ delta: { content: '' } }] },
      { choices: [{ delta: { content: 'A' } }] },
    ]);
    openaiCreate.mockResolvedValue(fakeStream);

    const res = makeFakeRes();
    const result = await streamChatCompletion({
      messages: [{ role: 'user', content: 'test' }],
      systemPrompt: 'sys',
      provider: 'openai',
      apiKey: null,
      imageFiles: [],
      res,
    });

    const deltaFrames = res._written.filter(w => {
      try { return JSON.parse(w.replace('data: ', '')).delta !== undefined; } catch { return false; }
    });
    expect(deltaFrames).toHaveLength(1);
    expect(result).toBe('A');
  });

  it('uses a custom API key when provided', async () => {
    openaiCreate.mockResolvedValue(asyncChunks([]));

    const res = makeFakeRes();
    await streamChatCompletion({
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompt: 'sys',
      provider: 'openai',
      apiKey: 'sk-custom',
      imageFiles: [],
      res,
    });
    expect(openaiCreate).toHaveBeenCalledOnce();
  });

  it('includes imageFiles in the messages sent to OpenAI', async () => {
    openaiCreate.mockResolvedValue(asyncChunks([]));

    const res = makeFakeRes();
    await streamChatCompletion({
      messages: [{ role: 'user', content: 'look at this' }],
      systemPrompt: 'sys',
      provider: 'openai',
      apiKey: null,
      imageFiles: [{ mimeType: 'image/png', base64: 'abc' }],
      res,
    });

    const callArgs = openaiCreate.mock.calls[0][0];
    const lastUserMsg = callArgs.messages.find(m => m.role === 'user' && Array.isArray(m.content));
    expect(lastUserMsg).toBeDefined();
    expect(lastUserMsg.content.some(p => p.type === 'image_url')).toBe(true);
  });
});

// streamChatCompletion anthropic

describe('streamChatCompletion — Anthropic provider', () => {
  it('streams content_block_delta events to the response', async () => {
    const fakeStream = asyncChunks([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: ' there' } },
      { type: 'message_stop' },
    ]);
    anthropicCreate.mockResolvedValue(fakeStream);

    const res = makeFakeRes();
    const result = await streamChatCompletion({
      messages: [{ role: 'user', content: 'hello' }],
      systemPrompt: 'sys',
      provider: 'anthropic',
      apiKey: null,
      imageFiles: [],
      res,
    });

    expect(result).toBe('Hi there');
    expect(res._headers['Content-Type']).toBe('text/event-stream');
    expect(res.end).toHaveBeenCalledOnce();
  });

  it('ignores non-text-delta events', async () => {
    const fakeStream = asyncChunks([
      { type: 'message_start', message: {} },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'A' } },
      { type: 'content_block_stop' },
    ]);
    anthropicCreate.mockResolvedValue(fakeStream);

    const res = makeFakeRes();
    const result = await streamChatCompletion({
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompt: 'sys',
      provider: 'anthropic',
      apiKey: null,
      imageFiles: [],
      res,
    });

    expect(result).toBe('A');
  });

  it('injects images into the last user message for Anthropic', async () => {
    anthropicCreate.mockResolvedValue(asyncChunks([]));

    const res = makeFakeRes();
    await streamChatCompletion({
      messages: [{ role: 'user', content: 'look' }],
      systemPrompt: 'sys',
      provider: 'anthropic',
      apiKey: null,
      imageFiles: [{ mimeType: 'image/jpeg', base64: 'xyz' }],
      res,
    });

    const callArgs = anthropicCreate.mock.calls[0][0];
    const lastMsg = callArgs.messages[callArgs.messages.length - 1];
    expect(Array.isArray(lastMsg.content)).toBe(true);
    expect(lastMsg.content.some(p => p.type === 'image')).toBe(true);
  });
});

//streamChatCompletion gemini

describe('streamChatCompletion — Gemini provider', () => {
  it('streams chunks from Gemini to the response', async () => {
    const fakeStream = asyncChunks([
      { text: () => 'Gem' },
      { text: () => 'ini' },
    ]);
    geminiSendStream.mockResolvedValue({ stream: fakeStream });

    const res = makeFakeRes();
    const result = await streamChatCompletion({
      messages: [{ role: 'user', content: 'hello' }],
      systemPrompt: 'sys',
      provider: 'gemini',
      apiKey: null,
      imageFiles: [],
      res,
    });

    expect(result).toBe('Gemini');
    expect(res._headers['Content-Type']).toBe('text/event-stream');
    expect(res.end).toHaveBeenCalledOnce();
  });

  it('skips empty Gemini chunks', async () => {
    const fakeStream = asyncChunks([
      { text: () => '' },
      { text: () => 'X' },
    ]);
    geminiSendStream.mockResolvedValue({ stream: fakeStream });

    const res = makeFakeRes();
    const result = await streamChatCompletion({
      messages: [{ role: 'user', content: 'test' }],
      systemPrompt: 'sys',
      provider: 'gemini',
      apiKey: null,
      imageFiles: [],
      res,
    });

    expect(result).toBe('X');
  });

  it('throws when the last message has empty content (Gemini lastMessage is falsy)', async () => {
    const res = makeFakeRes();
    await expect(
      streamChatCompletion({
        messages: [{ role: 'user', content: '' }],
        systemPrompt: 'sys',
        provider: 'gemini',
        apiKey: null,
        imageFiles: [],
        res,
      })
    ).rejects.toThrow(/No user message/i);
  });

  it('prepends image parts before the text part for Gemini', async () => {
    const fakeStream = asyncChunks([{ text: () => 'ok' }]);
    geminiSendStream.mockResolvedValue({ stream: fakeStream });

    const res = makeFakeRes();
    await streamChatCompletion({
      messages: [{ role: 'user', content: 'see image' }],
      systemPrompt: 'sys',
      provider: 'gemini',
      apiKey: null,
      imageFiles: [{ mimeType: 'image/png', base64: 'imgdata' }],
      res,
    });
    const parts = geminiSendStream.mock.calls[0][0];
    expect(parts.some(p => p.inlineData?.data === 'imgdata')).toBe(true);
  });

  it('merges consecutive same-role messages before sending to Gemini', async () => {
    const fakeStream = asyncChunks([{ text: () => 'ok' }]);
    geminiSendStream.mockResolvedValue({ stream: fakeStream });

    const res = makeFakeRes();
    await streamChatCompletion({
      messages: [
        { role: 'user', content: 'first' },
        { role: 'user', content: 'second' },
      ],
      systemPrompt: 'sys',
      provider: 'gemini',
      apiKey: null,
      imageFiles: [],
      res,
    });

    const startChatArgs = GoogleGenerativeAI.__startChatMock.mock.calls[0][0];
    expect(startChatArgs.history).toHaveLength(0);
  });
});

// chatcompletion openai
describe('chatCompletion — OpenAI provider', () => {
  it('returns the assistant message content', async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: 'Sure, here is an answer.' }, finish_reason: 'stop' }],
    });

    const result = await chatCompletion({
      messages: [{ role: 'user', content: 'What is a loop?' }],
      systemPrompt: 'You are a tutor.',
      provider: 'openai',
    });

    expect(result).toBe('Sure, here is an answer.');
  });

  it('throws when the response content is null (e.g. content_filter)', async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: null }, finish_reason: 'content_filter' }],
    });

    await expect(
      chatCompletion({ messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'sys', provider: 'openai' })
    ).rejects.toThrow(/content_filter/);
  });

  it('sends request in json_object mode when jsonMode is true', async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: '{}' }, finish_reason: 'stop' }],
    });

    await chatCompletion({
      messages: [{ role: 'user', content: 'extract' }],
      systemPrompt: 'sys',
      provider: 'openai',
      jsonMode: true,
    });

    const callArgs = openaiCreate.mock.calls[0][0];
    expect(callArgs.response_format).toEqual({ type: 'json_object' });
  });

  it('does not include response_format when jsonMode is false', async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
    });

    await chatCompletion({
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompt: 'sys',
      provider: 'openai',
      jsonMode: false,
    });

    const callArgs = openaiCreate.mock.calls[0][0];
    expect(callArgs.response_format).toBeUndefined();
  });
});

// chatCompketion anthropic
describe('chatCompletion — Anthropic provider', () => {
  it('returns the text content from the Anthropic response', async () => {
    anthropicCreate.mockResolvedValue({
      content: [{ text: 'Anthropic answer' }],
    });

    const result = await chatCompletion({
      messages: [{ role: 'user', content: 'explain this' }],
      systemPrompt: 'sys',
      provider: 'anthropic',
    });

    expect(result).toBe('Anthropic answer');
  });

  it('throws when Anthropic content is empty', async () => {
    anthropicCreate.mockResolvedValue({ content: [] });

    await expect(
      chatCompletion({ messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'sys', provider: 'anthropic' })
    ).rejects.toThrow(/Empty Anthropic response/);
  });

  it('appends JSON instruction to system prompt when jsonMode is true', async () => {
    anthropicCreate.mockResolvedValue({ content: [{ text: '{}' }] });

    await chatCompletion({
      messages: [{ role: 'user', content: 'extract' }],
      systemPrompt: 'base prompt',
      provider: 'anthropic',
      jsonMode: true,
    });

    const callArgs = anthropicCreate.mock.calls[0][0];
    expect(callArgs.system).toContain('JSON');
  });

  it('maps user and assistant roles correctly', async () => {
    anthropicCreate.mockResolvedValue({ content: [{ text: 'ok' }] });

    await chatCompletion({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
        { role: 'user', content: 'bye' },
      ],
      systemPrompt: 'sys',
      provider: 'anthropic',
    });

    const callArgs = anthropicCreate.mock.calls[0][0];
    expect(callArgs.messages[0].role).toBe('user');
    expect(callArgs.messages[1].role).toBe('assistant');
    expect(callArgs.messages[2].role).toBe('user');
  });
});

// chatCopletion gemini
describe('chatCompletion — Gemini provider', () => {
  it('returns text from the Gemini response', async () => {
    geminiGenContent.mockResolvedValue({
      response: { text: () => 'Gemini answer' },
    });

    const result = await chatCompletion({
      messages: [{ role: 'user', content: 'What is a loop?' }],
      systemPrompt: 'sys',
      provider: 'gemini',
    });

    expect(result).toBe('Gemini answer');
  });

  it('sets responseMimeType when jsonMode is true for Gemini', async () => {
    geminiGenContent.mockResolvedValue({
      response: { text: () => '{}' },
    });

    await chatCompletion({
      messages: [{ role: 'user', content: 'extract' }],
      systemPrompt: 'sys',
      provider: 'gemini',
      jsonMode: true,
    });

    const modelArgs = GoogleGenerativeAI.__getGenerativeModelMock.mock.calls[0][0];
    expect(modelArgs.generationConfig?.responseMimeType).toBe('application/json');
  });

  it('maps assistant to model role for Gemini contents', async () => {
    geminiGenContent.mockResolvedValue({ response: { text: () => 'ok' } });

    await chatCompletion({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
        { role: 'user', content: 'bye' },
      ],
      systemPrompt: 'sys',
      provider: 'gemini',
    });

    const callArgs = geminiGenContent.mock.calls[0][0];
    const roles = callArgs.contents.map(m => m.role);
    expect(roles).toEqual(['user', 'model', 'user']);
  });
});

// extract profile updates
describe('extractProfileUpdates', () => {
  it('returns parsed JSON object when chatCompletion succeeds', async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: '{"strengths":["loops"],"weaknesses":["recursion"]}' }, finish_reason: 'stop' }],
    });

    const result = await extractProfileUpdates('user explained loops correctly', {});
    expect(result.strengths).toEqual(['loops']);
    expect(result.weaknesses).toEqual(['recursion']);
  });

  it('returns an empty object when the LLM call throws', async () => {
    openaiCreate.mockRejectedValue(new Error('API down'));

    const result = await extractProfileUpdates('some conversation', {});
    expect(result).toEqual({});
  });

  it('returns an empty object when the LLM returns invalid JSON', async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: 'not json' }, finish_reason: 'stop' }],
    });

    const result = await extractProfileUpdates('some conversation', {});
    expect(result).toEqual({});
  });
});

//summarize sessions

describe('summariseSession', () => {
  const MESSAGES = [
    { role: 'user', content: 'What is a loop?' },
    { role: 'assistant', content: 'A loop repeats code.' },
    { role: 'user', content: 'Can you give an example?' },
    { role: 'assistant', content: 'Sure: for(int i=0; i<5; i++) {}' },
  ];

  it('returns the summary string from the LLM', async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: 'Discussed loops in Java.' }, finish_reason: 'stop' }],
    });

    const summary = await summariseSession(MESSAGES);
    expect(summary).toBe('Discussed loops in Java.');
  });

  it('returns a fallback string when the LLM call fails', async () => {
    openaiCreate.mockRejectedValue(new Error('Network error'));

    const summary = await summariseSession(MESSAGES);
    expect(summary).toContain('Discussed');
    expect(typeof summary).toBe('string');
  });

  it('fallback uses the last user message content', async () => {
    openaiCreate.mockRejectedValue(new Error('fail'));

    const msgs = [
      { role: 'user', content: 'explain closures in depth' },
      { role: 'assistant', content: 'Closures are...' },
    ];
    const summary = await summariseSession(msgs);
    expect(summary).toContain('explain closures in depth');
  });

  it('handles an empty messages array gracefully in the fallback', async () => {
    openaiCreate.mockRejectedValue(new Error('fail'));

    const summary = await summariseSession([]);
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
  });
});
