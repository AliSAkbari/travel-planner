import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist', 'coverage'] },
  // ESLint's own recommended rules for plain JavaScript mistakes.
  js.configs.recommended,
  // TypeScript-aware versions of those rules, plus TS-specific ones (e.g. no-explicit-any).
  tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      // Type-aware linting: lets rules ask the TypeScript compiler about types.
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // A promise that is neither awaited nor handled can fail silently.
      // Needs type information to know which expressions are promises.
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
);
