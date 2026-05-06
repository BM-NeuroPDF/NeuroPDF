import { defineConfig, globalIgnores } from 'eslint/config';
import { FlatCompat } from '@eslint/eslintrc';
import coreWebVitals from 'eslint-config-next/core-web-vitals.js';
import nextTypescript from 'eslint-config-next/typescript.js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import eslintPluginEslintComments from 'eslint-plugin-eslint-comments';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

export default defineConfig([
  ...compat.config(coreWebVitals),
  ...compat.config(nextTypescript),
  {
    plugins: {
      'eslint-comments': eslintPluginEslintComments,
    },
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@next/next/no-img-element': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      // react-hooks v7 (via eslint-config-next 16): çok agresif; ayrı refaktör konusu.
      'react-hooks/set-state-in-effect': 'off',
      'react/no-unescaped-entities': 'off',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'eslint-comments/disable-enable-pair': 'error',
      'eslint-comments/no-aggregating-enable': 'error',
      'eslint-comments/no-duplicate-disable': 'error',
      'eslint-comments/no-unlimited-disable': 'error',
      'eslint-comments/no-unused-disable': 'error',
      'eslint-comments/no-unused-enable': 'error',
      'eslint-comments/require-description': 'error',
    },
  },
  globalIgnores([
    'node_modules/**',
    '.next/**',
    'coverage/**',
    'playwright-report/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'public/**',
    '**/*.config.*',
    // eslint.config.mjs matches **/*.config.*; Next CLI probes it for @next/next — must not be ignored.
    '!eslint.config.mjs',
    '!src/auth.config.ts',
  ]),
  eslintConfigPrettier,
]);
