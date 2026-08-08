/**
 * خط الاستيراد الكامل: من بايتات ملف CSV إلى `Transaction[]` موحّد.
 *
 * هذه هي نقطة الدخول التي ستستدعيها الواجهة في الجزء 3، والتي يعتمد عليها
 * محرك الكشف في الجزء 2 للحصول على مدخلاته.
 */

import { detectAdapter, getAdapterById } from '../adapters';
import type { BankAdapter } from '../adapters/types';
import { decodeCsvBytes, parseCsv } from './csv';
import { NoMatchingAdapterError } from './errors';
import type { CsvTable, SkippedRow, Transaction } from './types';

/** ناتج استيراد كشف حساب كامل. */
export type ImportResult = {
  /** العمليات الموحّدة الجاهزة لمحرك الكشف. */
  transactions: Transaction[];
  /** الصفوف التي تعذّر تحويلها، مع سبب كل واحدة. */
  skipped: SkippedRow[];
  /** المحوّل الذي استُخدم فعلياً. */
  adapter: BankAdapter;
  /** أسماء الأعمدة كما وردت في الملف. */
  headers: string[];
};

/** خيارات الاستيراد. */
export type ImportOptions = {
  /**
   * معرّف محوّل يُفرض يدوياً بدل الكشف التلقائي — يُستخدم حين يفشل الكشف
   * ويختار المستخدم بنكه من القائمة.
   */
  adapterId?: string;
};

/**
 * يحوّل جدول CSV محلَّلاً مسبقاً إلى عمليات موحّدة.
 *
 * @param table الجدول الناتج من `parseCsv`
 * @param options خيارات الاستيراد (اختيار محوّل يدوياً)
 * @returns العمليات والصفوف المتخطّاة والمحوّل المستخدم
 * @throws {NoMatchingAdapterError} إذا كان `adapterId` غير معروف
 * @throws {AdapterDetectionError} إذا فشل الكشف التلقائي
 */
export function importTable(table: CsvTable, options: ImportOptions = {}): ImportResult {
  let adapter: BankAdapter;

  if (options.adapterId !== undefined) {
    const chosen = getAdapterById(options.adapterId);
    if (chosen === undefined) {
      throw new NoMatchingAdapterError(table.headers, [options.adapterId]);
    }
    adapter = chosen;
  } else {
    adapter = detectAdapter(table.headers);
  }

  const { transactions, skipped } = adapter.parse(table.rows);
  return { transactions, skipped, adapter, headers: table.headers };
}

/**
 * يستورد كشف حساب من نص CSV.
 *
 * @param text نص الملف
 * @param options خيارات الاستيراد
 * @returns نتيجة الاستيراد الكاملة
 * @throws {CsvParseError | AdapterDetectionError} عند فشل القراءة أو الكشف
 */
export function importCsvText(text: string, options: ImportOptions = {}): ImportResult {
  return importTable(parseCsv(text), options);
}

/**
 * يستورد كشف حساب من بايتات الملف مباشرة (مخرجات `File.arrayBuffer()`).
 * يتكفّل بفكّ الترميز، بما فيه الملفات غير UTF-8.
 *
 * @param bytes محتوى الملف الخام
 * @param options خيارات الاستيراد
 * @returns نتيجة الاستيراد مع اسم الترميز المكتشف
 * @throws {CsvParseError | AdapterDetectionError} عند فشل القراءة أو الكشف
 */
export function importCsvBytes(
  bytes: Uint8Array | ArrayBuffer,
  options: ImportOptions = {},
): ImportResult & { encoding: string } {
  const { text, encoding } = decodeCsvBytes(bytes);
  return { ...importCsvText(text, options), encoding };
}
