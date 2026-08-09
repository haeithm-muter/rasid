/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * ▲ سياسة أمان المحتوى ▲ — الطبقة التي تحرس شرط "صفر شبكة" آلياً.
 *
 * الشرط الأساسي في هذا المشروع أن ملف المستخدم لا يغادر جهازه. مراجعة الكود
 * تكفي اليوم، لكنها تعتمد على انتباه بشري في كل تعديل قادم. هذه السياسة تجعل
 * **المتصفح نفسه** هو الحارس: لو تسلّل يوماً سطر يستدعي خطاً خارجياً أو
 * تحليلات أو واجهة برمجية، يُمنع الطلب ويُسجَّل في الطرفية بدل أن يمرّ صامتاً.
 *
 * - `default-src 'self'` — لا مورد من خارج أصل الصفحة إطلاقاً
 * - `connect-src 'none'` — **يقطع `fetch` وXHR وWebSocket نهائياً**؛ التطبيق
 *   لا يستعمل أياً منها، وإعلان ذلك صراحةً يمنع إضافتها سهواً
 * - `form-action 'none'` — لا إرسال نموذج إلى أي وجهة
 * - `worker-src 'self' blob:` — العامل يُحمَّل من ملف محلي مبنيّ مع التطبيق
 * - `style-src` يسمح بالمضمّن لأن React يمرّر `style` لعرض أعمدة الرسم
 *
 * `frame-ancestors` غائبة عمداً: المتصفح **يتجاهلها** حين تصل عبر وسم `meta`
 * ويسجّل تحذيراً في الطرفية، فوجودها هنا ضجيج لا حماية. مكانها ترويسة HTTP
 * يضبطها الخادم، وGitHub Pages لا يسمح بضبط الترويسات.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'self'",
  "worker-src 'self' blob:",
].join('; ');

/**
 * يحقن وسم CSP في الصفحة المبنيّة وحدها.
 *
 * لا يُطبَّق في التطوير عمداً: خادم Vite يحقن نصوصاً مضمّنة للتحديث الحيّ،
 * فتمنعها السياسة ويتعطّل `npm run dev` بلا مقابل — الصفحة المنشورة وحدها هي
 * التي تصل إلى مستخدم حقيقي.
 *
 * @returns إضافة Vite
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'rasid-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            injectTo: 'head-prepend',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: CONTENT_SECURITY_POLICY,
            },
          },
        ],
      };
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  /**
   * مسارات نسبية في الملف المبنيّ.
   *
   * ضروري للنشر على GitHub Pages: المشروع يُخدَّم من مسار فرعي
   * (`/<repo>/`) لا من جذر النطاق، والمسارات المطلقة تكسر تحميل الحزم
   * والعامل هناك. النسبية تعمل في الحالتين.
   */
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  test: {
    // كل المنطق في src/core و src/adapters دوال نقية — لا حاجة لبيئة متصفح
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
