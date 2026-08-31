// @ts-check

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfiPrettier from 'eslint-config-prettier'

export default tseslint.config({
    languageOptions: {
        parserOptions: {
            project: true,
            tsconfigRootDir: import.meta.dirname
        }
    },
    files: ['**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended, eslintConfiPrettier],
    rules: {
        'no-console': 'error',
        'no-useless-catch': 0,
        quotes: [
            'error',
            'single',
            {
                allowTemplateLiterals: true
            }
        ]
    }
})
