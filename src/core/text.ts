/**
 * أدوات تطبيع النصوص المشتركة.
 *
 * تُستخدم في ثلاثة أماكن: مطابقة ترويسات الأعمدة، تحليل المبالغ والتواريخ،
 * وتنظيف أوصاف التجار. دوال نقية بالكامل بلا أي اعتماد على المتصفح.
 *
 * ملاحظة تصميمية: أصناف المحارف غير المرئية تُبنى من نقاط ترميز رقمية عبر
 * `charClass` بدل كتابتها حرفياً في المصدر، حتى يبقى الكود مقروءاً وقابلاً للمراجعة.
 */

/** نطاق نقاط ترميز مغلق `[from, to]` (شامل الطرفين). */
type CodeRange = readonly [from: number, to: number];

/**
 * يبني صنف محارف (character class) من نطاقات نقاط ترميز.
 *
 * @param ranges نطاقات نقاط الترميز المطلوب مطابقتها
 * @param flags أعلام التعبير النمطي (مثل `'g'`)
 * @returns تعبير نمطي يطابق أي محرف داخل النطاقات
 */
function charClass(ranges: readonly CodeRange[], flags: string): RegExp {
  const body = ranges
    .map(([from, to]) =>
      from === to
        ? String.fromCodePoint(from)
        : `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`,
    )
    .join('');
  return new RegExp(`[${body}]`, flags);
}

/** أول رمز في نطاق الأرقام الهندية-العربية (٠-٩). */
const ARABIC_INDIC_START = 0x0660;

/** أول رمز في نطاق الأرقام الفارسية-الأردية (۰-۹). */
const EXTENDED_ARABIC_INDIC_START = 0x06f0;

/**
 * علامات تحكّم خفية:
 * - `200B-200F`: مسافة صفرية، رابط/فاصل صفري، علامتا اتجاه LRM/RLM
 * - `202A-202E`: علامات تضمين وتجاوز الاتجاه
 * - `2066-2069`: علامات العزل الاتجاهي
 * - `FEFF`: علامة ترتيب البايت (BOM)
 */
const INVISIBLE_MARKS = charClass(
  [
    [0x200b, 0x200f],
    [0x202a, 0x202e],
    [0x2066, 0x2069],
    [0xfeff, 0xfeff],
  ],
  'g',
);

/**
 * التشكيل العربي:
 * - `064B-0652`: التنوين والحركات والشدّة والسكون
 * - `0670`: الألف الخنجرية
 * - `06D6-06ED`: علامات الضبط القرآني
 */
const ARABIC_DIACRITICS = charClass(
  [
    [0x064b, 0x0652],
    [0x0670, 0x0670],
    [0x06d6, 0x06ed],
  ],
  'g',
);

/** التطويل/الكشيدة (`0640`) — حرف زخرفي بلا معنى دلالي. */
const TATWEEL = charClass([[0x0640, 0x0640]], 'g');

/**
 * كل أنواع المسافات. `\s` في جافاسكربت يغطي أصلاً المسافة غير القابلة للكسر
 * (`00A0`) والمسافات الطباعية (`2000-200A`) والضيقة (`202F`) والمثالية (`3000`)،
 * أما المسافة الصفرية (`200B`) فيتكفّل بها `stripInvisibleMarks`.
 */
const ANY_WHITESPACE = /\s+/g;

/**
 * يحوّل الأرقام الهندية-العربية والفارسية إلى أرقام لاتينية (0-9).
 * مثال: `"١٢٣٫٤٥"` → `"123٫45"` (الفاصلة العشرية العربية تبقى كما هي).
 *
 * @param input النص الخام
 * @returns النص نفسه مع استبدال الأرقام فقط
 */
export function toLatinDigits(input: string): string {
  let out = '';
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= ARABIC_INDIC_START && code <= ARABIC_INDIC_START + 9) {
      out += String(code - ARABIC_INDIC_START);
    } else if (code >= EXTENDED_ARABIC_INDIC_START && code <= EXTENDED_ARABIC_INDIC_START + 9) {
      out += String(code - EXTENDED_ARABIC_INDIC_START);
    } else {
      out += char;
    }
  }
  return out;
}

/** علامة ترتيب البايت (`FEFF`) كما تظهر في أول ملفات Excel المصدَّرة. */
const BOM = String.fromCodePoint(0xfeff);

/**
 * يحذف علامة ترتيب البايت من بداية النص فقط (إن وجدت).
 *
 * @param input النص الخام
 * @returns النص بلا BOM في البداية
 */
export function stripBom(input: string): string {
  return input.startsWith(BOM) ? input.slice(1) : input;
}

/**
 * يحذف علامات التحكّم الخفية (zero-width، علامات الاتجاه، BOM).
 * ضروري لأن كشوف الحسابات العربية كثيراً ما تحتوي علامات اتجاه داخل الخلايا.
 *
 * @param input النص الخام
 * @returns النص بلا محارف خفية
 */
export function stripInvisibleMarks(input: string): string {
  return input.replace(INVISIBLE_MARKS, '');
}

/**
 * يحذف التشكيل والتطويل من النص العربي.
 *
 * @param input النص الخام
 * @returns النص بلا تشكيل ولا كشيدة
 */
export function stripArabicDiacritics(input: string): string {
  return input.replace(ARABIC_DIACRITICS, '').replace(TATWEEL, '');
}

/**
 * يوحّد الحروف العربية المتشابهة التي تُكتب بأشكال مختلفة في كشوف الحسابات:
 * `أ إ آ ٱ` → `ا`، `ى` → `ي`، `ة` → `ه`، `ؤ` → `و`، `ئ` → `ي`،
 * والحروف الفارسية `ک` → `ك`، `ی` → `ي`.
 *
 * @param input النص الخام
 * @returns النص بحروف موحّدة
 */
export function unifyArabicLetters(input: string): string {
  return input
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/ی/g, 'ي');
}

/**
 * يضغط كل أنواع المسافات إلى مسافة واحدة ويقص الأطراف.
 *
 * @param input النص الخام
 * @returns نص بمسافات مفردة بلا فراغ في الطرفين
 */
export function collapseWhitespace(input: string): string {
  return input.replace(ANY_WHITESPACE, ' ').trim();
}

/**
 * تطبيع عام للمقارنة (يُستخدم لمطابقة أسماء الأعمدة وأسماء الشهور):
 * حذف المحارف الخفية والتشكيل، توحيد الحروف العربية والأرقام،
 * تحويل الحروف اللاتينية إلى كبيرة، وضغط المسافات.
 *
 * @param input النص الخام
 * @returns نص مطبّع صالح للمقارنة الحرفية
 */
export function normalizeForComparison(input: string): string {
  const cleaned = unifyArabicLetters(
    stripArabicDiacritics(stripInvisibleMarks(input.normalize('NFKC'))),
  );
  return collapseWhitespace(toLatinDigits(cleaned).toUpperCase());
}
