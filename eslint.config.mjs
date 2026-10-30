import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  { files: ['**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  { ignores: ['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts', 'scripts/sw-template.js'] },
];

export default config;
