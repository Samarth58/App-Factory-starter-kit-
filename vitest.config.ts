import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
    globalSetup: ['./tests/globalSetup.ts'],
    setupFiles: ['./tests/preSetup.ts', './tests/setup.ts'],
  },
});
