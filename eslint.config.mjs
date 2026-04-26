// @ts-check
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Minimal ESLint flat config for the Nakiros monorepo.
 *
 * Scope is intentionally narrow: parse TS/TSX files via typescript-eslint and
 * enforce a single rule — `no-restricted-syntax` — that forbids hardcoded
 * channel-name string literals as the first argument to `invoke()` /
 * `subscribe()`. Every IPC channel must flow through `IPC_CHANNELS[...]`
 * from `@nakiros/shared` (CLAUDE.md mandate).
 *
 * `eslint-plugin-react-hooks` is loaded as a plugin (no rules enabled) so the
 * existing `// eslint-disable-next-line react-hooks/exhaustive-deps` directives
 * scattered across the frontend resolve cleanly. Enabling those rules would
 * surface a real backlog — keep that for a dedicated session.
 *
 * No `typescript-eslint/recommended` ruleset for the same reason — adding one
 * would surface a large backlog unrelated to this guard.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      'apps/frontend/node_modules/.vite/**',
      'docs/technical/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    linterOptions: {
      // The codebase carries `// eslint-disable-next-line react-hooks/exhaustive-deps`
      // markers on intentional skipped useEffect deps. We don't enable the rule yet,
      // so flagging these as "unused" would just create noise.
      reportUnusedDisableDirectives: 'off',
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // Forbid literal channel strings on the first arg of invoke()/subscribe().
      // Forces callers to go through `IPC_CHANNELS['…']` from @nakiros/shared
      // so a typo turns into a compile-time error instead of a runtime 404.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.name='invoke'][arguments.0.type='Literal']",
          message:
            "IPC channel must come from IPC_CHANNELS['…'] (@nakiros/shared) — no string literal as first arg of invoke().",
        },
        {
          selector:
            "CallExpression[callee.name='subscribe'][arguments.0.type='Literal']",
          message:
            "IPC channel must come from IPC_CHANNELS['…'] (@nakiros/shared) — no string literal as first arg of subscribe().",
        },
      ],
    },
  },
);
