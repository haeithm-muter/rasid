/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

/**
 * إعداد مستقل لتشغيل التقييم الكمّي (`npm run eval`).
 *
 * مفصول عن `vite.config.ts` عمداً: التقييم يمرّ على 12 كشفاً كاملاً ويكتب ملفاً
 * على القرص، فلا محلّ له داخل `npm run test` الذي يجب أن يبقى سريعاً ونظيفاً
 * بلا آثار جانبية.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['eval/**/*.eval.ts'],
    // التقييم يطبع تقريره بنفسه؛ لا داعي لضجيج مُبلِّغ الاختبارات
    reporters: [['default', { summary: false }]],
  },
});
