import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@ai-assistant/core': path.resolve(import.meta.dirname, 'packages/core/src/index.ts'),
      '@ai-assistant/server': path.resolve(import.meta.dirname, 'packages/server/src/index.ts'),
      '@ai-assistant/widget': path.resolve(import.meta.dirname, 'packages/widget/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
    testTimeout: 60000,
  },
});
