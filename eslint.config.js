// Configuracao do ESLint (formato "flat config", ESLint 9 ou superior).
// Roda no pipeline de CI a cada pull request: se houver erro, o merge
// fica bloqueado ate a correcao.
import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node }
        },
        rules: {
            // Parametros com prefixo "_" sao ignorados de proposito, como o
            // "_proximo" do tratador de erro do Express, que precisa ter
            // quatro parametros para ser reconhecido como tal.
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
            eqeqeq: ['error', 'always'],
            'prefer-const': 'error'
        }
    }
];
