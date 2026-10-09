import { defineConfig } from 'vitest/config';

const isUnitOnly = process.argv.some(
  (arg) =>
    arg.includes('generateModule') ||
    arg.includes('integrateModule'),
);

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
    globalSetup: isUnitOnly ? [] : ['./tests/globalSetup.ts'],
    setupFiles: isUnitOnly ? [] : ['./tests/preSetup.ts', './tests/setup.ts'],
  },
});
