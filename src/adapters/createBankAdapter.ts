/**
 * مصنع المحوّلات: يحوّل وصفاً تعريفياً (`BankAdapterSpec`) إلى `BankAdapter` عامل.
 *
 * كل منطق التحويل المشترك يعيش هنا مرة واحدة: مطابقة الترويسة، تحليل التاريخ
 * والمبلغ والعملة، وتخطّي الصفوف التالفة. ملف البنك الجديد يصف أعمدته فقط.
 */

import { extractCurrency, isBlankCell, tryParseAmount } from '../core/amountParser';
import { tryParseDate } from '../core/dateParser';
import { normalizeForComparison } from '../core/text';
import type { CsvRow, Direction, ParseResult, SkippedRow, Transaction } from '../core/types';
import type { BankAdapter, BankAdapterSpec, ColumnAliases } from './types';

/** قيم عمود "نوع العملية" التي تعني خصماً (بعد التطبيع). */
const DEBIT_VALUES: readonly string[] = [
  'DEBIT', 'DR', 'WITHDRAWAL', 'PURCHASE', 'PAYMENT', 'مدين', 'سحب', 'خصم', 'شراء',
];

/** قيم عمود "نوع العملية" التي تعني إيداعاً (بعد التطبيع). */
const CREDIT_VALUES: readonly string[] = [
  'CREDIT', 'CR', 'DEPOSIT', 'REFUND', 'دائن', 'ايداع', 'اضافه', 'استرداد',
];

/** أدوار الأعمدة التي قد يحتاجها محوّل. */
type ColumnRole = 'date' | 'description' | 'currency' | 'amount' | 'direction' | 'debit' | 'credit';

/** اسم العمود الفعلي في الملف لكل دور مطلوب. */
type ResolvedColumns = Partial<Record<ColumnRole, string>>;

/**
 * يبحث عن أول عمود في الملف يطابق أحد الأسماء البديلة.
 * المقارنة بالتساوي التام بعد التطبيع (وليس بالاحتواء) حتى لا يبتلع الاسم
 * العام `Amount` عموداً أخص مثل `Debit Amount`.
 *
 * @param headers أسماء الأعمدة المطبَّعة مقرونة بأسمائها الأصلية
 * @param aliases الأسماء البديلة المقبولة لهذا الدور
 * @returns اسم العمود الأصلي، أو `undefined` إن لم يوجد
 */
function findColumn(
  headers: readonly (readonly [normalized: string, original: string])[],
  aliases: ColumnAliases,
): string | undefined {
  const normalizedAliases = aliases.map((alias) => normalizeForComparison(alias));
  for (const [normalized, original] of headers) {
    if (normalizedAliases.includes(normalized)) return original;
  }
  return undefined;
}

/**
 * يربط أدوار الأعمدة بأسمائها الفعلية في الملف.
 *
 * @param spec وصف تنسيق البنك
 * @param headers أسماء الأعمدة كما وردت
 * @returns الأعمدة المُحلَّة، و`null` إن نقص عمود إلزامي
 */
function resolveColumns(spec: BankAdapterSpec, headers: readonly string[]): ResolvedColumns | null {
  const indexed = headers.map(
    (header) => [normalizeForComparison(header), header] as readonly [string, string],
  );

  const date = findColumn(indexed, spec.columns.date);
  const description = findColumn(indexed, spec.columns.description);
  if (date === undefined || description === undefined) return null;

  const resolved: ResolvedColumns = { date, description };

  if (spec.columns.currency !== undefined) {
    const currency = findColumn(indexed, spec.columns.currency);
    if (currency !== undefined) resolved.currency = currency;
  }

  if (spec.amount.kind === 'signed') {
    const amount = findColumn(indexed, spec.amount.amount);
    if (amount === undefined) return null;
    resolved.amount = amount;

    if (spec.amount.direction !== undefined) {
      const direction = findColumn(indexed, spec.amount.direction);
      if (direction !== undefined) resolved.direction = direction;
    }
  } else {
    const debit = findColumn(indexed, spec.amount.debit);
    const credit = findColumn(indexed, spec.amount.credit);
    if (debit === undefined || credit === undefined) return null;
    resolved.debit = debit;
    resolved.credit = credit;
  }

  return resolved;
}

/**
 * يقرأ عمود الاتجاه إن وُجد.
 *
 * @param cell قيمة خلية نوع العملية
 * @returns الاتجاه، أو `null` إذا لم تكن القيمة معروفة
 */
function directionFromCell(cell: string | undefined): Direction | null {
  if (isBlankCell(cell)) return null;
  const normalized = normalizeForComparison(cell as string);
  if (DEBIT_VALUES.some((value) => normalized.includes(normalizeForComparison(value)))) {
    return 'debit';
  }
  if (CREDIT_VALUES.some((value) => normalized.includes(normalizeForComparison(value)))) {
    return 'credit';
  }
  return null;
}

/**
 * يحدّد عملة الصف: عمود العملة أولاً، ثم الرمز داخل خلية المبلغ، ثم الافتراضي.
 *
 * @param cell قيمة عمود العملة إن وُجد
 * @param currencyFromAmount العملة المستخرجة من خلية المبلغ
 * @param fallback عملة المحوّل الافتراضية
 * @returns رمز ISO-4217
 */
function resolveCurrency(
  cell: string | undefined,
  currencyFromAmount: string | null,
  fallback: string,
): string {
  if (!isBlankCell(cell)) {
    const fromSymbol = extractCurrency(cell as string);
    if (fromSymbol !== null) return fromSymbol;

    const normalized = normalizeForComparison(cell as string);
    if (/^[A-Z]{3}$/.test(normalized)) return normalized;
  }
  return currencyFromAmount ?? fallback;
}

/** المبلغ والاتجاه والعملة المستخرجة من صف واحد. */
type AmountOutcome =
  | { ok: true; amount: number; direction: Direction; currencyFromAmount: string | null }
  | { ok: false; reason: string };

/**
 * يستخرج المبلغ والاتجاه من صف حسب تمثيل البنك (عمود مُشار أو عمودان).
 *
 * @param spec وصف تنسيق البنك
 * @param columns الأعمدة المُحلَّة
 * @param row الصف الخام
 * @returns المبلغ الموجب مع اتجاهه، أو سبب التخطّي
 */
function extractAmount(
  spec: BankAdapterSpec,
  columns: ResolvedColumns,
  row: CsvRow,
): AmountOutcome {
  if (spec.amount.kind === 'signed') {
    const cell = row[columns.amount as string];
    if (isBlankCell(cell)) return { ok: false, reason: 'خلية المبلغ فارغة' };

    const parsed = tryParseAmount(cell as string);
    if (parsed === null) return { ok: false, reason: `مبلغ غير صالح: "${cell}"` };

    const fromColumn =
      columns.direction === undefined ? null : directionFromCell(row[columns.direction]);
    const direction: Direction = fromColumn ?? (parsed.value < 0 ? 'debit' : 'credit');

    return {
      ok: true,
      amount: Math.abs(parsed.value),
      direction,
      currencyFromAmount: parsed.currency,
    };
  }

  const debitCell = row[columns.debit as string];
  const creditCell = row[columns.credit as string];

  const debit = isBlankCell(debitCell) ? null : tryParseAmount(debitCell as string);
  const credit = isBlankCell(creditCell) ? null : tryParseAmount(creditCell as string);

  if (!isBlankCell(debitCell) && debit === null) {
    return { ok: false, reason: `مبلغ مدين غير صالح: "${debitCell}"` };
  }
  if (!isBlankCell(creditCell) && credit === null) {
    return { ok: false, reason: `مبلغ دائن غير صالح: "${creditCell}"` };
  }

  // بعض البنوك تكتب 0.00 في العمود غير المستخدم بدل تركه فارغاً.
  const debitValue = debit !== null && debit.value !== 0 ? Math.abs(debit.value) : null;
  const creditValue = credit !== null && credit.value !== 0 ? Math.abs(credit.value) : null;

  if (debitValue === null && creditValue === null) {
    return { ok: false, reason: 'لا يوجد مبلغ في عمودي المدين والدائن' };
  }
  if (debitValue !== null && creditValue !== null) {
    return { ok: false, reason: 'المدين والدائن ممتلئان معاً — صف غامض' };
  }

  const isDebit = debitValue !== null;
  return {
    ok: true,
    amount: (isDebit ? debitValue : creditValue) as number,
    direction: isDebit ? 'debit' : 'credit',
    currencyFromAmount: (isDebit ? debit?.currency : credit?.currency) ?? null,
  };
}

/**
 * يبني محوّلاً بنكياً عاملاً من وصف تعريفي.
 *
 * @param spec وصف أعمدة البنك وصيغه
 * @returns محوّل جاهز للتسجيل التلقائي
 */
export function createBankAdapter(spec: BankAdapterSpec): BankAdapter {
  return {
    id: spec.id,
    label: spec.label,
    dateFormat: spec.dateFormat,
    defaultCurrency: spec.defaultCurrency,

    match(headers: readonly string[]): number {
      const columns = resolveColumns(spec, headers);
      if (columns === null) return 0;
      // عدد الأعمدة المتعرَّف عليها: المحوّل الأكثر تخصّصاً يفوز عند التنافس.
      return Object.keys(columns).length;
    },

    parse(rows: readonly CsvRow[]): ParseResult {
      const transactions: Transaction[] = [];
      const skipped: SkippedRow[] = [];

      const firstRow = rows[0];
      if (firstRow === undefined) return { transactions, skipped };

      const columns = resolveColumns(spec, Object.keys(firstRow));
      if (columns === null) {
        return {
          transactions,
          skipped: rows.map((row, index) => ({
            index,
            row,
            reason: `الأعمدة المطلوبة لتنسيق ${spec.id} غير موجودة`,
          })),
        };
      }

      rows.forEach((row, index) => {
        const dateCell = row[columns.date as string] ?? '';
        const date = tryParseDate(dateCell, spec.dateFormat);
        if (date === null) {
          skipped.push({ index, row, reason: `تاريخ غير صالح: "${dateCell}"` });
          return;
        }

        const description = (row[columns.description as string] ?? '').trim();
        if (description === '') {
          skipped.push({ index, row, reason: 'وصف العملية فارغ' });
          return;
        }

        const outcome = extractAmount(spec, columns, row);
        if (!outcome.ok) {
          skipped.push({ index, row, reason: outcome.reason });
          return;
        }

        transactions.push({
          date,
          description,
          amount: outcome.amount,
          currency: resolveCurrency(
            columns.currency === undefined ? undefined : row[columns.currency],
            outcome.currencyFromAmount,
            spec.defaultCurrency,
          ),
          direction: outcome.direction,
        });
      });

      return { transactions, skipped };
    },
  };
}
