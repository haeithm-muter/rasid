/**
 * محرك الكشف — قلب رصيد.
 *
 * يأخذ `Transaction[]` من طبقة الإدخال (الجزء 1) ويخرج مرشّحي الاشتراكات
 * مرتّبين بدرجة الاشتباه. كل شيء هنا **دوال نقية**: لا React، لا متصفح،
 * لا زمن حاضر، لا عشوائية. نفس المدخل يعطي نفس المخرج دائماً.
 *
 * خط التحليل لكل مجموعة تاجر:
 *
 *   العمليات → مجموعة تاجر (merchantNormalizer)
 *            → دورية بفروق الأيام (periodicity)
 *            → تجربة مجانية؟ فتُستبعد من قياس السعر (amountAnalysis)
 *            → مستويات سعر وزيادته (amountAnalysis)
 *            → ثبات فعّال داخل المستويات (amountAnalysis)
 *            → درجة ثقة  = كم هذا نمط اشتراك؟
 *            → درجة اشتباه = كم يُرجَّح أن صاحبه نسيه؟
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ حدّ معروف ومكشوف: الإيجار الشهري الثابت
 * ═══════════════════════════════════════════════════════════════════════════
 * إيجار 3500 ريالاً كل شهر سيحصل هنا على **درجة ثقة عالية جداً** — وهذا صحيح
 * رياضياً: هو فعلاً رسم دوري بمبلغ ثابت. لا يملك هذا المحرك أي إشارة تفصل
 * "رسم دوري" عن "اشتراك برمجي": كلاهما تاريخ ومبلغ ووصف، ولا فئة (category)
 * ولا قائمة تجّار معروفين في بيانات الجزء 1.
 *
 * ما يخفّفه جزئياً — ولا يحلّه: **درجة الاشتباه** تنزل مع كبر المبلغ، فيهبط
 * الإيجار في الترتيب تحت اشتراك بـ 19 ريالاً. لكنه يبقى في القائمة.
 *
 * القرار متروك صراحةً لمرحلة التقييم في الجزء 3، وأمامها ثلاثة مسارات:
 *   1. عتبة مبلغ أعلى منها يُرجَّح أنه ليس اشتراكاً برمجياً (تُعايَر بالبيانات)
 *   2. قائمة كلمات مفتاحية للفئات غير الاشتراكية (إيجار، قسط، راتب، تأمين)
 *   3. تركه للمستخدم: عرضه مع تنبيه، فهو أدرى بإيجاره
 * لا تُخفَ هذه المشكلة تحت عتبة صامتة في هذا الملف.
 *
 * (الحالة المقابلة — البقالة الأسبوعية بمبالغ متغيّرة — تُستبعد تلقائياً هنا:
 * دوريتها سليمة تماماً لكن ثبات مبلغها ينهار، فتُغلق بوابة المبلغ في
 * `computeConfidence` وتهبط ثقتها إلى الصفر. لا قاعدة خاصة بالبقالة.)
 */

import {
  analyzeAmountStability,
  detectFreeTrialConversion,
  detectPriceChange,
  effectiveAmountStability,
} from './amountAnalysis';
import type {
  AmountStability,
  EffectiveStability,
  FreeTrialConversion,
  PriceChange,
} from './amountAnalysis';
import { buildMerchantIndex } from './merchantNormalizer';
import {
  MIN_TRANSACTIONS_FOR_PERIODICITY,
  analyzePeriodicity,
  daysBetween,
  sortByDate,
} from './periodicity';
import type { PeriodicityResult } from './periodicity';
import { clamp01, median } from './stats';
import type { Transaction } from './types';

// ─── أوزان درجة الثقة ──────────────────────────────────────────────────────

/** ▲ وزن ▲ انتظام الدورة في درجة الثقة. */
export const CONFIDENCE_WEIGHT_REGULARITY = 0.45;

/** ▲ وزن ▲ ثبات المبلغ في درجة الثقة. */
export const CONFIDENCE_WEIGHT_AMOUNT = 0.35;

/** ▲ وزن ▲ عدد العمليات في درجة الثقة. */
export const CONFIDENCE_WEIGHT_COUNT = 0.2;

/**
 * ▲ ثابت معايرة ▲ عدد العمليات الذي يشبع عنده عامل العدد.
 * ست عمليات = أربع تكرارات مؤكِّدة للدورة؛ ما بعدها لا يضيف يقيناً يُذكر.
 */
export const CONFIDENCE_COUNT_SATURATION = 6;

/**
 * ▲ ثابت معايرة ▲ معامل خفض الثقة حين لا تقع الدورة في أي مدى معروف.
 *
 * لا نصفّر الثقة: نمط كل 45 يوماً بمبلغ ثابت شيء حقيقي يستحق العرض، لكنه
 * ليس إيقاع فوترة معروفاً — فنسقفه عند النصف بدل ادّعاء اليقين أو إخفائه.
 */
export const UNCLASSIFIED_CYCLE_FACTOR = 0.5;

/**
 * ▲ ثابت معايرة ▲ درجة ثبات المبلغ التي تُفتح عندها بوابة الثقة كاملةً.
 *
 * ثبات المبلغ ليس شاهداً يُوزَن فحسب، بل **شرط لازم**: ما لا سعر له ليس
 * اشتراكاً مهما كان إيقاعه منتظماً. تحت هذه الدرجة يتحوّل الثبات إلى سقف
 * يهبط خطياً مع هبوطه، وعند الصفر يُلغي المرشّح تماماً.
 *
 * 0.5 تقابل تشتتاً بمقدار 15% من السعر: ما دونه سعر يتقلّب (صرف عملة، ضريبة
 * متغيّرة) فيبقى مرشّحاً بدرجة أقل، وما هو أسوأ منه بكثير — كبقالة تتراوح بين
 * 85 و340 ريالاً — يسقط من تلقاء نفسه بلا قاعدة خاصة.
 */
export const AMOUNT_GATE_FULL_STABILITY = 0.5;

// ─── أوزان درجة الاشتباه ───────────────────────────────────────────────────

/** ▲ وزن ▲ طول مدة الاستمرار في درجة الاشتباه. */
export const SUSPICION_WEIGHT_LONGEVITY = 0.35;

/** ▲ وزن ▲ صغر المبلغ في درجة الاشتباه. */
export const SUSPICION_WEIGHT_SMALLNESS = 0.35;

/** ▲ وزن ▲ ثبات النمط (درجة الثقة) في درجة الاشتباه. */
export const SUSPICION_WEIGHT_PATTERN = 0.3;

/** ▲ ثابت معايرة ▲ المدة التي يشبع عندها عامل الاستمرار: سنة كاملة. */
export const SUSPICION_LONGEVITY_SATURATION_DAYS = 365;

/**
 * ▲ ثابتا معايرة ▲ نافذة "صغر المبلغ".
 *
 * ما دون `SMALL_AMOUNT_FLOOR` صغير بلا منازع (يمرّ في كشف الحساب بلا أن
 * تلحظه عين)، وما فوق `LARGE_AMOUNT_CEILING` كبير بما يكفي لأن يُلحَظ شهرياً.
 * بينهما تدرّج **لوغاريتمي** لا خطّي: الفرق بين 15 و30 ريالاً أهم بكثير من
 * الفرق بين 300 و315.
 *
 * ⚠ معايَرة بالريال السعودي. المجموعات بعملات أخرى تُقاس بنفس الأرقام بلا
 * تحويل — فتبدو مجموعة بالدولار "أصغر" مما هي. تحويل العملات قرار الجزء 3.
 */
export const SMALL_AMOUNT_FLOOR = 20;
export const LARGE_AMOUNT_CEILING = 500;

// ─── درجة الثقة ────────────────────────────────────────────────────────────

/** مدخلات درجة الثقة الثلاثة. */
export type ConfidenceInput = {
  /** انتظام الدورة 0..1 من `analyzePeriodicity`. */
  regularity: number;
  /** ثبات المبلغ الفعّال 0..1 من `effectiveAmountStability`. */
  amountStability: number;
  /** عدد العمليات في المجموعة. */
  occurrences: number;
  /** هل وقعت الدورة في أحد مدايات `CYCLE_RANGES`؟ */
  cycleRecognized: boolean;
};

/**
 * درجة الثقة: **كم يشبه هذا اشتراكاً؟** رقم بين 0 و1.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * الصيغة
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *     evidence   = 0.45·regularity + 0.35·amountStability + 0.20·countFactor
 *     confidence = cycleFactor × amountGate × evidence
 *
 * حيث:
 *
 *     countFactor = clamp01( (occurrences − 2) / (6 − 2) )
 *     cycleFactor = 1 إذا وقعت الدورة في مدى معروف، وإلا 0.5
 *     amountGate  = min( 1, amountStability / 0.5 )
 *
 * وقبل كل ذلك: **أقل من ثلاث عمليات → 0 مباشرة**، لا تدرّج. عمليتان تعطيان
 * فرقاً واحداً لا نمطاً، وعملية واحدة تشتتها صفر فتبدو "ثابتة المبلغ" وهماً.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * العوامل الثلاثة وأوزانها
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **انتظام الدورة (0.45) — الأثقل.** هذا ما يميّز الاشتراك عن كل ما عداه.
 * آلة تخصم في موعدها، والإنسان لا. تاجر تشتري منه بمبالغ متطابقة على فترات
 * عشوائية ليس اشتراكاً؛ وخصم منتظم كالساعة يكاد لا يكون شيئاً آخر.
 *
 * **ثبات المبلغ (0.35) — يليه مباشرة.** وزنه أقل قليلاً لأن الاشتراكات
 * الحقيقية تكسره أحياناً بمشروعية (ضريبة، صرف عملة، زيادة سعر) — ولذلك يدخل
 * هنا الثبات **الفعّال** لا الخام، أي المقيس داخل كل مستوى سعر.
 *
 * **عدد العمليات (0.20) — الأخف.** ليس دليلاً على كون الشيء اشتراكاً، بل على
 * أن الدليلين الآخرين ليسا مصادفة. ثلاث عمليات = تكرار واحد مؤكِّد = 0.25 فقط؛
 * ست عمليات = أربعة تكرارات = إشباع. القسمة على `occurrences − 2` مقصودة:
 * `n` عملية تعطي `n−1` فرقاً، وأول فرق يُنشئ الفرضية ولا يؤكّدها، فالباقي
 * `n−2` هو عدد مرات تأكيد النمط فعلاً.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ولماذا بوابتان تضربان بدل عاملين يُجمعان
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * المجموع الموزون وحده يقول "كلما زاد أي عامل زادت الثقة"، وهذا لا يكفي: بعض
 * الشروط **لازمة** لا مجرّد شواهد تُجمع. البوابتان تعبّران عن ذلك بالضرب:
 *
 * **بوابة الدورة.** مهما بلغ انتظام نمط كل 45 يوماً وثبات مبلغه، لا تتجاوز
 * ثقته 0.5 — لأن أحداً لا يفوتر كل 45 يوماً.
 *
 * **بوابة المبلغ.** ما لا سعر له ليس اشتراكاً مهما كان إيقاعه منتظماً. البقالة
 * الأسبوعية (7 أيام بالضبط، مبالغ بين 85 و340) تحصل بالمجموع الموزون وحده على
 * `0.45×1 + 0.35×0 + 0.20×1 = 0.65` — درجة عالية لشيء ليس اشتراكاً قطعاً.
 * البوابة تُسقطها إلى الصفر تلقائياً، وهو ما تنصّ عليه المواصفة صراحةً: ثبات
 * المبلغ هو ما يستبعد هذه الحالة، بلا قاعدة خاصة بالبقالة.
 *
 * نعم، ثبات المبلغ يدخل الحساب مرتين (شاهداً موزوناً وشرطاً لازماً)، وهذا
 * مقصود لا سهو: فوق 0.5 يعمل شاهداً وحده (البوابة مفتوحة تماماً)، وتحتها يبدأ
 * سقفاً يهبط. الاشتراك ذو السعر المتقلّب بصرف العملة يبقى مرشّحاً بدرجة أقل،
 * والذي لا سعر له أصلاً يخرج.
 *
 * الحدّان: أقل قيمة 0، وأعلى قيمة 1 (انتظام تام + ثبات تام + ست عمليات فأكثر
 * + دورة معروفة).
 *
 * @param input العوامل الثلاثة + هل الدورة معروفة
 * @returns درجة بين 0 و1
 *
 * @example
 * // اشتراك مثالي: كل 28 يوماً بـ 56 ريالاً، ثماني مرات
 * computeConfidence({ regularity: 1, amountStability: 1, occurrences: 8, cycleRecognized: true })
 * // → 1
 *
 * @example
 * // بقالة أسبوعية منتظمة تماماً بمبالغ فوضوية
 * computeConfidence({ regularity: 1, amountStability: 0, occurrences: 20, cycleRecognized: true })
 * // → 0
 */
export function computeConfidence(input: ConfidenceInput): number {
  // تحت الحد الأدنى لا يوجد نمط يُقاس أصلاً. لولا هذا السطر لأعطت عملية يتيمة
  // ثقةً غير صفرية: تشتت قيمة واحدة صفر دائماً، فيبدو "ثبات مبلغ" تاماً وهو
  // وهمٌ حسابي لا شاهد. نفس القاعدة التي يطبّقها `analyzePeriodicity`.
  if (input.occurrences < MIN_TRANSACTIONS_FOR_PERIODICITY) return 0;

  const stability = clamp01(input.amountStability);
  const countFactor = clamp01((input.occurrences - 2) / (CONFIDENCE_COUNT_SATURATION - 2));

  const evidence =
    CONFIDENCE_WEIGHT_REGULARITY * clamp01(input.regularity) +
    CONFIDENCE_WEIGHT_AMOUNT * stability +
    CONFIDENCE_WEIGHT_COUNT * countFactor;

  const cycleFactor = input.cycleRecognized ? 1 : UNCLASSIFIED_CYCLE_FACTOR;
  const amountGate = clamp01(stability / AMOUNT_GATE_FULL_STABILITY);

  return clamp01(evidence * cycleFactor * amountGate);
}

// ─── درجة الاشتباه ─────────────────────────────────────────────────────────

/** مدخلات درجة الاشتباه. */
export type SuspicionInput = {
  /** المدة بالأيام بين أول عملية وآخرها. */
  spanDays: number;
  /** السعر التمثيلي للمجموعة (السعر الحالي إن تغيّر). */
  typicalAmount: number;
  /** درجة الثقة المحسوبة — تمثّل "ثبات النمط". */
  confidence: number;
};

/**
 * "صِغَر" المبلغ على مقياس 0..1، لوغاريتمياً بين الأرضية والسقف.
 *
 * @param amount المبلغ التمثيلي
 * @returns 1 للمبالغ الصغيرة جداً، و0 للكبيرة
 */
function smallnessFactor(amount: number): number {
  if (!Number.isFinite(amount) || amount <= SMALL_AMOUNT_FLOOR) return 1;
  if (amount >= LARGE_AMOUNT_CEILING) return 0;
  return clamp01(
    Math.log(LARGE_AMOUNT_CEILING / amount) / Math.log(LARGE_AMOUNT_CEILING / SMALL_AMOUNT_FLOOR),
  );
}

/**
 * درجة الاشتباه: **كم يُرجَّح أن صاحب الحساب نسي هذا؟** رقم بين 0 و1.
 *
 * هذه درجة **ترتيب** لا حكم. الثقة تقول "هذا اشتراك"، والاشتباه يقول "وهذا
 * تحديداً هو الذي يجب أن يراه المستخدم أولاً".
 *
 *     suspicion = 0.35·longevity + 0.35·smallness + 0.30·confidence
 *
 *     longevity = clamp01( spanDays / 365 )
 *     smallness = تدرّج لوغاريتمي بين 20 ريالاً (=1) و500 ريال (=0)
 *
 * المنطق: **المبالغ الصغيرة القديمة الثابتة هي الأكثر عرضة للنسيان.**
 * - **قِدَم/استمرار (0.35):** اشتراك يعمل منذ سنتين تجاوز حدّ "قررت الاحتفاظ
 *   به" إلى حدّ "لم تعد تراه". الشهر الأول لا يُنسى.
 * - **صِغَر المبلغ (0.35):** 15 ريالاً تمرّ في الكشف بلا أن تلحظها عين، و900
 *   ريال تُلحَظ. الوزنان متساويان لأن أياً منهما وحده لا يكفي: خصم كبير قديم
 *   قرار واعٍ، وخصم صغير جديد ما زال في الذاكرة.
 * - **ثبات النمط (0.30):** كلما كان النمط آلياً نظيفاً، كان الخصم صامتاً
 *   أكثر — لا فاتورة متغيّرة تلفت النظر إليه.
 *
 * @param input المدة والمبلغ ودرجة الثقة
 * @returns درجة بين 0 و1
 */
export function computeSuspicion(input: SuspicionInput): number {
  const longevity = clamp01(input.spanDays / SUSPICION_LONGEVITY_SATURATION_DAYS);
  const smallness = smallnessFactor(input.typicalAmount);

  return clamp01(
    SUSPICION_WEIGHT_LONGEVITY * longevity +
      SUSPICION_WEIGHT_SMALLNESS * smallness +
      SUSPICION_WEIGHT_PATTERN * clamp01(input.confidence),
  );
}

// ─── التجميع ───────────────────────────────────────────────────────────────

/** مجموعة عمليات تخصّ تاجراً واحداً بعملة واحدة. */
export type MerchantGroup = {
  /** الاسم الموحّد من `merchantNormalizer`. */
  merchant: string;
  /** عملة المجموعة (ISO-4217). */
  currency: string;
  /** العمليات مرتّبة زمنياً. */
  transactions: Transaction[];
};

/** خيارات محرك الكشف. */
export type DetectionOptions = {
  /** عتبة تشابه أسماء التجار؛ تُمرَّر كما هي إلى `buildMerchantIndex`. */
  similarityThreshold?: number;
  /** الحد الأدنى لعدد العمليات في المجموعة؛ الافتراضي 3. */
  minOccurrences?: number;
  /**
   * هل تدخل الإيداعات التحليل؟ الافتراضي `false`.
   * الاشتراك خصم؛ والرواتب والاستردادات إيداعات دورية ثابتة تلوّث النتائج.
   */
  includeCredits?: boolean;
};

/**
 * يجمّع العمليات في مجموعات تاجر واحد بعملة واحدة.
 *
 * **لماذا العملة جزء من المفتاح؟** نفس التاجر قد يخصم 56 ريالاً و15 دولاراً؛
 * خلطهما يجعل ثبات المبلغ فوضى بلا سبب حقيقي. هما تدفّقا خصم مستقلان فعلاً،
 * وفصلهما أصدق من دمجهما.
 *
 * @param transactions العمليات (بأي ترتيب)
 * @param options خيارات التجميع
 * @returns المجموعات، كل واحدة مرتّبة زمنياً
 */
export function groupByMerchant(
  transactions: readonly Transaction[],
  options: DetectionOptions = {},
): MerchantGroup[] {
  const relevant =
    options.includeCredits === true
      ? [...transactions]
      : transactions.filter((transaction) => transaction.direction === 'debit');

  const index = buildMerchantIndex(
    relevant,
    options.similarityThreshold === undefined ? {} : { threshold: options.similarityThreshold },
  );

  // فاصل لا يظهر في اسم تاجر ولا في رمز عملة، فلا يلتبس مفتاحان أبداً
  const separator = String.fromCodePoint(0);

  const groups = new Map<string, MerchantGroup>();
  for (const transaction of relevant) {
    const merchant = index.byDescription.get(transaction.description) ?? transaction.description;
    const key = `${merchant}${separator}${transaction.currency}`;

    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, { merchant, currency: transaction.currency, transactions: [transaction] });
    } else {
      existing.transactions.push(transaction);
    }
  }

  return [...groups.values()]
    .map((group) => ({ ...group, transactions: sortByDate(group.transactions) }))
    .sort(
      (left, right) =>
        right.transactions.length - left.transactions.length ||
        left.merchant.localeCompare(right.merchant) ||
        left.currency.localeCompare(right.currency),
    );
}

// ─── النتيجة ───────────────────────────────────────────────────────────────

/** وسوم تنبيه تُعلّق على المجموعة لتعرضها الواجهة في الجزء 3. */
export type DetectionFlag =
  | 'price-increase'
  | 'price-decrease'
  | 'free-trial-converted'
  | 'unclassified-cycle'
  | 'variable-amount';

/** مرشّح اشتراك واحد بكل ما عُرف عنه. */
export type SubscriptionCandidate = {
  /** الاسم الموحّد للتاجر. */
  merchant: string;
  /** عملة المجموعة. */
  currency: string;
  /** العمليات مرتّبة زمنياً — الأصل محفوظ كاملاً للعرض والتحقق. */
  transactions: readonly Transaction[];
  /** عدد العمليات. */
  occurrences: number;
  /** تاريخ أول عملية. */
  firstDate: string;
  /** تاريخ آخر عملية. */
  lastDate: string;
  /** المدة بالأيام بين الأولى والأخيرة. */
  spanDays: number;
  /** تحليل الدورية كاملاً. */
  periodicity: PeriodicityResult;
  /** ثبات المبلغ الخام (كل المبالغ كما هي). */
  amountStability: AmountStability;
  /** الثبات الفعّال المستخدَم في درجة الثقة (داخل مستويات السعر). */
  effectiveStability: EffectiveStability;
  /** السعر التمثيلي: السعر الحالي إن تغيّر، وإلا وسيط المبالغ المستقرّة. */
  typicalAmount: number;
  /** تفاصيل تغيّر السعر إن وُجد. */
  priceChange: PriceChange | null;
  /** تفاصيل تحوّل التجربة المجانية إن وُجد. */
  freeTrial: FreeTrialConversion | null;
  /** كم يشبه هذا اشتراكاً؟ 0..1 */
  confidence: number;
  /** كم يُرجَّح أنه نُسي؟ 0..1 — وعليه يقوم الترتيب. */
  suspicion: number;
  /** وسوم للعرض. */
  flags: DetectionFlag[];
};

/** مجموعة استُبعدت قبل التحليل، مع سببها. */
export type SkippedGroup = {
  merchant: string;
  currency: string;
  occurrences: number;
  /** سبب مقروء بالعربية. */
  reason: string;
};

/** ناتج تشغيل المحرك على كشف حساب كامل. */
export type DetectionReport = {
  /** المرشّحون مرتّبون بدرجة الاشتباه تنازلياً. */
  candidates: SubscriptionCandidate[];
  /** المجموعات المستبعَدة لقلّة عملياتها. */
  skipped: SkippedGroup[];
};

/**
 * يحلّل مجموعة تاجر واحدة ويخرج مرشّحاً كاملاً.
 *
 * ترتيب الخطوات مقصود: **التجربة المجانية تُكشف أولاً** ويُستبعد رسمها من
 * قياس السعر، وإلا عُدّ الصفر مستوى سعر مستقلاً وظهرت "زيادة" وهمية بنسبة
 * لا نهائية. أما تواريخها فتبقى داخل حساب الدورية لأن الرسم المجاني جزء من
 * إيقاع الاشتراك.
 *
 * @param group مجموعة تاجر **غير فارغة** (شرط مسبق — `groupByMerchant` يضمنه)
 * @returns المرشّح بكل مقاييسه
 */
export function analyzeGroup(group: MerchantGroup): SubscriptionCandidate {
  const transactions = sortByDate(group.transactions);
  const first = transactions[0] as Transaction;
  const last = transactions[transactions.length - 1] as Transaction;

  const periodicity = analyzePeriodicity(transactions.map((transaction) => transaction.date));
  const amountStability = analyzeAmountStability(
    transactions.map((transaction) => transaction.amount),
  );

  const freeTrial = detectFreeTrialConversion(transactions);
  const settled = freeTrial === null ? transactions : transactions.slice(1);

  const priceChange = detectPriceChange(settled);
  const effectiveStability = effectiveAmountStability(settled);

  const currentLevel = priceChange?.levels[priceChange.levels.length - 1];
  const typicalAmount =
    currentLevel?.amount ?? median(settled.map((transaction) => transaction.amount));

  const spanDays = daysBetween(first.date, last.date) ?? 0;

  const confidence = computeConfidence({
    regularity: periodicity.regularity,
    amountStability: effectiveStability.score,
    occurrences: transactions.length,
    cycleRecognized: periodicity.cycle !== 'irregular',
  });

  const suspicion = computeSuspicion({ spanDays, typicalAmount, confidence });

  const flags: DetectionFlag[] = [];
  if (priceChange?.hasIncrease === true) flags.push('price-increase');
  if (priceChange?.steps.some((step) => step.changeRatio < 0) === true) {
    flags.push('price-decrease');
  }
  if (freeTrial !== null) flags.push('free-trial-converted');
  if (periodicity.cycle === 'irregular') flags.push('unclassified-cycle');
  if (amountStability.kind === 'variable' && priceChange === null) flags.push('variable-amount');

  return {
    merchant: group.merchant,
    currency: group.currency,
    transactions,
    occurrences: transactions.length,
    firstDate: first.date,
    lastDate: last.date,
    spanDays,
    periodicity,
    amountStability,
    effectiveStability,
    typicalAmount,
    priceChange,
    freeTrial,
    confidence,
    suspicion,
    flags,
  };
}

/**
 * نقطة الدخول: يكشف مرشّحي الاشتراكات في كشف حساب كامل.
 *
 * **لا عتبة قبول/رفض هنا.** كل مجموعة بلغت الحد الأدنى من العمليات تخرج في
 * `candidates` بدرجتيها، مرتّبةً بالاشتباه. أين يُقطع الخط — وأي درجة ثقة
 * تُعرض للمستخدم — قرار يُعايَر ببيانات حقيقية في الجزء 3، لا رقم يُخترع هنا.
 *
 * @param transactions العمليات الموحّدة من `importCsv`
 * @param options خيارات التجميع والحد الأدنى
 * @returns المرشّحون مرتّبون بالاشتباه + المجموعات المستبعَدة بأسبابها
 *
 * @example
 * const { candidates } = detectSubscriptions(transactions);
 * candidates[0]; // الأرجح أن يكون اشتراكاً منسياً
 */
export function detectSubscriptions(
  transactions: readonly Transaction[],
  options: DetectionOptions = {},
): DetectionReport {
  const minOccurrences = options.minOccurrences ?? MIN_TRANSACTIONS_FOR_PERIODICITY;

  const candidates: SubscriptionCandidate[] = [];
  const skipped: SkippedGroup[] = [];

  for (const group of groupByMerchant(transactions, options)) {
    if (group.transactions.length < minOccurrences) {
      skipped.push({
        merchant: group.merchant,
        currency: group.currency,
        occurrences: group.transactions.length,
        reason: `أقل من ${minOccurrences} عمليات — لا يكفي للحديث عن تكرار`,
      });
      continue;
    }

    candidates.push(analyzeGroup(group));
  }

  candidates.sort(
    (left, right) =>
      right.suspicion - left.suspicion ||
      right.confidence - left.confidence ||
      left.merchant.localeCompare(right.merchant),
  );

  return { candidates, skipped };
}
