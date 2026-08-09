/**
 * نقطة تشغيل التقييم: `npm run eval`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * لماذا يُشغَّل عبر vitest بدل `node` مباشرة
 * ═══════════════════════════════════════════════════════════════════════════
 * `src/adapters/index.ts` يسجّل المحوّلات عبر `import.meta.glob` من Vite —
 * وهو ما يجعل إضافة بنك جديد ملفاً واحداً بلا تعديل أي كود قائم. الثمن أن
 * تشغيل الكود خارج أدوات Vite يحتاج طبقة تحويل. vitest موجود أصلاً في المشروع
 * ويوفّرها بالضبط، فاستعماله هنا يتجنّب اعتمادية جديدة لمجرّد تشغيل سكربت.
 *
 * الملف يُلتقط بإعداد مستقل (`vitest.eval.config.ts`) فلا يدخل ضمن
 * `npm run test` ولا يبطّئه.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import { runEvaluation } from './measure';
import { renderConsoleSummary, renderResultsMarkdown } from './report';

/** مسار ملف النتائج المولَّد. */
const RESULTS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'RESULTS.md');

it('يقيس أداء محرك الكشف ويكتب eval/RESULTS.md', () => {
  // تاريخ التشغيل هو الشيء الوحيد غير الحتمي في التقرير، ويُحقن من هنا وحده
  const generatedAt = new Date().toISOString().slice(0, 10);

  const report = runEvaluation({ generatedAt });

  mkdirSync(dirname(RESULTS_PATH), { recursive: true });
  writeFileSync(RESULTS_PATH, renderResultsMarkdown(report), 'utf8');

  console.log(renderConsoleSummary(report));
  console.log(`كُتب التقرير الكامل في: eval/RESULTS.md\n`);
}, 120_000);
