/**
 * أدوات إحصائية نقية لمحرك الكشف.
 *
 * قرار تصميمي يحكم هذا الملف كله: **المركز دائماً هو الوسيط لا المتوسط.**
 * كشف الحساب مليء بالقيم الشاذة — عملية مؤجّلة بسبب عطلة، خصم مضاعف بالخطأ،
 * شهر فاتورته صدرت متأخرة. المتوسط ينجرف خلف قيمة شاذة واحدة، أما الوسيط
 * فيصمد حتى تفسد نصف القيم.
 *
 * مثال يوضّح الفرق: فروق `[30, 30, 30, 30, 180]` (اشتراك شهري انقطع خمسة أشهر
 * ثم عاد) متوسطها 60 يوماً — تصنيف خاطئ تماماً — ووسيطها 30 يوماً وهو الصحيح.
 *
 * كل الدوال هنا نقية بالكامل: لا حالة، لا زمن، لا متصفح.
 */

/**
 * وسيط قائمة أرقام (median).
 *
 * لا تعدّل القائمة الأصلية — تنسخ ثم ترتّب.
 * عند عدد زوجي من القيم يعيد متوسط القيمتين الوسطيتين.
 *
 * @param values القيم (يجوز أن تكون غير مرتّبة)
 * @returns الوسيط، و`0` للقائمة الفارغة
 *
 * @example
 * median([30, 30, 30, 30, 180]) // 30  (المتوسط هنا 60 — مضلّل)
 * median([28, 30])              // 29
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/**
 * المتوسط الحسابي — موجود للمقارنة والعرض فقط، **لا يُستخدم في التصنيف**.
 *
 * @param values القيم
 * @returns المتوسط، و`0` للقائمة الفارغة
 */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * متوسط الانحراف المطلق حول الوسيط.
 *
 * لماذا هذا المقياس تحديداً بدل الانحراف المعياري أو MAD الكلاسيكي؟
 * - **المركز وسيط** (لا متوسط) → لا تجرّه قيمة شاذة واحدة.
 * - **الانحرافات تُجمَع كلها** (لا وسيطها) → قيمة شاذة واحدة تبقى مرئية.
 *   MAD الكلاسيكي (وسيط الانحرافات) يعطي صفراً لـ `[30,30,30,30,180]` لأن
 *   أكثر من نصف القيم متطابقة، فيخفي الانقطاع تماماً — وهو بالضبط ما نريد رؤيته.
 * - **بلا تربيع** → لا تُضخَّم القيم الشاذة كما في الانحراف المعياري.
 *
 * @param values القيم
 * @returns متوسط `|value - median|`، و`0` للقائمة الفارغة
 *
 * @example
 * meanAbsoluteDeviation([28, 28, 28])      // 0
 * meanAbsoluteDeviation([30, 30, 30, 180]) // 37.5
 */
export function meanAbsoluteDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const center = median(values);
  return mean(values.map((value) => Math.abs(value - center)));
}

/**
 * التشتت النسبي: متوسط الانحراف المطلق ÷ الوسيط.
 *
 * التطبيع على الوسيط ضروري ليكون المقياس مقارَناً بين المقاييس المختلفة:
 * انحراف يومين في دورة أسبوعية فوضى (29%)، وفي دورة سنوية لا شيء (0.5%).
 * وكذلك بين المبالغ: انحراف 5 ريالات على 20 ريالاً غير انحراف 5 على 500.
 *
 * @param values القيم
 * @returns نسبة التشتت (0 = تطابق تام)، و`0` حين يكون الوسيط صفراً أو القائمة فارغة
 */
export function relativeSpread(values: readonly number[]): number {
  const center = median(values);
  if (center <= 0) return 0;
  return meanAbsoluteDeviation(values) / center;
}

/**
 * يحصر رقماً داخل المجال `[0, 1]`.
 * كل الدرجات التي يخرجها المحرك تمرّ من هنا حتى يبقى العقد "رقم بين 0 و1" مضموناً.
 *
 * @param value الرقم الخام
 * @returns الرقم بعد الحصر؛ و`0` لـ `NaN`
 */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * يحوّل تشتتاً نسبياً إلى درجة استقرار بين 0 و1 (خطياً وبالعكس).
 *
 * الصيغة: `score = 1 - (spread / maxSpread)` محصورة في `[0, 1]`.
 * أي أن `maxSpread` هو التشتت الذي تنهار عنده الدرجة إلى الصفر — وهو **ثابت
 * المعايرة** الذي يقرّر مدى تسامح المحرك.
 *
 * @param spread التشتت النسبي من `relativeSpread`
 * @param maxSpread التشتت الذي تصبح عنده الدرجة صفراً (يجب أن يكون > 0)
 * @returns درجة بين 0 و1
 *
 * @example
 * stabilityFromSpread(0, 0.5)    // 1    — تطابق تام
 * stabilityFromSpread(0.25, 0.5) // 0.5  — منتصف الطريق
 * stabilityFromSpread(0.8, 0.5)  // 0    — تجاوز حد الانهيار
 */
export function stabilityFromSpread(spread: number, maxSpread: number): number {
  if (maxSpread <= 0) return 0;
  return clamp01(1 - spread / maxSpread);
}
