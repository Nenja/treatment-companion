import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit-test harness. The first suite is pure-logic, so it runs in the Node
// environment and the only new dependency is vitest itself. Component/DOM
// tests (jsdom + Testing Library) or end-to-end tests (Playwright) can be
// layered on later without changing this baseline.
const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*": ["./*"] so `@/lib/...` resolves in tests. The
    // regex form matches only the `@/` prefix, leaving scoped npm packages
    // (e.g. @tanstack/react-query) untouched.
    alias: [{ find: /^@\//, replacement: resolve(root) + '/' }]
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
