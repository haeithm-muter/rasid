/**
 * خط التحليل الكامل في دالة واحدة: من بايتات الملف إلى ما تعرضه الشاشة.
 *
 * هذا هو الملف الذي يستدعيه العامل (Web Worker) — ولا يستدعي هو شيئاً من
 * المتصفح. الفصل مقصود: كل ما هنا دوال نقية قابلة للاختبار في Node، والعامل
 * مجرّد غلاف يمرّر الرسائل. لولا ذلك لصار اختبار خط المعالجة يتطلّب متصفحاً.
 *
 * الخطوات الخمس مفصولة ومعلَنة عبر `onProgress` لسبب عملي: شريط التقدّم في
 * الواجهة يجب أن يعكس عملاً حقيقياً وقع فعلاً، لا رسماً متحرّكاً يوهم بالانشغال.
 */

import { summarizeDecision } from './decision';
import type { DecisionSummary } from './decision';
import { parseCsv } from './csv';
import { decodeCsvBytes } from './csv';
import { detectSubscriptions } from './detectionEngine';
import type { DetectionReport } from './detectionEngine';
import { detectAdapter, getAdapterById } from '../adapters';
import { NoMatchingAdapterError } from './errors';
import type { SkippedRow, Transaction } from './types';

/** مراحل خط المعالجة بترتيبها. */
export type AnalysisStage =
  | 'decoding'
  | 'parsing'
  | 'converting'
  | 'detecting'
  | 'summarizing'
  | 'done';

/** ▲ نسب التقدّم عند نهاية كل مرحلة ▲ — تقديرية بحسب تكلفة كل خطوة عملياً. */
export const STAGE_PROGRESS: Readonly<Record<AnalysisStage, number>> = {
  decoding: 0.1,
  parsing: 0.3,
  converting: 0.5,
  detecting: 0.9,
  summarizing: 0.97,
  done: 1,
};

/** مُبلِّغ التقدّم — يُستدعى بعد كل مرحلة. */
export type ProgressHandler = (stage: AnalysisStage, ratio: number) => void;

/** نتيجة تحليل كشف حساب كامل — كل ما تحتاجه الواجهة للعرض. */
export type AnalysisResult = {
  /** معرّف المحوّل المستخدم. */
  adapterId: string;
  /** اسمه المعروض. */
  adapterLabel: string;
  /** الترميز الذي قُرئ به الملف (`utf-8` أو `windows-1256`...). */
  encoding: string;
  /** أسماء الأعمدة كما وردت. */
  headers: string[];
  /** عدد الصفوف في الملف (بلا صف الترويسة). */
  rowCount: number;
  /** العمليات الصالحة. */
  transactionCount: number;
  /** الصفوف التي تعذّر تحويلها مع أسبابها. */
  skippedRows: SkippedRow[];
  /** أول تاريخ في الكشف. */
  firstDate: string | null;
  /** آخر تاريخ فيه. */
  lastDate: string | null;
  /** ناتج محرك الكشف الخام. */
  report: DetectionReport;
  /** الملخّص بعد تطبيق قرارات `decision.ts`. */
  summary: DecisionSummary;
};

/** خيارات التحليل. */
export type AnalyzeOptions = {
  /** معرّف محوّل يُفرض يدوياً حين يفشل الكشف التلقائي. */
  adapterId?: string;
  /** مُبلِّغ التقدّم. */
  onProgress?: ProgressHandler;
};

/** يستدعي مُبلِّغ التقدّم إن وُجد. */
function report(options: AnalyzeOptions, stage: AnalysisStage): void {
  options.onProgress?.(stage, STAGE_PROGRESS[stage]);
}

/**
 * يحلّل كشف حساب من نصّه.
 *
 * @param text نص ملف CSV
 * @param options المحوّل المفروض ومُبلِّغ التقدّم
 * @returns نتيجة التحليل كاملة
 * @throws {CsvParseError | AdapterDetectionError} عند فشل القراءة أو كشف التنسيق
 */
export function analyzeCsvText(text: string, options: AnalyzeOptions = {}): AnalysisResult {
  const table = parseCsv(text);
  report(options, 'parsing');

  const adapter =
    options.adapterId === undefined
      ? detectAdapter(table.headers)
      : (getAdapterById(options.adapterId) ??
        (() => {
          throw new NoMatchingAdapterError(table.headers, [options.adapterId as string]);
        })());

  const { transactions, skipped } = adapter.parse(table.rows);
  report(options, 'converting');

  const detection = detectSubscriptions(transactions);
  report(options, 'detecting');

  const summary = summarizeDecision(detection.candidates);
  report(options, 'summarizing');

  const dates = transactions.map((transaction: Transaction) => transaction.date).sort();

  const result: AnalysisResult = {
    adapterId: adapter.id,
    adapterLabel: adapter.label,
    encoding: 'utf-8',
    headers: table.headers,
    rowCount: table.rows.length,
    transactionCount: transactions.length,
    skippedRows: skipped,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    report: detection,
    summary,
  };

  report(options, 'done');
  return result;
}

/**
 * يحلّل كشف حساب من بايتات الملف مباشرة (`File.arrayBuffer()`).
 *
 * فكّ الترميز خطوة منفصلة معلَنة لأنها ليست مجانية: الملفات العربية القديمة
 * تُقرأ مرّتين (محاولة UTF-8 صارمة ثم `windows-1256`).
 *
 * @param bytes محتوى الملف الخام
 * @param options المحوّل المفروض ومُبلِّغ التقدّم
 * @returns نتيجة التحليل مع الترميز المكتشف
 * @throws {CsvParseError | AdapterDetectionError} عند فشل القراءة أو كشف التنسيق
 */
export function analyzeCsvBytes(
  bytes: Uint8Array | ArrayBuffer,
  options: AnalyzeOptions = {},
): AnalysisResult {
  const { text, encoding } = decodeCsvBytes(bytes);
  report(options, 'decoding');
  return { ...analyzeCsvText(text, options), encoding };
}
