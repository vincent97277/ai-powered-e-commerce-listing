import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // Use the automatic JSX runtime so component files don't need to `import React`.
  // (Next.js + tsconfig "jsx": "preserve" delegate JSX transform; vitest runs in
  // raw Node and needs an explicit jsx setting to compile *.tsx tests.)
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000, // RLS test 含 transaction，給寬鬆 timeout
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
