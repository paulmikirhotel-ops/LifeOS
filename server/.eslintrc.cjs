module.exports = {
  root: true,
  env: { node: true, es2023: true },
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
  ignorePatterns: ['node_modules', 'dist', 'coverage', 'uploads'],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': 'off',
  },
};
