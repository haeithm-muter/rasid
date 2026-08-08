/**
 * تحليل التواريخ من كشوف الحسابات وتحويلها إلى ISO `YYYY-MM-DD`.
 *
 * المشكلة الأساسية: `03/04/2024` قد يعني 3 أبريل (DMY) أو 4 مارس (MDY).
 * لذلك كل محوّل بنكي يصرّح بصيغته في `dateFormat`، ولا نخمّن إلا عند الطلب
 * الصريح للصيغة `'auto'`.
 */

import { DateParseError } from './errors';
import { collapseWhitespace, normalizeForComparison, toLatinDigits, stripInvisibleMarks } from './text';

/** صيغ التاريخ المدعومة. `'auto'` تستنتج الصيغة من القيمة نفسها. */
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'auto';

/** التفضيل المستخدم لفكّ التباس مثل `03/04/2024` عند استعمال `'auto'`. */
export type AmbiguityPreference = 'DMY' | 'MDY';

/** خيارات إضافية لتحليل التاريخ. */
export type ParseDateOptions = {
  /**
   * ماذا نفعل عند تاريخ غامض (كلا الرقمين ≤ 12) مع الصيغة `'auto'`.
   * إن لم يُحدَّد، يُرمى `DateParseError` بدل التخمين الصامت.
   */
  ambiguousPreference?: AmbiguityPreference;
};

/**
 * حدّ فصل السنوات ذات الرقمين: `00-68` → `20xx`، `69-99` → `19xx`
 * (نفس اصطلاح POSIX). كشوف الحسابات لا تحتوي تواريخ قبل 1969 عملياً.
 */
const TWO_DIGIT_YEAR_PIVOT = 68;

/** أسماء الشهور الشائعة في كشوف الحسابات (بعد التطبيع عبر `normalizeForComparison`). */
const MONTH_NAMES: Readonly<Record<string, number | undefined>> = {
  JAN: 1, JANUARY: 1,
  FEB: 2, FEBRUARY: 2,
  MAR: 3, MARCH: 3,
  APR: 4, APRIL: 4,
  MAY: 5,
  JUN: 6, JUNE: 6,
  JUL: 7, JULY: 7,
  AUG: 8, AUGUST: 8,
  SEP: 9, SEPT: 9, SEPTEMBER: 9,
  OCT: 10, OCTOBER: 10,
  NOV: 11, NOVEMBER: 11,
  DEC: 12, DECEMBER: 12,
  // أسماء الشهور العربية كما تظهر بعد توحيد الهمزات (أبريل → ابريل)
  'يناير': 1,
  'فبراير': 2,
  'مارس': 3,
  'ابريل': 4,
  'مايو': 5,
  'يونيو': 6,
  'يوليو': 7,
  'اغسطس': 8,
  'سبتمبر': 9,
  'اكتوبر': 10,
  'نوفمبر': 11,
  'ديسمبر': 12,
};

/** يفصل مكوّنات التاريخ عن بعضها: `/` `-` `.` أو مسافة. */
const PART_SEPARATORS = /[/\-.\s]+/;

/** جزء الوقت في نهاية التاريخ، مثل `14:33` أو `02:15:00 PM`. */
const TRAILING_TIME = /[\sT]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(AM|PM)?\s*Z?$/i;

/**
 * عدد أيام الشهر مع مراعاة السنوات الكبيسة.
 *
 * @param year السنة الميلادية بأربعة أرقام
 * @param month رقم الشهر (1-12)
 * @returns عدد أيام ذلك الشهر
 */
function daysInMonth(year: number, month: number): number {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 0;
}

/**
 * يوسّع السنة ذات الرقمين إلى أربعة أرقام حسب `TWO_DIGIT_YEAR_PIVOT`.
 *
 * @param year السنة كما وردت
 * @param digits عدد الأرقام التي كُتبت بها
 * @returns السنة بأربعة أرقام
 */
function expandYear(year: number, digits: number): number {
  if (digits >= 3) return year;
  return year <= TWO_DIGIT_YEAR_PIVOT ? 2000 + year : 1900 + year;
}

/** يضيف صفراً على اليسار ليصبح الرقم من خانتين. */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** مكوّنات التاريخ الثلاثة قبل تحديد أيّها اليوم وأيّها الشهر. */
type RawParts = {
  /** المكوّنات النصية الثلاثة بترتيب ظهورها. */
  tokens: [string, string, string];
  /** رقم الشهر إن كان مكتوباً باسمه، و`null` إن كانت كل المكوّنات أرقاماً. */
  namedMonth: number | null;
  /** موقع الشهر المسمّى داخل `tokens`، و`-1` إن لم يوجد. */
  namedMonthIndex: number;
};

/**
 * ينظّف النص ويقسّمه إلى ثلاثة مكوّنات، مع التعرّف على أسماء الشهور.
 *
 * @param raw النص الخام للتاريخ
 * @returns المكوّنات الثلاثة، أو `null` إن لم يكن النص تاريخاً على الإطلاق
 */
function splitParts(raw: string): RawParts | null {
  const cleaned = collapseWhitespace(toLatinDigits(stripInvisibleMarks(raw)))
    .replace(TRAILING_TIME, '')
    .trim();

  if (cleaned === '') return null;

  const tokens = cleaned.split(PART_SEPARATORS).filter((token) => token !== '');
  if (tokens.length !== 3) return null;

  let namedMonth: number | null = null;
  let namedMonthIndex = -1;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] as string;
    if (/^\d+$/.test(token)) continue;

    const month = MONTH_NAMES[normalizeForComparison(token)];
    if (month === undefined) return null;
    if (namedMonth !== null) return null; // اسما شهرين في تاريخ واحد = نص تالف
    namedMonth = month;
    namedMonthIndex = i;
  }

  return {
    tokens: [tokens[0] as string, tokens[1] as string, tokens[2] as string],
    namedMonth,
    namedMonthIndex,
  };
}

/** يوم/شهر/سنة بعد تحديد دور كل مكوّن. */
type DateFields = { year: number; month: number; day: number };

/**
 * يحدّد دور كل مكوّن (يوم/شهر/سنة) حسب الصيغة المطلوبة.
 *
 * @param parts المكوّنات الناتجة من `splitParts`
 * @param format الصيغة المصرّح بها
 * @param preference التفضيل عند الالتباس في الوضع `'auto'`
 * @returns الحقول الثلاثة، أو `'ambiguous'` إذا تعذّر الحسم، أو `null` إذا كان الشكل غير صالح
 */
function resolveFields(
  parts: RawParts,
  format: DateFormat,
  preference: AmbiguityPreference | undefined,
): DateFields | 'ambiguous' | null {
  const { tokens, namedMonth, namedMonthIndex } = parts;

  // 1) شهر مكتوب باسمه: الشهر محسوم، يبقى تمييز اليوم من السنة.
  if (namedMonth !== null) {
    const rest = tokens.filter((_, i) => i !== namedMonthIndex);
    const [first, second] = rest as [string, string];
    // الشكل الشائع `12-Mar-2024`: اليوم أولاً والسنة أخيراً.
    // والشكل `2024-Mar-12`: السنة أولاً (أربعة أرقام).
    const yearFirst = first.length === 4;
    const yearToken = yearFirst ? first : second;
    const dayToken = yearFirst ? second : first;
    return {
      year: expandYear(Number(yearToken), yearToken.length),
      month: namedMonth,
      day: Number(dayToken),
    };
  }

  const [a, b, c] = tokens;

  // 2) أي مكوّن أول من أربعة أرقام لا يمكن أن يكون يوماً أو شهراً → ISO دائماً،
  //    حتى لو صرّح المحوّل بصيغة أخرى (كشوف مختلطة تحدث فعلاً).
  if (a.length === 4) {
    return { year: Number(a), month: Number(b), day: Number(c) };
  }

  const first = Number(a);
  const second = Number(b);
  const year = expandYear(Number(c), c.length);

  switch (format) {
    case 'YYYY-MM-DD':
      // صُرّح بـ ISO لكن المكوّن الأول ليس سنة → قيمة غير متوافقة مع الصيغة.
      return null;
    case 'DD/MM/YYYY':
      return { year, month: second, day: first };
    case 'MM/DD/YYYY':
      return { year, month: first, day: second };
    case 'auto': {
      if (first > 12 && second <= 12) return { year, month: second, day: first };
      if (second > 12 && first <= 12) return { year, month: first, day: second };
      if (first > 12 && second > 12) return null;
      // كلاهما ≤ 12 → غامض فعلاً.
      if (preference === 'DMY') return { year, month: second, day: first };
      if (preference === 'MDY') return { year, month: first, day: second };
      return 'ambiguous';
    }
  }
}

/**
 * يحلّل نص تاريخ ويعيده بصيغة ISO `YYYY-MM-DD`.
 *
 * يتحمّل: الأرقام الهندية-العربية، المسافات الزائدة، علامات الاتجاه،
 * الفواصل `/` `-` `.`، أسماء الشهور بالعربية والإنجليزية، السنوات ذات الرقمين،
 * ووجود وقت بعد التاريخ (يُتجاهل).
 *
 * @param raw النص الخام من خلية CSV
 * @param format صيغة التاريخ المصرّح بها من المحوّل (افتراضياً `'auto'`)
 * @param options خيارات فكّ الالتباس
 * @returns التاريخ بصيغة `YYYY-MM-DD`
 * @throws {DateParseError} إذا كان النص غير صالح أو غامضاً بلا تفضيل
 */
export function parseDate(
  raw: string,
  format: DateFormat = 'auto',
  options: ParseDateOptions = {},
): string {
  const parts = splitParts(raw);
  if (parts === null) {
    throw new DateParseError(`تاريخ غير صالح: "${raw}"`, raw);
  }

  const fields = resolveFields(parts, format, options.ambiguousPreference);
  if (fields === 'ambiguous') {
    throw new DateParseError(
      `تاريخ غامض: "${raw}" يحتمل DD/MM و MM/DD معاً — حدّد الصيغة أو مرّر ambiguousPreference.`,
      raw,
    );
  }
  if (fields === null) {
    throw new DateParseError(`تاريخ لا يطابق الصيغة ${format}: "${raw}"`, raw);
  }

  const { year, month, day } = fields;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new DateParseError(`تاريخ غير صالح: "${raw}"`, raw);
  }
  if (month < 1 || month > 12) {
    throw new DateParseError(`رقم شهر خارج النطاق (${month}) في "${raw}"`, raw);
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new DateParseError(`يوم غير موجود في هذا الشهر (${day}) في "${raw}"`, raw);
  }

  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

/**
 * نسخة لا ترمي أخطاء من `parseDate` — مفيدة عند فحص صف قد يكون تالفاً.
 *
 * @param raw النص الخام
 * @param format الصيغة المصرّح بها
 * @param options خيارات فكّ الالتباس
 * @returns التاريخ بصيغة ISO أو `null` عند الفشل
 */
export function tryParseDate(
  raw: string,
  format: DateFormat = 'auto',
  options: ParseDateOptions = {},
): string | null {
  try {
    return parseDate(raw, format, options);
  } catch {
    return null;
  }
}

/**
 * يستنتج صيغة عمود تواريخ كامل بالنظر إلى كل القيم مجتمعة.
 *
 * الفكرة: قيمة واحدة مثل `25/12/2024` تكفي لحسم أن العمود كله `DD/MM/YYYY`،
 * حتى لو كانت بقية القيم غامضة. تُستخدم لاحقاً في الواجهة لاقتراح الصيغة.
 *
 * @param samples قيم عمود التاريخ الخام
 * @returns الصيغة المستنتجة، أو `null` إذا بقيت غامضة أو كانت القيم متناقضة
 */
export function inferDateFormat(samples: readonly string[]): DateFormat | null {
  let sawIso = false;
  let sawNumeric = false;
  let dayFirst = false;
  let monthFirst = false;

  for (const sample of samples) {
    const parts = splitParts(sample);
    if (parts === null) continue;
    if (parts.namedMonth !== null) continue;

    const [a, b] = parts.tokens;
    if (a.length === 4) {
      sawIso = true;
      continue;
    }

    sawNumeric = true;
    const first = Number(a);
    const second = Number(b);
    if (first > 12 && second <= 12) dayFirst = true;
    if (second > 12 && first <= 12) monthFirst = true;
  }

  if (dayFirst && monthFirst) return null; // عمود متناقض
  if (dayFirst) return 'DD/MM/YYYY';
  if (monthFirst) return 'MM/DD/YYYY';
  if (sawIso && !sawNumeric) return 'YYYY-MM-DD';
  return null;
}
