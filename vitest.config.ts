import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Unit-test harness. Pure-logic suites run in the Node environment; component
// tests (jsdom + Testing Library) opt into jsdom per-file via a
// `// @vitest-environment jsdom` docblock, so the Node suites stay DOM-free and
// fast. The React plugin owns the JSX/TSX transform (the app's tsconfig uses
// `jsx: preserve`, which the bundler would otherwise leave untransformed).
const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirror tsconfig's "@/*": ["./*"] so `@/lib/...` resolves in tests. The
    // regex form matches only the `@/` prefix, leaving scoped npm packages
    // (e.g. @tanstack/react-query) untouched.
    alias: [{ find: /^@\//, replacement: resolve(root) + '/' }]
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx']
  }
});
