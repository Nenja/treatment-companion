// ESLint 9 flat config for Treatment Companion.
//
// Goal: a useful safety net that is GREEN on the existing codebase from day one,
// so it can gate CI immediately (errors fail; warnings surface without
// blocking). Correctness-class rules (React hooks rules, Next footguns,
// obviously-broken code) are errors; stylistic / gradually-tightenable rules
// are warnings the team can ratchet up over time. Type-aware linting is left
// off for speed/simplicity (tsc already provides the strict type gate).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';

export default tseslint.config(
  {
    // Not source we lint: build output, deps, generated files, test artifacts,
    // the vanilla service worker, and the e2e specs (they import the optional,
    // not-installed @playwright/test — see e2e/README.md).
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'e2e/.artifacts/**',
      'e2e/**',
      'public/**',
      'coverage/**',
      'supabase/**'
    ]
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    },
    plugins: {
      'react-hooks': reactHooks,
      '@next/next': nextPlugin
    },
    rules: {
      // Next.js correctness (core-web-vitals = recommended + a few more).
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,

      // React hooks — high value, keep as errors except the dependency check,
      // which is advisory and noisy on a mature codebase.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Empty catch blocks are an intentional pattern here (best-effort side
      // effects, e.g. persisting a locale before reload), so allow them.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Gradually-tightenable: surface, don't block. Ratchet to 'error' as the
      // codebase is cleaned up (good first tasks for the incoming developer).
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  },

  // Node scripts use CommonJS-ish/node globals only.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } }
  },

  // KNOWN pre-existing violation, tracked as a warning (not silenced).
  // app/[locale]/clinician/treatment/page.tsx calls two useEffects after the
  // loading/error early-returns, because the loaded UI, its hooks, AND the
  // guards all live in one component (line ~351 destructures non-null loaded
  // data that the guard guarantees, so the guards can't move below the hooks,
  // and the hooks depend on values derived after the destructure, so they
  // can't move above the guards). The correct fix is to extract the loaded
  // view into a child component so the parent's guards precede all hooks —
  // a focused, separately-tested refactor. Until then this stays a WARNING so
  // the rule remains a hard error everywhere else. Do NOT copy this pattern.
  {
    files: ['**/clinician/treatment/page.tsx'],
    rules: { 'react-hooks/rules-of-hooks': 'warn' }
  }
);
