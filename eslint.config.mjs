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
import jsxA11y from 'eslint-plugin-jsx-a11y';
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

  // Accessibility — surface recommended a11y issues as WARNINGS so they don't
  // block CI (0-error gate) but show up for the team to fix. Ratchet to 'error'
  // once clean. Pairs with the WCAG 2.2 AA real-device pass on the roadmap.
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      ...Object.fromEntries(
        Object.keys(jsxA11y.flatConfigs.recommended.rules).map((rule) => [rule, 'warn'])
      ),
      // Deprecated and superseded by label-has-associated-control; noisy duplicate.
      'jsx-a11y/label-has-for': 'off'
    }
  }
);
