/**
 * كتابة تقرير التقييم بصيغة Markdown.
 *
 * مفصول عن `measure.ts` عمداً: ذاك يقيس وهذا يعرض، فلا يختلط تغيير في شكل
 * الجدول بتغيير في طريقة الحساب. لا رقم يُحسب هنا — كل ما في هذا الملف تنسيق
 * لأرقام جاءت جاهزة من `runEvaluation`.
 */

import type { CycleKind } from '../src/core/periodicity';
import type { SeedKind } from '../src/core/synthetic';
import type { EvaluationReport, FlagAccuracy } from './measure';
import { percent } from './measure';

/** الأسماء العربية لأنواع البذور، للعرض في جداول التقرير. */
const SEED_LABELS: Readonly<Record<SeedKind | 'غير منسوب', string>> = {
  'subscription-monthly': 'اشتراك شهري ثابت',
  'subscription-drifting-28d': 'اشتراك بدورة 28 يوماً',
  'subscription-annual': 'اشتراك سنوي',
  'subscription-price-increase': 'اشتراك ارتفع سعره',
  'subscription-free-trial': 'تجربة مجانية تحوّلت',
  'subscription-cancelled': 'اشتراك أُلغي',
  'subscription-fx-wobble': 'اشتراك متذبذب بصرف العملة',
  'subscription-skipped-month': 'اشتراك فُقد منه شهر',
  'noise-rent': 'إيجار شهري',
  'noise-groceries': 'بقالة أسبوعية',
  'noise-recurring': 'وقود كل عشرة أيام',
  'noise-random': 'شراء متفرّق',
  'noise-refund': 'مبلغ مسترد',
  'noise-malformed': 'صف بوصف فارغ',
  'غير منسوب': 'غير منسوب',
};

/** الأسماء العربية لأنواع الدورات. */
const CYCLE_LABELS: Readonly<Record<CycleKind, string>> = {
  weekly: 'أسبوعي',
  semimonthly: 'نصف شهري',
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
  semiannual: 'نصف سنوي',
  annual: 'سنوي',
  irregular: 'غير منتظم',
};

/** يبني جدول Markdown من ترويسة وصفوف. */
function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return '_لا توجد حالات._\n';
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

/** يعرض دقة وسم في سطرين. */
function flagLines(title: string, accuracy: FlagAccuracy): string {
  return [
    `### ${title}`,
    '',
    `- الحالات المزروعة بين الاشتراكات المكتشفة: **${accuracy.expected}**`,
    `- التُقطت بالوسم الصحيح: **${accuracy.correctlyFlagged}** (${percent(accuracy.recall)})`,
    `- وسوم على مجموعات لم تُزرع فيها الحالة: **${accuracy.falselyFlagged}**` +
      (accuracy.correctlyFlagged + accuracy.falselyFlagged > 0
        ? ` — دقة الوسم ${percent(accuracy.precision)}`
        : ''),
  ].join('\n');
}

/**
 * يحوّل تقرير التقييم إلى نص `eval/RESULTS.md` كاملاً.
 *
 * @param report التقرير من `runEvaluation`
 * @returns محتوى الملف
 */
export function renderResultsMarkdown(report: EvaluationReport): string {
  const { confusion } = report;

  const sections: string[] = [];

  sections.push(
    [
      '# نتائج التقييم الكمّي لرصيد',
      '',
      '> **هذا الملف مولَّد آلياً — لا يُحرَّر يدوياً.** أعد إنتاجه بأمر واحد:',
      '>',
      '> ```bash',
      '> npm run eval',
      '> ```',
      '',
      `- **تاريخ التشغيل:** ${report.generatedAt}`,
      `- **عتبة الثقة المعتمدة:** ${report.threshold.toFixed(2)} (\`SUBSCRIPTION_CONFIDENCE_THRESHOLD\` في \`src/core/decision.ts\`)`,
      `- **الكشوف:** ${report.statements.length} كشفاً اصطناعياً بحقيقة أرضية معروفة`,
      `- **العمليات:** ${report.totalTransactions} عملية قُرئت من ${report.totalRows} صفاً`,
      '',
      'كل الأرقام أدناه مقيسة على خط المعالجة الحقيقي كاملاً: قراءة ملف CSV،',
      'كشف تنسيق البنك، توحيد أسماء التجّار، ثم محرك الكشف — بلا حقن عمليات جاهزة.',
    ].join('\n'),
  );

  sections.push(
    [
      '## 1. النتيجة الرئيسية',
      '',
      `| المقياس | القيمة |`,
      `| --- | --- |`,
      `| **recall** (كم من الاشتراكات الحقيقية وجدها) | **${percent(confusion.recall)}** |`,
      `| **precision** (كم مما أعلنه كان اشتراكاً فعلاً) | **${percent(confusion.precision)}** |`,
      `| F1 | ${percent(confusion.f1)} |`,
      `| صحيح موجب (TP) | ${confusion.truePositives} |`,
      `| خاطئ موجب (FP) | ${confusion.falsePositives} |`,
      `| خاطئ سالب (FN) | ${confusion.falseNegatives} |`,
      `| كشف تنسيق البنك تلقائياً | ${percent(report.adapterDetectionRatio)} |`,
    ].join('\n'),
  );

  sections.push(
    [
      '## 2. recall حسب نوع الحالة',
      '',
      'الرقم المجمّع وحده يخفي أين تقع الأخطاء. هذا الجدول يفصّلها حالةً حالة:',
      '',
      table(
        ['نوع الحالة المزروعة', 'العدد', 'وُجد', 'recall'],
        report.recallByKind.map((row) => [
          SEED_LABELS[row.kind],
          String(row.total),
          String(row.found),
          percent(row.ratio),
        ]),
      ),
    ].join('\n'),
  );

  sections.push(
    [
      '## 3. الأداء',
      '',
      `- **زمن المعالجة لكل 1000 عملية: ${report.msPer1000.toFixed(0)} مللي ثانية**`,
      `- وسيط ${report.timingRepeats} تشغيلات؛ المدى بينها ` +
        `${report.msPer1000Range.fastest.toFixed(0)}–${report.msPer1000Range.slowest.toFixed(0)} مللي ثانية`,
      '',
      'القياس يشمل خط المعالجة كاملاً (فكّ الترميز، تحليل CSV، كشف التنسيق،',
      'توحيد أسماء التجّار، ومحرك الكشف) على معالج جهاز التطوير.',
      '',
      '**الوسيط لا المتوسط** — لنفس السبب الذي يقوم عليه المحرك: التشغيلة الأولى',
      'تدفع ثمن تسخين مترجم JIT، وأي نشاط عابر على الجهاز يلوّث تشغيلة بعينها.',
      'المتوسط ينجرف خلفهما، والوسيط لا. والمدى معروض بجانبه حتى لا يُقرأ الرقم',
      'كأنه ثابت فيزيائي: **هو خاصية جهاز القياس بقدر ما هو خاصية الكود**.',
    ].join('\n'),
  );

  sections.push(
    [
      '## 4. دقة تصنيف نوع الدورة',
      '',
      `أصاب المحرك في **${report.cycle.correct}** من **${report.cycle.total}** اشتراكاً مكتشفاً — ${percent(report.cycle.ratio)}.`,
      '',
      table(
        ['الدورة الحقيقية', 'العدد', 'أصاب', 'النسبة', 'صُنّفت خطأً كـ'],
        report.cycle.byCycle.map((row) => [
          CYCLE_LABELS[row.cycle],
          String(row.total),
          String(row.correct),
          percent(row.total === 0 ? 0 : row.correct / row.total),
          row.confusedWith.length === 0
            ? '—'
            : row.confusedWith.map((kind) => CYCLE_LABELS[kind as CycleKind] ?? kind).join('، '),
        ]),
      ),
    ].join('\n'),
  );

  sections.push(
    [
      '## 5. دقة كشف الحالات الخاصة',
      '',
      flagLines('زيادات الأسعار الصامتة', report.priceIncrease),
      '',
      flagLines('التجارب المجانية المتحوّلة', report.freeTrial),
    ].join('\n'),
  );

  sections.push(
    [
      '## 6. الحالات الفائتة (false negatives) وأسبابها',
      '',
      report.missed.length === 0
        ? '_لم يفت أي اشتراك._'
        : 'كل اشتراك حقيقي لم تصل إليه القائمة، مع السبب التقريبي:',
      '',
      table(
        ['الكشف', 'النوع', 'التاجر', 'عدد الخصوم', 'أعلى ثقة', 'السبب التقريبي'],
        report.missed.map((miss) => [
          miss.statementId,
          SEED_LABELS[miss.kind],
          miss.brand,
          String(miss.occurrences),
          miss.bestConfidence === null ? '—' : miss.bestConfidence.toFixed(2),
          miss.cause,
        ]),
      ),
    ].join('\n'),
  );

  sections.push(
    [
      '## 7. الأخطاء الموجبة (false positives)',
      '',
      report.falsePositives.length === 0
        ? '_لم تُعلَن أي مجموعة اشتراكاً بلا أن تكون كذلك._'
        : 'ما أعلنه المحرك اشتراكاً وليس كذلك في الحقيقة الأرضية:',
      '',
      table(
        ['الكشف', 'المجموعة', 'أصلها الحقيقي', 'الثقة', 'عدد العمليات'],
        report.falsePositives.map((item) => [
          item.statementId,
          item.merchant,
          SEED_LABELS[item.seedKind],
          item.confidence.toFixed(2),
          String(item.occurrences),
        ]),
      ),
    ].join('\n'),
  );

  sections.push(
    [
      '## 8. مسح العتبات',
      '',
      'من هذا الجدول عُويرت `SUBSCRIPTION_CONFIDENCE_THRESHOLD`. السطر المعلَّم',
      'بـ **◄** هو العتبة المعتمدة حالياً في الكود.',
      '',
      table(
        ['العتبة', 'recall', 'precision', 'F1', 'TP', 'FP', 'FN', ''],
        report.sweep.map((point) => [
          point.threshold.toFixed(2),
          percent(point.recall),
          percent(point.precision),
          percent(point.f1),
          String(point.truePositives),
          String(point.falsePositives),
          String(point.falseNegatives),
          Math.abs(point.threshold - report.threshold) < 1e-9 ? '**◄**' : '',
        ]),
      ),
    ].join('\n'),
  );

  sections.push(
    [
      '## 9. تفصيل الكشوف',
      '',
      table(
        ['الكشف', 'التنسيق', 'كُشف تلقائياً', 'الشهور', 'الصفوف', 'العمليات', 'صفوف متخطّاة', 'اشتراكات حقيقية', 'وُجد منها'],
        report.statements.map((statement) => [
          statement.id,
          statement.adapterId,
          statement.adapterDetected ? 'نعم' : 'لا',
          String(statement.months),
          String(statement.rows),
          String(statement.transactions),
          String(statement.skippedRows),
          String(statement.groundTruthSubscriptions),
          String(statement.detected),
        ]),
      ),
      '',
      'الصفوف المتخطّاة هي الأوصاف الفارغة المزروعة عمداً كأخطاء واقعية — تُتخطّى',
      'بسبب مقروء ولا توقف قراءة الملف.',
    ].join('\n'),
  );

  return `${sections.join('\n\n---\n\n')}\n`;
}

/**
 * يكتب ملخّصاً مختصراً للطرفية (لا للملف).
 *
 * @param report التقرير
 * @returns أسطر جاهزة للطباعة
 */
export function renderConsoleSummary(report: EvaluationReport): string {
  return [
    '',
    '════════ نتائج التقييم الكمّي ════════',
    `  الكشوف          : ${report.statements.length}`,
    `  العمليات        : ${report.totalTransactions}`,
    `  العتبة          : ${report.threshold.toFixed(2)}`,
    '  ─────────────────────────────────',
    `  recall          : ${percent(report.confusion.recall)}`,
    `  precision       : ${percent(report.confusion.precision)}`,
    `  F1              : ${percent(report.confusion.f1)}`,
    `  TP / FP / FN    : ${report.confusion.truePositives} / ${report.confusion.falsePositives} / ${report.confusion.falseNegatives}`,
    '  ─────────────────────────────────',
    `  تصنيف الدورة    : ${percent(report.cycle.ratio)} (${report.cycle.correct}/${report.cycle.total})`,
    `  زيادة السعر     : ${percent(report.priceIncrease.recall)} (${report.priceIncrease.correctlyFlagged}/${report.priceIncrease.expected})`,
    `  تجربة متحوّلة   : ${percent(report.freeTrial.recall)} (${report.freeTrial.correctlyFlagged}/${report.freeTrial.expected})`,
    `  كشف التنسيق     : ${percent(report.adapterDetectionRatio)}`,
    '  ─────────────────────────────────',
    `  زمن لكل 1000    : ${report.msPer1000.toFixed(0)} مللي ثانية ` +
      `(وسيط ${report.timingRepeats}، المدى ${report.msPer1000Range.fastest.toFixed(0)}–${report.msPer1000Range.slowest.toFixed(0)})`,
    '══════════════════════════════════════',
    '',
  ].join('\n');
}
