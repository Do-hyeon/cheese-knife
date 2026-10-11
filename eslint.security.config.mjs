import security from 'eslint-plugin-security';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

export default [
  { ignores: ['vendor/**', 'node_modules/**', 'tests/**', 'dist/**', 'dist-firefox/**', 'output/**', '.superpowers/**', 'scripts/hls-hardening.mjs', 'scripts/vendor-hls.mjs'] },
  {
    files: ['*.js', '*.mjs', 'web/**/*.js', 'scripts/**/*.mjs'],
    plugins: { security, 'no-unsanitized': noUnsanitized },
    rules: {
      ...security.configs.recommended.rules,
      ...noUnsanitized.configs.recommended.rules,
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
];
