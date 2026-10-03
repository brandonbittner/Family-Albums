module.exports = {
  root: true,
  extends: [
    'expo',
    'plugin:@typescript-eslint/recommended',
    'prettier', // must be last — disables style rules that conflict with Prettier
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    'react-hooks/exhaustive-deps': 'warn',
  },
  env: {
    node: true,
  },
  ignorePatterns: [
    'node_modules/',
    '.expo/',
    'dist/',
    'supabase/.temp/',
    'supabase/functions/', // Deno — npm: specifiers aren't resolvable by Node ESLint
  ],
};
