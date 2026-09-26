import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts: tests need none of the library build, and its type-declaration
// plugin fails to load under vitest.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
