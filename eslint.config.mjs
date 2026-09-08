import tseslint from 'typescript-eslint';
import productCopy from './scripts/eslint/product-copy.mjs';
import domainNames from './scripts/eslint/domain-names.mjs';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.expo/**', '**/.expo-home/**', '**/target/**'] },
  {
    files: ['apps/**/*.{js,jsx,mjs,ts,tsx}', 'packages/**/*.{js,jsx,mjs,ts,tsx,mts}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { schiild: { rules: { 'product-copy': productCopy, 'domain-names': domainNames } } },
    rules: { 'schiild/product-copy': 'error', 'schiild/domain-names': 'error' },
  },
];
