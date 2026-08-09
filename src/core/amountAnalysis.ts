/**
 * تحليل المبالغ داخل مجموعة تاجر واحدة.
 *
 * ثلاثة أسئلة يجيب عنها هذا الملف:
 * 1. **هل المبلغ ثابت؟** الاشتراك الحقيقي سعره ثابت أو شبه ثابت؛ البقالة
 *    الأسبوعية دورية تماماً لكن مبلغها فوضوي — وهذا وحده ما يستبعدها.
 * 2. **هل ارتفع السعر بصمت؟** أن ينقسم المبلغ إلى مستويين واضحين بحدّ زمني.
 * 3. **هل كانت تجربة مجانية تحوّلت؟** أن يكون أول رسم صفراً أو شبه صفر.
 *
 * كل الدوال نقية، ولا تفترض ترتيباً مسبقاً للمدخلات (ترتّب نسخةً منها بنفسها).
 */

import { median, mean, relativeSpread, stabilityFromSpread } from './stats';

/**
 * أقل ما يحتاجه هذا الملف من عملية: تاريخها ومبلغها.
 * `Transaction` يطابق هذا الشكل بنيوياً، فيُمرَّر كما هو بلا تحويل.
 */
export type AmountPoint = {
  /** تاريخ ISO `YYYY-MM-DD`. */
  date: string;
  /** المبلغ الموجب. */
  amount: number;
};

// ─── ثوابت المعايرة ────────────────────────────────────────────────────────

/**
 * ▲ ثابت معايرة ▲ التشتت النسبي الذي تنهار عنده درجة ثبات المبلغ إلى الصفر.
 *
 * 0.30 أضيق كثيراً من نظيره في الدورية (0.5) عن قصد: تأخير يومين في دورة
 * شهرية أمر طبيعي، أما اختلاف 30% في سعر اشتراك فليس طبيعياً إطلاقاً.
 */
export const AMOUNT_COLLAPSE_SPREAD = 0.3;

/** ▲ ثابت معايرة ▲ حدّ "ثابت تماماً" — هامش لأخطاء الفاصلة العائمة لا أكثر. */
export const FIXED_MAX_SPREAD = 0.001;

/**
 * ▲ ثابت معايرة ▲ حدّ "شبه ثابت".
 * يستوعب فروق الضريبة والتقريب وتحويل العملة (≤ 10%)، ويرفض ما فوقها.
 */
export const NEAR_FIXED_MAX_SPREAD = 0.1;

/**
 * ▲ ثابت معايرة ▲ نصف قطر مستوى السعر الواحد.
 * مبلغان يفصل بينهما ≤ 5% هما نفس السعر (ضريبة، تقريب، فرق صرف).
 * ما تجاوز ذلك يفتح مستوى سعر جديداً.
 */
export const PRICE_LEVEL_TOLERANCE = 0.05;

/**
 * ▲ ثابت معايرة ▲ أقصى نسبة "عدد المستويات ÷ عدد العمليات" لقبول زيادة سعر.
 *
 * هذا هو الحارس الذي يفصل "مستويين واضحين" عن "مبالغ عشوائية".
 * بقالة بخمس عمليات مختلفة تنتج خمسة مستويات (نسبة 1.0) → مرفوضة.
 * اشتراك 56 ثم 70 بست عمليات ينتج مستويين (نسبة 0.33) → مقبول.
 */
export const MAX_LEVELS_RATIO = 0.5;

/**
 * ▲ ثابت معايرة ▲ أقل عدد عمليات يجعل المستوى "مستقراً".
 * تُشترط في مستوى واحد على الأقل: لا بد من سعر ساد فعلاً قبل الحديث عن تغيّره.
 * لا تُشترط في كل المستويات عمداً — وإلا لما كُشفت زيادة وقعت للتوّ (خصم واحد).
 */
export const SETTLED_LEVEL_MIN_COUNT = 2;

/** ▲ ثابت معايرة ▲ أقصى نسبة لأول رسم إلى السعر اللاحق ليُعتبر تجربة مجانية. */
export const FREE_TRIAL_MAX_RATIO = 0.25;

/**
 * ▲ ثابت معايرة ▲ أقصى تشتت مسموح في الرسوم اللاحقة للتجربة المجانية.
 * بدونه تُصنَّف كل عملية شراء رخيصة صادفت أن تكون الأولى عند تاجر متقلّب
 * المبالغ "تجربة مجانية تحوّلت".
 */
export const FREE_TRIAL_TAIL_MAX_SPREAD = 0.25;

// ─── أدوات داخلية ──────────────────────────────────────────────────────────

/**
 * الفرق النسبي بين مبلغين، منسوباً إلى الأكبر منهما (مقياس متماثل).
 *
 * @param a المبلغ الأول
 * @param b المبلغ الثاني
 * @returns نسبة الفرق (0 = متطابقان)
 */
function relativeGap(a: number, b: number): number {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return 0;
  return Math.abs(a - b) / scale;
}

/** يرتّب النقاط زمنياً (ثم بالمبلغ لحسم التعادل) بلا تعديل الأصل. */
function sortPoints(entries: readonly AmountPoint[]): AmountPoint[] {
  return [...entries].sort(
    (left, right) => left.date.localeCompare(right.date) || left.amount - right.amount,
  );
}

// ─── 1. ثبات المبلغ ────────────────────────────────────────────────────────

/** تصنيف ثبات المبلغ. */
export type AmountStabilityKind = 'fixed' | 'near-fixed' | 'variable';

/** ناتج تحليل ثبات المبالغ في مجموعة. */
export type AmountStability = {
  /** عدد المبالغ التي دخلت الحساب. */
  count: number;
  /** الوسيط — السعر التمثيلي للمجموعة. */
  median: number;
  /** المتوسط الحسابي — للعرض فقط. */
  mean: number;
  /** أصغر مبلغ. */
  min: number;
  /** أكبر مبلغ. */
  max: number;
  /** التشتت النسبي حول الوسيط (0 = مبالغ متطابقة). */
  spread: number;
  /** درجة الثبات 0..1. */
  score: number;
  /** التصنيف. */
  kind: AmountStabilityKind;
  /** الاسم المعروض بالعربية. */
  label: string;
};

/** الأسماء المعروضة لتصنيفات الثبات. */
const STABILITY_LABELS: Readonly<Record<AmountStabilityKind, string>> = {
  fixed: 'ثابت',
  'near-fixed': 'شبه ثابت',
  variable: 'متذبذب',
};

/**
 * يقيس ثبات مجموعة مبالغ.
 *
 * المقياس هو التشتت النسبي حول **الوسيط** (لا المتوسط)، ثم يُقلب إلى درجة
 * `1 − spread/AMOUNT_COLLAPSE_SPREAD` محصورة في `[0, 1]`.
 *
 * التصنيف: `fixed` عند التطابق التام، `near-fixed` حتى
 * `NEAR_FIXED_MAX_SPREAD`، و`variable` فوق ذلك.
 *
 * @param amounts المبالغ (بأي ترتيب)
 * @returns مقاييس الثبات كاملة
 *
 * @example
 * analyzeAmountStability([56, 56, 56]).kind        // 'fixed'      — اشتراك
 * analyzeAmountStability([56, 57.5, 56]).kind      // 'near-fixed' — ضريبة/تقريب
 * analyzeAmountStability([120, 340, 85]).kind      // 'variable'   — بقالة
 */
export function analyzeAmountStability(amounts: readonly number[]): AmountStability {
  if (amounts.length === 0) {
    return {
      count: 0,
      median: 0,
      mean: 0,
      min: 0,
      max: 0,
      spread: 0,
      score: 0,
      kind: 'variable',
      label: STABILITY_LABELS.variable,
    };
  }

  const spread = relativeSpread(amounts);
  const kind: AmountStabilityKind =
    spread <= FIXED_MAX_SPREAD ? 'fixed' : spread <= NEAR_FIXED_MAX_SPREAD ? 'near-fixed' : 'variable';

  return {
    count: amounts.length,
    median: median(amounts),
    mean: mean(amounts),
    min: Math.min(...amounts),
    max: Math.max(...amounts),
    spread,
    score: stabilityFromSpread(spread, AMOUNT_COLLAPSE_SPREAD),
    kind,
    label: STABILITY_LABELS[kind],
  };
}

// ─── 2. مستويات السعر وزيادته ──────────────────────────────────────────────

/**
 * يقسّم العمليات إلى **مقاطع متجاورة زمنياً** يشترك كل مقطع في نفس مستوى السعر.
 *
 * المقطع يُغلق حين يبتعد مبلغ جديد عن مبلغ المقطع التمثيلي بأكثر من
 * `PRICE_LEVEL_TOLERANCE`. المبلغ التمثيلي يُعاد حسابه كوسيط للمقطع بعد كل
 * إضافة، فلا ينجرف المقطع خلف أول قيمة فيه.
 *
 * التجاور الزمني شرط أساسي: عودة السعر القديم لاحقاً تُنتج مقطعاً ثالثاً
 * منفصلاً — وهذا بالضبط ما يميّز الزيادة الدائمة عن التذبذب.
 *
 * @param entries العمليات (بأي ترتيب)
 * @returns المقاطع بترتيبها الزمني
 *
 * @example
 * // [56,56,70,70] → مقطعان
 * // [56,70,56,70] → أربعة مقاطع (تذبذب لا زيادة)
 */
export function segmentByPriceLevel(entries: readonly AmountPoint[]): AmountPoint[][] {
  const sorted = sortPoints(entries);
  const segments: AmountPoint[][] = [];

  let current: AmountPoint[] = [];
  let currentLevel = 0;

  for (const point of sorted) {
    if (current.length === 0) {
      current = [point];
      currentLevel = point.amount;
      continue;
    }

    if (relativeGap(point.amount, currentLevel) <= PRICE_LEVEL_TOLERANCE) {
      current.push(point);
      currentLevel = median(current.map((item) => item.amount));
    } else {
      segments.push(current);
      current = [point];
      currentLevel = point.amount;
    }
  }

  if (current.length > 0) segments.push(current);
  return segments;
}

/** مستوى سعر واحد ساد فترة زمنية متصلة. */
export type PriceLevel = {
  /** السعر التمثيلي للمستوى (وسيط مبالغه). */
  amount: number;
  /** عدد العمليات في هذا المستوى. */
  count: number;
  /** تاريخ أول عملية بهذا السعر. */
  firstDate: string;
  /** تاريخ آخر عملية بهذا السعر. */
  lastDate: string;
};

/** انتقال واحد من مستوى سعر إلى الذي يليه. */
export type PriceStep = {
  /** السعر قبل التغيّر. */
  from: number;
  /** السعر بعده. */
  to: number;
  /** نسبة التغيّر: `(to − from) / from`؛ موجبة للزيادة. */
  changeRatio: number;
  /** آخر تاريخ بالسعر القديم. */
  previousDate: string;
  /**
   * أول تاريخ بالسعر الجديد — وهو **التاريخ التقريبي** للزيادة.
   * التغيّر وقع فعلياً في مكان ما بين `previousDate` و`effectiveDate`؛
   * كشف الحساب لا يعرف أكثر من ذلك.
   */
  effectiveDate: string;
};

/** اتجاه تغيّر السعر عبر كل المستويات. */
export type PriceChangeDirection = 'increase' | 'decrease' | 'mixed';

/** ناتج كشف تغيّر السعر. */
export type PriceChange = {
  /** المستويات بترتيبها الزمني (اثنان أو أكثر). */
  levels: PriceLevel[];
  /** الانتقالات بين المستويات المتتالية. */
  steps: PriceStep[];
  /** الاتجاه العام. */
  direction: PriceChangeDirection;
  /** نسبة التغيّر الكلية من أول مستوى إلى آخره. */
  totalChangeRatio: number;
  /** هل فيها زيادة واحدة على الأقل؟ */
  hasIncrease: boolean;
};

/** يحوّل مقطعاً إلى مستوى سعر. */
function toLevel(segment: readonly AmountPoint[]): PriceLevel {
  const dates = segment.map((point) => point.date).sort((a, b) => a.localeCompare(b));
  return {
    amount: median(segment.map((point) => point.amount)),
    count: segment.length,
    firstDate: dates[0] as string,
    lastDate: dates[dates.length - 1] as string,
  };
}

/**
 * يكشف انقسام مبالغ المجموعة إلى **مستويين واضحين أو أكثر بحدّ زمني**.
 *
 * الشروط الأربعة (كلها لازمة):
 * 1. **مستويان فأكثر** بعد التقطيع الزمني.
 * 2. **لا عودة**: لا يتكرّر أي مستوى بعد مغادرته. `56 → 70 → 56` تذبذب لا
 *    زيادة، فتُرفض. (هذه قراءتنا لشرط "ولم يعد" في المواصفة: السعر الجديد
 *    استقرّ ولم يرجع القديم.)
 * 3. **المستويات ليست ضجيجاً**: عددها ≤ `MAX_LEVELS_RATIO` من عدد العمليات.
 *    هذا ما يستبعد البقالة المتغيّرة التي يصير فيها كل مبلغ مستوى بذاته.
 * 4. **سعر ساد فعلاً**: مستوى واحد على الأقل فيه `SETTLED_LEVEL_MIN_COUNT`
 *    عمليات. لا تُشترط في كل المستويات حتى تُكشف الزيادة التي وقعت للتوّ.
 *
 * المبالغ الصفرية تُبطل الكشف: الصفر رسم تجربة أو استرداد، لا مستوى سعر
 * (ولا معنى لنسبة زيادة مقسومة على صفر).
 *
 * @param entries العمليات (بأي ترتيب)
 * @returns تفاصيل التغيّر، أو `null` إذا لم تتحقّق الشروط
 *
 * @example
 * // 56 ريالاً أربع مرات ثم 70 ثلاث مرات
 * detectPriceChange(...)
 * // → steps: [{ from: 56, to: 70, changeRatio: 0.25, effectiveDate: '2024-05-01', ... }]
 */
export function detectPriceChange(entries: readonly AmountPoint[]): PriceChange | null {
  const segments = segmentByPriceLevel(entries);
  if (segments.length < 2) return null;

  const levels = segments.map(toLevel);

  if (levels.some((level) => level.amount <= 0)) return null;

  const maxLevels = Math.max(2, Math.floor(entries.length * MAX_LEVELS_RATIO));
  if (levels.length > maxLevels) return null;

  if (!levels.some((level) => level.count >= SETTLED_LEVEL_MIN_COUNT)) return null;

  // شرط "لا عودة": أي مستويين متطابقين (ولو غير متجاورين) يعنيان تذبذباً
  for (let i = 0; i < levels.length; i += 1) {
    for (let j = i + 1; j < levels.length; j += 1) {
      const first = levels[i] as PriceLevel;
      const second = levels[j] as PriceLevel;
      if (relativeGap(first.amount, second.amount) <= PRICE_LEVEL_TOLERANCE) return null;
    }
  }

  const steps: PriceStep[] = [];
  for (let i = 1; i < levels.length; i += 1) {
    const previous = levels[i - 1] as PriceLevel;
    const next = levels[i] as PriceLevel;
    steps.push({
      from: previous.amount,
      to: next.amount,
      changeRatio: (next.amount - previous.amount) / previous.amount,
      previousDate: previous.lastDate,
      effectiveDate: next.firstDate,
    });
  }

  const increases = steps.filter((step) => step.changeRatio > 0).length;
  const direction: PriceChangeDirection =
    increases === steps.length ? 'increase' : increases === 0 ? 'decrease' : 'mixed';

  const first = levels[0] as PriceLevel;
  const last = levels[levels.length - 1] as PriceLevel;

  return {
    levels,
    steps,
    direction,
    totalChangeRatio: (last.amount - first.amount) / first.amount,
    hasIncrease: increases > 0,
  };
}

// ─── 3. تحوّل التجربة المجانية ─────────────────────────────────────────────

/** ناتج كشف تحوّل تجربة مجانية إلى اشتراك مدفوع. */
export type FreeTrialConversion = {
  /** مبلغ أول رسم (صفر أو رمزي). */
  initialAmount: number;
  /** تاريخ أول رسم. */
  initialDate: string;
  /** السعر الذي استقرّ عليه بعدها (وسيط الرسوم اللاحقة). */
  settledAmount: number;
  /** تاريخ أول رسم كامل — لحظة التحوّل. */
  convertedDate: string;
  /** نسبة الرسم الأول إلى السعر المستقرّ (0 للتجربة المجانية الكاملة). */
  ratio: number;
};

/**
 * يكشف أن أول رسم في المجموعة كان تجربة مجانية أو شبه مجانية ثم تحوّل.
 *
 * الشرط: أول رسم **صفر**، أو أقل من `FREE_TRIAL_MAX_RATIO` من السعر المستقرّ
 * اللاحق (وسيط بقية الرسوم).
 *
 * وشرط ثانٍ للحماية من الإنذار الكاذب: الرسوم اللاحقة يجب أن تكون شبه ثابتة
 * (`FREE_TRIAL_TAIL_MAX_SPREAD`). بدونه تصير كل عملية رخيصة صادفت أن تكون
 * الأولى عند تاجر متقلّب المبالغ "تجربة مجانية تحوّلت".
 *
 * @param entries العمليات (بأي ترتيب)
 * @returns تفاصيل التحوّل، أو `null` إذا لم يتحقّق الشرط
 *
 * @example
 * // 0 ثم 56 ثلاث مرات → تحوّل بنسبة 0
 * // 5 ثم 56 ثلاث مرات → تحوّل بنسبة 0.089 (أقل من 25%)
 * // 50 ثم 56 ثلاث مرات → null (خصم ترحيبي عادي، لا تجربة)
 */
export function detectFreeTrialConversion(
  entries: readonly AmountPoint[],
): FreeTrialConversion | null {
  const sorted = sortPoints(entries);
  if (sorted.length < 2) return null;

  const initial = sorted[0] as AmountPoint;
  const tail = sorted.slice(1);
  const tailAmounts = tail.map((point) => point.amount);

  const settledAmount = median(tailAmounts);
  if (settledAmount <= 0) return null;

  if (relativeSpread(tailAmounts) > FREE_TRIAL_TAIL_MAX_SPREAD) return null;

  const ratio = initial.amount / settledAmount;
  if (ratio >= FREE_TRIAL_MAX_RATIO) return null;

  return {
    initialAmount: initial.amount,
    initialDate: initial.date,
    settledAmount,
    convertedDate: (tail[0] as AmountPoint).date,
    ratio,
  };
}

// ─── 4. الثبات الفعّال (المستخدَم في درجة الثقة) ────────────────────────────

/** على أي أساس حُسبت درجة الثبات الفعّالة. */
export type StabilityBasis = 'single-level' | 'price-levels';

/** درجة ثبات المبلغ بعد مراعاة مستويات السعر. */
export type EffectiveStability = {
  /** الدرجة 0..1. */
  score: number;
  /** الأساس: مستوى واحد، أم متوسط موزون عبر مستويات. */
  basis: StabilityBasis;
};

/**
 * درجة ثبات المبلغ **الفعّالة** — أي بعد إنصاف الاشتراكات التي ارتفع سعرها.
 *
 * المشكلة: مجموعة مبالغها `[56,56,56,70,70,70]` تشتّتها الخام كبير، فتنهار
 * درجة ثباتها ويسقط الاشتراك من النتائج — رغم أنه اشتراك مثالي ارتفع سعره،
 * وهو بالضبط ما نريد إظهاره للمستخدم لا إخفاءه.
 *
 * الحل: إذا كان تغيّر السعر مقبولاً حسب `detectPriceChange`، نقيس الثبات
 * **داخل كل مستوى** ثم نأخذ متوسطاً موزوناً بعدد عمليات كل مستوى. وإذا لم
 * يُقبل (تذبذب، أو مبالغ عشوائية كالبقالة) نعود إلى القياس الخام — فتسقط
 * المجموعة، وهو الصواب.
 *
 * ملاحظة: رسم التجربة المجانية يجب أن يُستبعد من `entries` **قبل** استدعاء
 * هذه الدالة، وإلا عُدّ مستوى سعر مستقلاً. محرك الكشف يتكفّل بذلك الترتيب.
 *
 * @param entries العمليات (بأي ترتيب)
 * @returns الدرجة وأساس حسابها
 */
export function effectiveAmountStability(entries: readonly AmountPoint[]): EffectiveStability {
  const amounts = entries.map((point) => point.amount);
  const priceChange = detectPriceChange(entries);

  if (priceChange === null) {
    return { score: analyzeAmountStability(amounts).score, basis: 'single-level' };
  }

  const segments = segmentByPriceLevel(entries);
  const weighted = segments.reduce(
    (total, segment) =>
      total + analyzeAmountStability(segment.map((point) => point.amount)).score * segment.length,
    0,
  );

  return { score: weighted / entries.length, basis: 'price-levels' };
}
