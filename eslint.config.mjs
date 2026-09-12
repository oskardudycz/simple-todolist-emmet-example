import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
    {ignores: ['dist/', 'node_modules/', '.build-kit/', '.claude/']},
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            // TypeScript resolves globals and imports itself, so the base rule
            // only reports false positives here.
            'no-undef': 'off',
            // Slice handlers keep the positional parameters Emmett calls them
            // with, whether or not they read them.
            '@typescript-eslint/no-unused-vars': ['error', {args: 'none'}],
            // A slice that decides without state models it as an empty object.
            '@typescript-eslint/no-empty-object-type': ['error', {allowObjectTypes: 'always'}],
        },
    },
    prettier,
);
