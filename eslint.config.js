import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        __dirname: 'readonly',
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': 'warn',
    },
  },
  {
    // Config files run under Node, not the browser — they need `process`,
    // not the browser globals the rest of the app's source uses.
    files: ['*.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // TypeScript migration (in progress, coexisting with the .js/.jsx
    // above via tsconfig.json's allowJs). Type-checking itself happens
    // via `npm run typecheck` (tsc); @typescript-eslint here covers the
    // style/correctness rules tsc doesn't, like no-unused-vars done
    // properly for types/imports.
    files: ['**/*.{ts,tsx}'],
    extends: [
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
])
