import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 15_000,
    exclude: ['**/node_modules/**', '**/dist/**', '**/contract.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 }
    }
  }
});
