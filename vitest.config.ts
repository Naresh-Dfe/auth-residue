import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,mjs}'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    reporters: ['default'],
  },
});
