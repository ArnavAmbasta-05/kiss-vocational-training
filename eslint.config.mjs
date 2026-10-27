import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'guidance/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: [
      'apps/api/**/*.ts',
      'prisma/**/*.ts',
      '**/*.config.{js,cjs,mjs,ts}',
      '**/scripts/**/*.mjs',
      'perf/**/*.mjs',
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // k6 scripts run in k6's own runtime, which provides __ENV.
    files: ['perf/**/*.js'],
    languageOptions: { globals: { __ENV: 'readonly' } },
  },
  {
    files: ['apps/api/**/*.{js,cjs}', 'api/**/*.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
    languageOptions: { globals: { ...globals.node }, sourceType: 'commonjs' },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is forbidden (CLAUDE.md rule 11).',
        },
      ],
    },
  },
  prettier,
);
