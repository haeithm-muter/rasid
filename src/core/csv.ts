/**
 * قراءة ملفات CSV وتحويلها إلى جدول موحّد (`CsvTable`).
 *
 * هذه الطبقة لا تعرف شيئاً عن البنوك — مهمتها فكّ الترميز، تحليل النص،
 * وتنظيف أسماء الأعمدة فقط. اختيار البنك مسؤولية `src/adapters`.
 */

import { parse } from 'papaparse';
import { CsvParseError } from './errors';
import type { CsvRow, CsvTable } from './types';
import { collapseWhitespace, stripBom, stripInvisibleMarks } from './text';

/** ناتج فكّ ترميز ملف CSV. */
export type DecodedCsv = {
  /** نص الملف بعد فكّ الترميز. */
  text: string;
  /** اسم الترميز المستخدم فعلياً (مثل `'utf-8'` أو `'windows-1256'`). */
  encoding: string;
};

/**
 * الترميز البديل عند فشل UTF-8. `windows-1256` هو الترميز العربي الشائع
 * في ملفات Excel المصدَّرة من أنظمة بنكية قديمة.
 */
const ARABIC_LEGACY_ENCODING = 'windows-1256';

/**
 * يفكّ ترميز بايتات ملف CSV إلى نص.
 *
 * الترتيب: علامة ترتيب البايت (BOM) إن وجدت → UTF-8 صارم → `windows-1256`.
 * الصرامة مقصودة: بدونها يبتلع UTF-8 البايتات العربية القديمة ويحوّلها إلى `�`
 * بصمت، فينتج كشف حساب كامل بأوصاف مشوّهة.
 *
 * @param bytes محتوى الملف الخام
 * @returns النص وترميزه
 * @throws {CsvParseError} إذا تعذّر فكّ الترميز بأي طريقة
 */
export function decodeCsvBytes(bytes: Uint8Array | ArrayBuffer): DecodedCsv {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  if (data.length === 0) {
    throw new CsvParseError('الملف فارغ — لا يحتوي أي بيانات.');
  }

  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    return { text: decodeWith(data, 'utf-8'), encoding: 'utf-8' };
  }
  if (data[0] === 0xff && data[1] === 0xfe) {
    return { text: decodeWith(data, 'utf-16le'), encoding: 'utf-16le' };
  }
  if (data[0] === 0xfe && data[1] === 0xff) {
    return { text: decodeWith(data, 'utf-16be'), encoding: 'utf-16be' };
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    return { text, encoding: 'utf-8' };
  } catch {
    // ليس UTF-8 صالحاً → على الأرجح ترميز عربي قديم
  }

  try {
    return { text: decodeWith(data, ARABIC_LEGACY_ENCODING), encoding: ARABIC_LEGACY_ENCODING };
  } catch {
    throw new CsvParseError('تعذّر التعرّف على ترميز الملف. احفظه بترميز UTF-8 وأعد المحاولة.');
  }
}

/**
 * يفكّ الترميز بترميز محدّد ويحذف BOM من أول النص.
 *
 * @param data البايتات
 * @param encoding اسم الترميز
 * @returns النص بلا BOM
 */
function decodeWith(data: Uint8Array, encoding: string): string {
  return stripBom(new TextDecoder(encoding).decode(data));
}

/**
 * ينظّف اسم عمود: حذف BOM والمحارف الخفية وعلامات الاقتباس الزائدة وضغط المسافات.
 *
 * @param header الاسم الخام كما ورد في صف الترويسة
 * @returns الاسم المنظّف
 */
function cleanHeader(header: string): string {
  return collapseWhitespace(stripInvisibleMarks(header).replace(/^["']+|["']+$/g, ''));
}

/**
 * يضمن أسماء أعمدة فريدة وغير فارغة.
 * الأعمدة بلا اسم تصبح `عمود_1`، والأسماء المكرّرة تُلحق برقم (`المبلغ_2`).
 *
 * @param headers أسماء الأعمدة بعد التنظيف
 * @returns أسماء فريدة بنفس الترتيب
 */
function ensureUniqueHeaders(headers: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header, index) => {
    const base = header === '' ? `عمود_${index + 1}` : header;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

/**
 * يحلّل نص CSV إلى جدول موحّد.
 *
 * يتعرّف تلقائياً على الفاصل (`,` أو `;` أو تبويب أو `|`) لأن ملفات Excel
 * العربية تُصدَّر كثيراً بالفاصلة المنقوطة. الصفوف الناقصة تُملأ بقيم فارغة
 * بدل رفضها، ليقرر المحوّل لاحقاً هل الصف صالح أم يُتخطّى.
 *
 * @param text نص الملف بعد فكّ الترميز
 * @returns الجدول: أسماء الأعمدة + الصفوف
 * @throws {CsvParseError} إذا كان الملف فارغاً أو بلا صف ترويسة صالح
 */
export function parseCsv(text: string): CsvTable {
  const withoutBom = stripBom(text);

  if (withoutBom.trim() === '') {
    throw new CsvParseError('الملف فارغ — لا يحتوي أي بيانات.');
  }

  const result = parse<string[]>(withoutBom, {
    header: false,
    // `true` وليس `'greedy'`: الوضع الشره يحذف صف الترويسة نفسه إن كانت كل
    // خلاياه فارغة، فيرتقي صف بيانات ليصير ترويسة بصمت. نحذف الصفوف الفارغة
    // من البيانات يدوياً بعد فصل الترويسة.
    skipEmptyLines: true,
    delimiter: '', // فراغ = اكتشاف تلقائي للفاصل
  });

  const rawRows = result.data.filter((row) => Array.isArray(row));
  const headerRow = rawRows[0];

  if (headerRow === undefined) {
    throw new CsvParseError('الملف فارغ — لا يحتوي أي بيانات.');
  }

  const cleanedHeaders = headerRow.map((cell) => cleanHeader(cell ?? ''));
  if (cleanedHeaders.every((header) => header === '')) {
    throw new CsvParseError('لم يُعثر على صف ترويسة صالح (أسماء الأعمدة فارغة).');
  }

  const headers = ensureUniqueHeaders(cleanedHeaders);

  const rows: CsvRow[] = rawRows
    .slice(1)
    .filter((cells) => cells.some((cell) => String(cell ?? '').trim() !== ''))
    .map((cells) => {
      const row: CsvRow = {};
      headers.forEach((header, index) => {
        const cell = cells[index];
        row[header] = cell === undefined || cell === null ? '' : String(cell).trim();
      });
      return row;
    });

  return { headers, rows };
}

/**
 * اختصار: فكّ الترميز ثم التحليل في خطوة واحدة.
 *
 * @param bytes محتوى الملف الخام (من `File.arrayBuffer()` في المتصفح)
 * @returns الجدول مع اسم الترميز المستخدم
 * @throws {CsvParseError} عند فشل الترميز أو التحليل
 */
export function parseCsvBytes(bytes: Uint8Array | ArrayBuffer): CsvTable & { encoding: string } {
  const { text, encoding } = decodeCsvBytes(bytes);
  return { ...parseCsv(text), encoding };
}
