/**
 * واجهة المحوّلات البنكية.
 *
 * كل بنك = ملف واحد في `src/adapters/` ينتهي بـ `.adapter.ts` ويصدّر محوّلاً
 * افتراضياً (default export). التسجيل تلقائي في `src/adapters/index.ts`،
 * فإضافة بنك جديد لا تتطلّب تعديل أي ملف قائم.
 */

import type { DateFormat } from '../core/dateParser';
import type { CsvRow, ParseResult } from '../core/types';

/**
 * محوّل تنسيق بنكي: يتعرّف على ترويسة الملف ويحوّل صفوفه إلى `Transaction[]`.
 */
export interface BankAdapter {
  /** معرّف ثابت وفريد يُستخدم في الاختيار اليدوي وفي الاختبارات. */
  readonly id: string;

  /** اسم معروض للمستخدم (عربي + إنجليزي). */
  readonly label: string;

  /** صيغة التاريخ التي يصدّر بها هذا البنك — تمنع لبس DD/MM مع MM/DD. */
  readonly dateFormat: DateFormat;

  /** العملة المفترضة حين لا يذكرها الملف. */
  readonly defaultCurrency: string;

  /**
   * يقيس مدى مطابقة هذا المحوّل لترويسة ملف.
   *
   * @param headers أسماء الأعمدة كما وردت في الملف
   * @returns 0 = لا يطابق إطلاقاً، وكلما زاد الرقم زادت خصوصية المطابقة
   */
  match(headers: readonly string[]): number;

  /**
   * يحوّل صفوف CSV الخام إلى عمليات موحّدة.
   *
   * الصفوف التالفة لا توقف الملف — تُجمع في `skipped` مع سبب واضح.
   *
   * @param rows صفوف البيانات (بلا صف الترويسة)
   * @returns العمليات الصالحة + الصفوف المتخطّاة
   */
  parse(rows: readonly CsvRow[]): ParseResult;
}

/** أسماء بديلة محتملة لعمود واحد (تُقارن بعد التطبيع). */
export type ColumnAliases = readonly string[];

/**
 * كيف يمثّل البنك المبلغ:
 * - `signed`: عمود واحد بإشارة (`-45.00` أو `(45.00)`)، مع عمود اتجاه اختياري.
 * - `split`: عمودان منفصلان للمدين والدائن، أحدهما فارغ في كل صف.
 */
export type AmountSpec =
  | {
      kind: 'signed';
      /** عمود المبلغ المُشار. */
      amount: ColumnAliases;
      /** عمود نوع العملية (اختياري) — يتقدّم على إشارة الرقم إن وُجد. */
      direction?: ColumnAliases;
    }
  | {
      kind: 'split';
      /** عمود المسحوبات. */
      debit: ColumnAliases;
      /** عمود الإيداعات. */
      credit: ColumnAliases;
    };

/** وصف تعريفي كامل لتنسيق بنك — هذا كل ما يحتاجه ملف محوّل جديد. */
export type BankAdapterSpec = {
  id: string;
  label: string;
  dateFormat: DateFormat;
  defaultCurrency: string;
  /** أعمدة التاريخ والوصف والعملة. */
  columns: {
    date: ColumnAliases;
    description: ColumnAliases;
    /** عمود العملة (اختياري). */
    currency?: ColumnAliases;
  };
  /** تمثيل المبلغ. */
  amount: AmountSpec;
};
