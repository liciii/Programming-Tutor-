import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    env: {
      JWT_SECRET: 'test-secret',
      OPENAI_API_KEY: 'sk-test-key',
    },
    coverage: {
      provider: 'v8',
      include: ['middleware/**', 'routes/**', 'services/**'],
      exclude: ['node_modules/**'],
      reporter: ['text', 'html'],
    },
  },
});
