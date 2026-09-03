const reactHooks = require('eslint-plugin-react-hooks');

module.exports = {
  root: true,
  env: { browser: true, es2023: true },
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: { ecmaVersion: 2023, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['react', 'react-hooks', 'react-refresh'],
  ignorePatterns: ['dist', 'node_modules'],
  rules: {
    'react/jsx-uses-vars': 'error',
    ...reactHooks.configs.recommended.rules,
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
};
