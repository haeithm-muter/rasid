/**
 * تحليل المبالغ من خلايا CSV.
 *
 * خلايا المبالغ في كشوف الحسابات فوضوية: `"1,234.50 SAR"`، `"﷼ ١٬٢٣٤٫٥٠"`،
 * `"(45.00)"` للسالب، `"250.00 DR"`، `"-1.234,56"` بالنمط الأوروبي.
 * هذا الملف يفكّ كل ذلك إلى رقم + رمز عملة.
 */

import { AmountParseError } from './errors';
import { stripInvisibleMarks, toLatinDigits } from './text';

/** ناتج تحليل خلية مبلغ. */
export type ParsedAmount = {
  /** القيمة الرقمية بإشارتها (سالبة تعني خصماً). */
  value: number;
  /** رمز العملة ISO-4217 إن أمكن استخراجه من الخلية نفسها، وإلا `null`. */
  currency: string | null;
};

/** رموز العملات المكتوبة بثلاثة أحرف لاتينية. */
const ISO_CODES: readonly string[] = [
  'SAR', 'AED', 'USD', 'EUR', 'GBP', 'EGP', 'KWD', 'QAR', 'BHD', 'OMR',
  'JOD', 'TRY', 'JPY', 'CHF', 'CAD', 'AUD', 'INR', 'PKR', 'YER', 'LBP',
];

/**
 * رموز ومسمّيات العملات غير القياسية.
 * الترتيب مقصود: الأطول والأكثر تحديداً أولاً حتى لا يبتلع `$` رمز `US$`،
 * ولا تبتلع "ريال" العامة رموز `ر.ق` و`ر.ع` الخاصة.
 */
const CURRENCY_SYMBOLS: readonly (readonly [symbol: string, code: string])[] = [
  ['US$', 'USD'],
  ['ر.س', 'SAR'],
  ['ر.ق', 'QAR'],
  ['ر.ع', 'OMR'],
  ['د.إ', 'AED'],
  ['د.ك', 'KWD'],
  ['د.ب', 'BHD'],
  ['د.أ', 'JOD'],
  ['ج.م', 'EGP'],
  ['﷼', 'SAR'],
  ['⃀', 'SAR'],
  ['درهم', 'AED'],
  ['دينار', 'KWD'],
  ['جنيه', 'EGP'],
  // "ريال" وحدها غامضة (سعودي/قطري/عماني) — نفترض السعودي لأنه السوق الأساسي،
  // وتُفحص بعد الرموز المحدّدة أعلاه.
  ['ريال', 'SAR'],
  ['$', 'USD'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['₺', 'TRY'],
  ['¥', 'JPY'],
];

/** لواحق تدلّ على اتجاه العملية بدل الإشارة: مدين (سالب) / دائن (موجب). */
const DEBIT_MARKERS: readonly string[] = ['DR', 'DB', 'DEBIT', 'مدين', 'خصم', 'سحب'];
const CREDIT_MARKERS: readonly string[] = ['CR', 'CREDIT', 'دائن', 'ايداع', 'إيداع'];

/** الفاصلة العشرية العربية (066B) وفاصل الآلاف العربي (066C). */
const ARABIC_DECIMAL_SEPARATOR = String.fromCodePoint(0x066b);
const ARABIC_THOUSANDS_SEPARATOR = String.fromCodePoint(0x066c);

/** إشارة الطرح الرياضية (2212) التي تستخدمها بعض الكشوف بدل `-`. */
const MINUS_SIGN = String.fromCodePoint(0x2212);

/**
 * يستخرج رمز العملة من نص خلية.
 *
 * @param raw نص الخلية الخام
 * @returns رمز ISO-4217 بحروف كبيرة، أو `null` إن لم يوجد
 */
export function extractCurrency(raw: string): string | null {
  const text = stripInvisibleMarks(raw);
  const upper = text.toUpperCase();

  for (const code of ISO_CODES) {
    // حدود الكلمة تمنع مطابقة "SAR" داخل كلمة أطول
    if (new RegExp(`(^|[^A-Z])${code}([^A-Z]|$)`).test(upper)) return code;
  }

  for (const [symbol, code] of CURRENCY_SYMBOLS) {
    if (text.includes(symbol)) return code;
  }

  return null;
}

/**
 * يحذف رموز ومسمّيات العملة من النص.
 *
 * ضروري قبل استخراج الأرقام لأن رموزاً مثل `ر.س` و`د.إ` تحتوي نقطة، فلو بقيت
 * لاختلطت بالفاصلة العشرية وأنتجت `"99.00 ر.س"` القيمة 9900 بدل 99.
 *
 * @param text نص الخلية بعد تحويل الأرقام
 * @returns النص بلا رموز عملة
 */
function stripCurrencyTokens(text: string): string {
  let out = text;
  for (const [symbol] of CURRENCY_SYMBOLS) {
    out = out.split(symbol).join(' ');
  }
  return out.replace(new RegExp(`(^|[^A-Za-z])(${ISO_CODES.join('|')})(?![A-Za-z])`, 'gi'), '$1 ');
}

/**
 * يقرّر أي علامة هي الفاصلة العشرية ثم يعيد نصاً رقمياً صافياً.
 *
 * القواعد (مبنية على ما يظهر فعلياً في كشوف الحسابات):
 * - وجود `.` و`,` معاً → الأخيرة ظهوراً هي العشرية والأخرى فاصل آلاف.
 * - `,` وحدها: إن كانت المجموعة بعد آخر فاصلة من ثلاثة أرقام فهي فاصل آلاف
 *   (`1,234` → 1234)، وإلا فهي عشرية (`12,50` → 12.5).
 * - `.` وحدها ومتكرّرة: كلها فواصل آلاف إلا إن كانت المجموعة الأخيرة ليست
 *   ثلاثة أرقام (`1.234.56` → 1234.56).
 * - `.` وحدها ومفردة → عشرية دائماً (الحالة الأشيع).
 *
 * @param digitsAndSeparators نص يحتوي أرقاماً وفواصل فقط
 * @returns نص رقمي بفاصلة عشرية `.` واحدة أو بلا فاصلة
 */
function normalizeSeparators(digitsAndSeparators: string): string {
  const text = digitsAndSeparators;
  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalIsDot = lastDot > lastComma;
    const thousands = decimalIsDot ? /,/g : /\./g;
    const withoutThousands = text.replace(thousands, '');
    return decimalIsDot ? withoutThousands : withoutThousands.replace(',', '.');
  }

  if (lastComma >= 0) {
    const groupAfter = text.length - lastComma - 1;
    const isThousands = groupAfter === 3;
    return isThousands ? text.replace(/,/g, '') : text.replace(/,/g, '.');
  }

  if (lastDot >= 0) {
    const dotCount = (text.match(/\./g) ?? []).length;
    if (dotCount > 1) {
      const groupAfter = text.length - lastDot - 1;
      if (groupAfter === 3) return text.replace(/\./g, '');
      const head = text.slice(0, lastDot).replace(/\./g, '');
      return `${head}.${text.slice(lastDot + 1)}`;
    }
  }

  return text;
}

/**
 * يحلّل خلية مبلغ إلى قيمة رقمية مُشارة + عملة.
 *
 * يتحمّل: فواصل الآلاف، رموز العملة داخل الخلية، الأرقام الهندية-العربية،
 * الأقواس للسالب `(45.00)`، اللواحق `DR`/`CR`، وإشارة الطرح الرياضية.
 *
 * @param raw نص الخلية الخام
 * @returns القيمة والعملة؛ القيمة سالبة إذا دلّت الخلية على خصم
 * @throws {AmountParseError} إذا كانت الخلية فارغة أو بلا رقم صالح
 */
export function parseAmount(raw: string): ParsedAmount {
  const currency = extractCurrency(raw);

  let text = toLatinDigits(stripInvisibleMarks(raw))
    .replace(new RegExp(ARABIC_DECIMAL_SEPARATOR, 'g'), '.')
    .replace(new RegExp(ARABIC_THOUSANDS_SEPARATOR, 'g'), ',')
    .replace(new RegExp(MINUS_SIGN, 'g'), '-')
    .trim();

  if (text === '') {
    throw new AmountParseError('خلية المبلغ فارغة', raw);
  }

  let negative = false;

  // الأقواس تعني سالباً في التصدير المحاسبي: (45.00)
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }

  const upper = text.toUpperCase();
  if (DEBIT_MARKERS.some((marker) => new RegExp(`(^|[^A-Z])${marker}([^A-Z]|$)`).test(upper))) {
    negative = true;
  } else if (
    CREDIT_MARKERS.some((marker) => new RegExp(`(^|[^A-Z])${marker}([^A-Z]|$)`).test(upper))
  ) {
    negative = false;
  }

  if (/-/.test(text)) negative = true;

  // نحذف رموز العملة أولاً، ثم نُبقي الأرقام والفواصل فقط، ثم نقصّ أي فاصلة
  // متدلّية في الطرفين (بقايا رموز مثل `.SR` أو خطأ إدخال).
  const numeric = stripCurrencyTokens(text)
    .replace(/[^\d.,]/g, '')
    .replace(/^[.,]+|[.,]+$/g, '');

  if (numeric === '' || !/\d/.test(numeric)) {
    throw new AmountParseError(`مبلغ غير صالح: "${raw}"`, raw);
  }

  const normalized = normalizeSeparators(numeric);
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new AmountParseError(`مبلغ غير صالح: "${raw}"`, raw);
  }

  return { value: negative ? -value : value, currency };
}

/**
 * نسخة لا ترمي أخطاء من `parseAmount` — تُستخدم للأعمدة الاختيارية
 * (مثل عمود "دائن" الفارغ في صف مدين).
 *
 * @param raw نص الخلية الخام
 * @returns النتيجة أو `null` عند الفشل
 */
export function tryParseAmount(raw: string): ParsedAmount | null {
  try {
    return parseAmount(raw);
  } catch {
    return null;
  }
}

/**
 * هل الخلية فارغة فعلياً (بعد حذف المسافات والمحارف الخفية)؟
 * تُستخدم للتمييز بين "لا قيمة هنا" و"قيمة تالفة".
 *
 * @param raw نص الخلية الخام
 * @returns `true` إذا كانت الخلية بلا محتوى
 */
export function isBlankCell(raw: string | undefined): boolean {
  return raw === undefined || stripInvisibleMarks(raw).trim() === '';
}
