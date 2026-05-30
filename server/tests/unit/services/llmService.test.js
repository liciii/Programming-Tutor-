import { describe, it, expect } from 'vitest';
import { detectIntent } from '../../../services/llmService.js';

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
