import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  react: true,
  formatters: false,
  rules: {
    // ── Project style: match Prettier config (double quotes + semicolons) ──
    'style/quotes': ['error', 'double', { avoidEscape: true }],
    'style/semi': ['error', 'always'],
    'style/member-delimiter-style': ['error', { multiline: { delimiter: 'semi', requireLast: true }, singleline: { delimiter: 'semi', requireLast: false } }],
    'style/brace-style': ['error', '1tbs'],
    'style/arrow-parens': ['error', 'always'],

    // ── Disable rules that conflict with Prettier ──
    'style/operator-linebreak': 'off',
    'style/multiline-ternary': 'off',
    'style/jsx-wrap-multilines': 'off',
    'style/jsx-one-expression-per-line': 'off',
    'antfu/if-newline': 'off',
    'unicorn/number-literal-case': 'off',

    // ── Node: allow process.env / Buffer globals ───
    'node/prefer-global/process': 'off',
    'node/prefer-global/buffer': 'off',

    // ── TypeScript relaxations ──
    'ts/strict-boolean-expressions': 'off',
    'ts/promise-function-async': 'off',
    // ts/no-floating-promises requires type info — skip for now

    // ── Import / export conventions ──
    'import/no-default-export': 'warn',
    'perfectionist/sort-imports': 'warn',

    // ── Empty blocks: allow empty catch with comment ──
    'no-empty': ['error', { allowEmptyCatch: true }],
    '@typescript-eslint/no-empty-function': 'off',

    // ── General quality ──
    'prefer-const': 'error',
    'antfu/consistent-list-newline': 'warn',

    // ── React: relax set-state-in-effect (common sync pattern) ──
    'react/set-state-in-effect': 'off',
    'react/exhaustive-deps': 'warn',
  },
  ignores: [
    'node_modules/',
    'out/',
    'release/',
    'build/',
    '*.config.js',
    'vitest.config.ts',
    'eslint.config.js',
    '*.md',
  ],
})
