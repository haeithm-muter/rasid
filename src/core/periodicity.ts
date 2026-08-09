/**
 * كشف الدورية: هل هذه العمليات تتكرّر على إيقاع ثابت؟ وما هو ذلك الإيقاع؟
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * المبدأ الذي يميّز هذا المحرك: **نقيس المسافات بالأيام، لا بأرقام أيام الشهر.**
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * الأدوات البسيطة تبحث عن "خصم في اليوم 5 من كل شهر". هذا يفشل فشلاً كاملاً مع
 * الاشتراكات ذات الدورة الثابتة بالأيام (28 يوماً مثلاً)، لأن تاريخها ينزلق:
 *
 *     1 يناير → 29 يناير → 26 فبراير → 25 مارس → 22 أبريل → 20 مايو
 *
 * ستة خصوم في ستة أيام مختلفة من الشهر، وأحدها (يناير) يتكرّر مرتين في شهر
 * واحد بينما فبراير يبدو وكأنه "شهر ناقص". أي منطق يعتمد على رقم اليوم أو على
 * "خصم واحد لكل شهر تقويمي" سيعتبر هذا نمطاً فوضوياً ويتجاهله.
 *
 * هنا نحسب فروق الأيام فقط: `[28, 28, 28, 28, 28]` — أنظف نمط ممكن. التقويم
 * الميلادي بشهوره غير المتساوية لا يدخل الحساب إطلاقاً.
 *
 * (المفارقة أن الاشتراك الشهري "العادي" هو الأقل انتظاماً بهذا القياس: فروقه
 * تتراوح بين 28 و31 يوماً حسب طول الشهر. لذلك مدى "شهري" في الجدول أدناه واسع
 * عمداً: 27–32.)
 */

import { mean, median, relativeSpread, stabilityFromSpread } from './stats';
import type { Transaction } from './types';

/** أنواع الدورات المعروفة، مع `'irregular'` لكل ما لا يقع في أي مدى. */
export type CycleKind =
  | 'weekly'
  | 'semimonthly'
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual'
  | 'irregular';

/** مدى زمني واحد في جدول التصنيف. */
export type CycleRange = {
  kind: CycleKind;
  /** الاسم المعروض بالعربية. */
  label: string;
  /** أقل فرق بالأيام يقع ضمن هذا التصنيف (شامل). */
  minDays: number;
  /** أكبر فرق بالأيام يقع ضمن هذا التصنيف (شامل). */
  maxDays: number;
  /** الطول الاسمي للدورة — يُستخدم للعرض وتقدير التكلفة السنوية لاحقاً. */
  nominalDays: number;
};

/**
 * ▲ جدول تصنيف الدورات ▲
 *
 * الحدود **شاملة للطرفين**، والمدايات متباعدة عمداً: الفجوات بينها (مثل 9–12
 * يوماً أو 33–84) ليست نقصاً بل رفض صريح للتصنيف. المنطقة الرمادية تُصنَّف
 * `irregular` بدل إجبارها على أقرب خانة، لأن تصنيفاً خاطئاً واثقاً أسوأ من
 * الاعتراف بعدم المعرفة.
 *
 * عايِر من هنا وحدك — لا أرقام أيام منثورة في بقية الملف.
 */
export const CYCLE_RANGES: readonly CycleRange[] = [
  { kind: 'weekly', label: 'أسبوعي', minDays: 6, maxDays: 8, nominalDays: 7 },
  { kind: 'semimonthly', label: 'نصف شهري', minDays: 13, maxDays: 16, nominalDays: 14 },
  { kind: 'monthly', label: 'شهري', minDays: 27, maxDays: 32, nominalDays: 30 },
  { kind: 'quarterly', label: 'ربع سنوي', minDays: 85, maxDays: 95, nominalDays: 91 },
  { kind: 'semiannual', label: 'نصف سنوي', minDays: 175, maxDays: 190, nominalDays: 182 },
  { kind: 'annual', label: 'سنوي', minDays: 355, maxDays: 375, nominalDays: 365 },
];

/** الاسم المعروض لما لا يقع في أي مدى. */
export const IRREGULAR_LABEL = 'غير منتظم';

/**
 * ▲ ثابت معايرة ▲ الحد الأدنى لعدد العمليات قبل الحديث عن دورية.
 *
 * عمليتان تعطيان فرقاً واحداً — والفرق الواحد ليس نمطاً، فلا وسيط له ولا تشتت.
 * ثلاث عمليات = فرقان = أقل ما يمكن أن يُسمّى تكراراً.
 */
export const MIN_TRANSACTIONS_FOR_PERIODICITY = 3;

/**
 * ▲ ثابت معايرة ▲ التشتت النسبي الذي تنهار عنده درجة الانتظام إلى الصفر.
 *
 * 0.5 تعني: حين يبلغ متوسط انحراف الفروق نصفَ طول الدورة، لم تعد دورة.
 * عملياً: فروق `[28, 28, 28]` انتظامها 1، و`[30, 31, 28]` ≈ 0.93،
 * و`[30, 30, 30, 180]` (انقطاع خمسة أشهر) تنهار إلى 0 مع بقاء التصنيف شهرياً —
 * الوسيط يقول "شهري" ودرجة الانتظام تقول "لكن ثق بها قليلاً". هذا الفصل مقصود.
 */
export const REGULARITY_COLLAPSE_SPREAD = 0.5;

/** عدد المللي ثانية في اليوم — للتحويل من فارق زمني إلى أيام. */
const MS_PER_DAY = 86_400_000;

/**
 * يحوّل تاريخ ISO `YYYY-MM-DD` إلى عدد أيام مطلق منذ نقطة مرجعية ثابتة.
 *
 * نستخدم `Date.UTC` عمداً: البناء بالمنطقة المحلية يجعل الفرق بين تاريخين
 * يتغيّر بمقدار ساعة عند حدود التوقيت الصيفي، فينتج 27.96 يوماً بدل 28.
 * وبـ UTC تبقى الدالة نقية وحتمية مهما كانت منطقة جهاز المستخدم.
 *
 * @param isoDate تاريخ بصيغة `YYYY-MM-DD` (العقد الذي تضمنه كل المحوّلات)
 * @returns عدد الأيام، أو `null` إذا لم يكن النص تاريخاً صالحاً
 */
export function toDayNumber(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const timestamp = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(timestamp)) return null;

  // فحص الرجوع: `Date.UTC(2024, 1, 31)` يقبل ويصحّح إلى 2 مارس بصمت
  const roundTrip = new Date(timestamp);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp / MS_PER_DAY;
}

/**
 * عدد الأيام بين تاريخين (موجب إذا كان `to` بعد `from`).
 *
 * @param from التاريخ الأول بصيغة ISO
 * @param to التاريخ الثاني بصيغة ISO
 * @returns الفرق بالأيام، أو `null` إذا كان أحد التاريخين غير صالح
 *
 * @example
 * daysBetween('2024-01-01', '2024-01-29') // 28
 * daysBetween('2024-01-29', '2024-02-26') // 28 — الشهر لا يدخل الحساب
 */
export function daysBetween(from: string, to: string): number | null {
  const start = toDayNumber(from);
  const end = toDayNumber(to);
  if (start === null || end === null) return null;
  return end - start;
}

/**
 * يرتّب العمليات زمنياً (الأقدم أولاً) بلا تعديل المصفوفة الأصلية.
 *
 * الترتيب بمقارنة نصوص ISO مباشرة — `YYYY-MM-DD` مصمَّمة لتكون قابلة للترتيب
 * معجمياً. عند تساوي التاريخ نرتّب بالمبلغ ثم الوصف لضمان نتيجة حتمية.
 *
 * @param transactions العمليات بأي ترتيب
 * @returns نسخة مرتّبة زمنياً
 */
export function sortByDate(transactions: readonly Transaction[]): Transaction[] {
  return [...transactions].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.amount - right.amount ||
      left.description.localeCompare(right.description),
  );
}

/**
 * يحسب الفروق بالأيام بين كل عمليتين متتاليتين بعد الترتيب الزمني.
 *
 * التواريخ غير الصالحة تُتخطّى بصمت بدل إسقاط المجموعة كلها — العقد يضمن ISO
 * صارمة، وهذا مجرد حزام أمان.
 *
 * @param dates تواريخ ISO (بأي ترتيب)
 * @returns الفروق بالأيام بترتيبها الزمني؛ طولها = عدد التواريخ − 1
 *
 * @example
 * gapsInDays(['2024-01-01', '2024-01-29', '2024-02-26']) // [28, 28]
 */
export function gapsInDays(dates: readonly string[]): number[] {
  const dayNumbers = validDayNumbers(dates);

  const gaps: number[] = [];
  for (let i = 1; i < dayNumbers.length; i += 1) {
    gaps.push((dayNumbers[i] as number) - (dayNumbers[i - 1] as number));
  }
  return gaps;
}

/** يحوّل التواريخ إلى أرقام أيام مرتّبة، متخطّياً غير الصالح منها. */
function validDayNumbers(dates: readonly string[]): number[] {
  return dates
    .map((date) => toDayNumber(date))
    .filter((day): day is number => day !== null)
    .sort((left, right) => left - right);
}

/**
 * يصنّف دورة حسب وسيط الفروق باستخدام `CYCLE_RANGES`.
 *
 * @param medianGap وسيط الفروق بالأيام
 * @returns المدى المطابق، أو `null` إذا وقع الوسيط خارج كل المدايات
 *
 * @example
 * classifyCycle(28)  // { kind: 'monthly', ... }   — الدورة المنزلقة
 * classifyCycle(45)  // null                        — منطقة رمادية، لا نخمّن
 */
export function classifyCycle(medianGap: number): CycleRange | null {
  return (
    CYCLE_RANGES.find((range) => medianGap >= range.minDays && medianGap <= range.maxDays) ?? null
  );
}

/** ناتج تحليل دورية مجموعة واحدة. */
export type PeriodicityResult = {
  /** هل توفّر الحد الأدنى من العمليات (`MIN_TRANSACTIONS_FOR_PERIODICITY`)؟ */
  hasEnoughData: boolean;
  /** عدد العمليات التي دخلت التحليل. */
  occurrences: number;
  /** الفروق بالأيام بترتيبها الزمني. */
  gaps: readonly number[];
  /** وسيط الفروق — أساس التصنيف كله (وليس المتوسط). */
  medianGap: number;
  /** المتوسط الحسابي — للعرض والمقارنة فقط، لا يدخل أي قرار. */
  meanGap: number;
  /** التصنيف؛ `'irregular'` حين لا يقع الوسيط في أي مدى أو تنقص البيانات. */
  cycle: CycleKind;
  /** الاسم المعروض بالعربية. */
  label: string;
  /** الطول الاسمي للدورة المصنَّفة، و`null` لغير المصنَّف. */
  nominalDays: number | null;
  /** تشتت الفروق حول وسيطها (0 = فروق متطابقة). */
  spread: number;
  /** درجة الانتظام 0..1: كلما قلّ التشتت زادت. */
  regularity: number;
};

/** ناتج فارغ موحّد للمجموعات التي لا تكفي بياناتها. */
function insufficient(occurrences: number, gaps: readonly number[]): PeriodicityResult {
  return {
    hasEnoughData: false,
    occurrences,
    gaps,
    medianGap: 0,
    meanGap: 0,
    cycle: 'irregular',
    label: IRREGULAR_LABEL,
    nominalDays: null,
    spread: 0,
    regularity: 0,
  };
}

/**
 * يحلّل دورية سلسلة تواريخ: الفروق، وسيطها، تصنيفها، ودرجة انتظامها.
 *
 * الخطوات:
 * 1. ترتيب زمني ثم حساب الفروق بالأيام (لا بأرقام أيام الشهر — انظر رأس الملف)
 * 2. **الوسيط** لهذه الفروق هو أساس التصنيف، لأنه يصمد أمام عملية مؤجّلة أو
 *    شهر مفقود بينما ينجرف المتوسط خلفهما
 * 3. مطابقة الوسيط بجدول `CYCLE_RANGES`؛ خارج كل المدايات = `'irregular'`
 * 4. درجة الانتظام = `1 − (التشتت النسبي ÷ REGULARITY_COLLAPSE_SPREAD)` محصورة في [0,1]
 *
 * أقل من `MIN_TRANSACTIONS_FOR_PERIODICITY` عمليات → لا تصنيف إطلاقاً
 * (`hasEnoughData: false`, `regularity: 0`). عمليتان تعطيان فرقاً واحداً،
 * والفرق الواحد قد يكون مصادفة.
 *
 * @param dates تواريخ ISO للمجموعة (بأي ترتيب)
 * @returns تحليل الدورية كاملاً
 *
 * @example
 * // اشتراك كل 28 يوماً ينزلق عبر الشهور — يُصنَّف شهرياً بانتظام تام
 * analyzePeriodicity(['2024-01-01', '2024-01-29', '2024-02-26', '2024-03-25'])
 * // → { cycle: 'monthly', medianGap: 28, regularity: 1, ... }
 */
export function analyzePeriodicity(dates: readonly string[]): PeriodicityResult {
  const occurrences = validDayNumbers(dates).length;
  const gaps = gapsInDays(dates);

  if (occurrences < MIN_TRANSACTIONS_FOR_PERIODICITY) {
    return insufficient(occurrences, gaps);
  }

  const medianGap = median(gaps);
  const meanGap = mean(gaps);

  // كل العمليات في يوم واحد (أو أغلبها): تكرار لا دورة
  if (medianGap <= 0) {
    return { ...insufficient(occurrences, gaps), hasEnoughData: true, meanGap };
  }

  const spread = relativeSpread(gaps);
  const regularity = stabilityFromSpread(spread, REGULARITY_COLLAPSE_SPREAD);
  const range = classifyCycle(medianGap);

  return {
    hasEnoughData: true,
    occurrences,
    gaps,
    medianGap,
    meanGap,
    cycle: range?.kind ?? 'irregular',
    label: range?.label ?? IRREGULAR_LABEL,
    nominalDays: range?.nominalDays ?? null,
    spread,
    regularity,
  };
}
