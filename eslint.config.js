import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Тонкий flat-config: recommended + Prettier-compat.
 * Цель — дисциплина без перекройки существующего стиля:
 * ошибки блокируют, warnings чиним по ходу работы.
 *
 * `Phaser` — глобаль Phaser 3 (window.Phaser): debug-скрипты читают её
 * внутри page.evaluate(...), как и остальное окружение браузера.
 */
export default [
  { ignores: ['node_modules/', 'dist/'] },

  {
    files: ['src/**/*.js', 'debug/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, Phaser: 'readonly' }
    },
    rules: {
      ...js.configs.recommended.rules,
      ...prettierConfig.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },

  {
    // Автотесты ходят под Node (process, fs) и являются рабочим
    // слесарным кодом: while(true)-прокрутки и пустые catch — приёмы
    // этой папки, не предмет дисциплины
    files: ['debug/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node }
    },
    rules: {
      'no-async-promise-executor': 'off',
      'no-constant-condition': 'off',
      'no-empty': 'off'
    }
  }
];
