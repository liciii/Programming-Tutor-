import { describe, it, expect } from 'vitest';
import { detectIntent, injectImagesOpenAI, injectImagesAnthropic, trimMessages } from '../../../services/llmService.js';

describe('detectIntent', () => {
  it('returns default-explain for explanation keywords', () => {
    expect(detectIntent('explain what a loop is')).toBe('default-explain');
    expect(detectIntent('what is a variable?')).toBe('default-explain');
    expect(detectIntent('how does recursion work')).toBe('default-explain');
    expect(detectIntent('tell me about closures')).toBe('default-explain');
    expect(detectIntent('help me understand async')).toBe('default-explain');
    expect(detectIntent('describe inheritance')).toBe('default-explain');
  });

  it('returns default-exercise for practice keywords', () => {
    expect(detectIntent('give me an exercise')).toBe('default-exercise');
    expect(detectIntent('I want to practice loops')).toBe('default-exercise');
    expect(detectIntent('give me a challenge')).toBe('default-exercise');
    expect(detectIntent('create a task for me')).toBe('default-exercise');
    expect(detectIntent('assign me a problem')).toBe('default-exercise');
  });

  it('returns default-debug for debugging keywords', () => {
    expect(detectIntent('I found a bug in my code')).toBe('default-debug');
    expect(detectIntent('there is an error')).toBe('default-debug');
    expect(detectIntent('this is broken')).toBe('default-debug');
    expect(detectIntent('it is not working')).toBe('default-debug');
    expect(detectIntent('why does this fail?')).toBe('default-debug');
    expect(detectIntent('can you fix this')).toBe('default-debug');
  });

  it('returns default-quiz for quiz keywords', () => {
    expect(detectIntent('quiz me on arrays')).toBe('default-quiz');
    expect(detectIntent('test me on this topic')).toBe('default-quiz');
    expect(detectIntent('ask me a question')).toBe('default-quiz');
    expect(detectIntent('check my knowledge')).toBe('default-quiz');
  });

  it('returns default-feedback for code review keywords', () => {
    expect(detectIntent('please review my code')).toBe('default-feedback');
    expect(detectIntent('give me feedback')).toBe('default-feedback');
    expect(detectIntent('check my code')).toBe('default-feedback');
    expect(detectIntent('look at this function')).toBe('default-feedback');
  });

  it('falls back to default-explain for unrecognised input', () => {
    expect(detectIntent('hello')).toBe('default-explain');
    expect(detectIntent('')).toBe('default-explain');
    expect(detectIntent('thanks')).toBe('default-explain');
  });

  it('is case-insensitive', () => {
    expect(detectIntent('EXPLAIN this concept')).toBe('default-explain');
    expect(detectIntent('DEBUG my code')).toBe('default-debug');
    expect(detectIntent('QUIZ me')).toBe('default-quiz');
  });
});

// trimMessages 
describe('trimMessages', () => {
  const msg = (role, content) => ({ role, content });

  it('returns the array unchanged when it is within the 40-message limit', () => {
    const messages = Array.from({ length: 10 }, (_, i) => msg('user', `msg ${i}`));
    expect(trimMessages(messages)).toBe(messages);
  });

  it('keeps only the last 40 messages when the array exceeds the limit', () => {
    const messages = Array.from({ length: 50 }, (_, i) => msg('user', `msg ${i}`));
    const trimmed = trimMessages(messages);
    expect(trimmed).toHaveLength(40);
    expect(trimmed[0].content).toBe('msg 10');
    expect(trimmed[39].content).toBe('msg 49');
  });

  it('returns the array unchanged when it is exactly 40 messages', () => {
    const messages = Array.from({ length: 40 }, (_, i) => msg('user', String(i)));
    expect(trimMessages(messages)).toBe(messages);
  });
});

// injectImagesOpenAI 
describe('injectImagesOpenAI', () => {
  const img = { mimeType: 'image/png', base64: 'abc123' };

  it('returns messages unchanged when imageFiles is empty', () => {
    const messages = [{ role: 'user', content: 'hello' }];
    expect(injectImagesOpenAI(messages, [])).toBe(messages);
  });

  it('converts the last user message content to an array with text + images', () => {
    const messages = [
      { role: 'user', content: 'look at this' },
    ];
    const result = injectImagesOpenAI(messages, [img]);
    expect(result[0].content).toEqual([
      { type: 'text', text: 'look at this' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
    ]);
  });

  it('only modifies the last user message, leaving others intact', () => {
    const messages = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'last' },
    ];
    const result = injectImagesOpenAI(messages, [img]);
    expect(result[0].content).toBe('first');
    expect(result[1].content).toBe('reply');
    expect(Array.isArray(result[2].content)).toBe(true);
  });

  it('returns messages unchanged when there is no user message', () => {
    const messages = [{ role: 'assistant', content: 'hi' }];
    expect(injectImagesOpenAI(messages, [img])).toBe(messages);
  });

  it('injects multiple images in order', () => {
    const imgs = [
      { mimeType: 'image/png', base64: 'first' },
      { mimeType: 'image/jpeg', base64: 'second' },
    ];
    const result = injectImagesOpenAI([{ role: 'user', content: 'hi' }], imgs);
    expect(result[0].content).toHaveLength(3); // text + 2 images
    expect(result[0].content[1].image_url.url).toContain('first');
    expect(result[0].content[2].image_url.url).toContain('second');
  });
});

// injectImagesAnthropic 
describe('injectImagesAnthropic', () => {
  const img = { mimeType: 'image/png', base64: 'abc123' };

  it('returns messages unchanged when imageFiles is empty', () => {
    const messages = [{ role: 'user', content: 'hello' }];
    expect(injectImagesAnthropic(messages, [])).toBe(messages);
  });

  it('prepends images before the text part in the last user message', () => {
    const messages = [{ role: 'user', content: 'look at this' }];
    const result = injectImagesAnthropic(messages, [img]);
    expect(result[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'abc123' },
    });
    expect(result[0].content[1]).toEqual({ type: 'text', text: 'look at this' });
  });

  it('maps assistant role correctly', () => {
    const messages = [
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'follow-up' },
    ];
    const result = injectImagesAnthropic(messages, [img]);
    expect(result[0].role).toBe('assistant');
    expect(result[1].role).toBe('user');
  });

  it('returns messages unchanged when there is no user message', () => {
    const messages = [{ role: 'assistant', content: 'hi' }];
    expect(injectImagesAnthropic(messages, [img])).toBe(messages);
  });
});
