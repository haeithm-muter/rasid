/**
 * قرارات الجزء 3: أين يُقطع الخط، وبكم يكلّفك هذا شهرياً.
 *
 * محرك الكشف (`detectionEngine.ts`) رفض عمداً أن يقرّر شيئاً من هذا: هو يخرج
 * كل مجموعة بلغت ثلاث عمليات مع درجتيها، وينصّ في رأس ملفه على أن العتبة
 * "قرار يُعايَر ببيانات حقيقية في الجزء 3، لا رقم يُخترع هنا". هذا الملف هو
 * ذلك الجزء 3، وكل رقم فيه معايَر بمخرجات `npm run eval` لا بالحدس.
 *
 * ثلاثة قرارات تُتّخذ هنا وحدها:
 *
 * 1. **عتبة العرض** — أي درجة ثقة تكفي لنقول "هذا اشتراك" (`SUBSCRIPTION_CONFIDENCE_THRESHOLD`)
 * 2. **الفئات غير الاشتراكية** — الإيجار والقسط والراتب: المسار الثاني من
 *    المسارات الثلاثة التي طرحها رأس `detectionEngine.ts` للحدّ المعروف
 * 3. **التطبيع الشهري** — تحويل كل دورة (أسبوعية، سنوية، ربع سنوية) إلى كلفة
 *    شهرية مقارَنة، وهو ما تقوم عليه البطاقات العلوية والرسم البياني
 *
 * كل ما هنا **دوال نقية**: لا React، لا متصفح، لا زمن حاضر. الواجهة والعامل
 * (Web Worker) ومرحلة التقييم يستدعون نفس الدوال بالضبط، فما تراه في الشاشة هو
 * نفسه ما يقيسه `eval/measure.ts` — لا نسختان تفترقان.
 */

import type { SubscriptionCandidate } from './detectionEngine';
import { normalizeForComparison } from './text';

// ─── 1. عتبة العرض ─────────────────────────────────────────────────────────

/**
 * ▲ ثابت معايرة ▲ أقل درجة ثقة تُعرض عندها المجموعة كاشتراك مكتشَف.
 *
 * **كيف عُوير هذا الرقم:** `npm run eval` يمسح العتبات من 0.30 إلى 0.90 على
 * الكشوف الاثني عشر الاصطناعية ويطبع recall وprecision عند كل عتبة (الجدول
 * كاملاً في `eval/RESULTS.md`، القسم 8).
 *
 * المسح يُظهر **هضبة مستقرة** بين 0.55 و0.65 يبلغ فيها الرقمان أفضل ما يبلغانه
 * ولا يتغيّران — وهذه القيمة منتصفها. اختيار المنتصف لا الطرف مقصود: عند 0.50
 * تبدأ الأخطاء الموجبة بالتسرّب، وعند 0.70 يبدأ سقوط اشتراكات حقيقية، والوقوف
 * في المنتصف يترك هامشاً متساوياً على الجانبين لبيانات لم يرها هذا التقييم.
 *
 * ما يعنيه تحريكها:
 * - **رفعها** → precision أعلى، لكن الاشتراكات قصيرة العمر (ثلاث عمليات فقط،
 *   أو التي أُلغيت بعد شهرين) تسقط — وهي بالضبط ما جاء المستخدم يبحث عنه.
 * - **خفضها** → recall أعلى، لكن كل تاجر تكرّر ثلاث مرات بمبلغ متقارب يصير
 *   "اشتراكاً"، فتفقد القائمة معناها.
 */
export const SUBSCRIPTION_CONFIDENCE_THRESHOLD = 0.6;

/** ▲ ثابت معايرة ▲ حدّ "ثقة عالية" في العرض. */
export const CONFIDENCE_HIGH_THRESHOLD = 0.8;

/**
 * ▲ ثابت معايرة ▲ حدّ "ثقة متوسطة" في العرض (ما دونه منخفض).
 *
 * يساوي `SUBSCRIPTION_CONFIDENCE_THRESHOLD` عمداً لا مصادفة: بذلك لا يظهر في
 * قائمة الاشتراكات المكتشفة أي صف موسوم "ثقة منخفضة" — وهو ما يمنع التناقض
 * الذي يربك المستخدم: "أعلنتَه اشتراكاً ثم قلتَ إن ثقتك به منخفضة".
 * درجة "منخفضة" محجوزة لما يُعرض خارج تلك القائمة.
 */
export const CONFIDENCE_MEDIUM_THRESHOLD = SUBSCRIPTION_CONFIDENCE_THRESHOLD;

/** مستوى ثقة معروض للمستخدم. */
export type ConfidenceBand = 'high' | 'medium' | 'low';

/**
 * يحوّل درجة الثقة الرقمية إلى مستوى معروض.
 *
 * الفصل بين الرقم والمستوى مقصود: الواجهة لا تعرض `0.83` لأنه رقم بلا معنى
 * لمن لا يعرف الصيغة، بل تعرض "ثقة عالية" مع الرقم بجانبه لمن يريده.
 *
 * @param confidence درجة الثقة 0..1
 * @returns المستوى المقابل
 */
export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= CONFIDENCE_HIGH_THRESHOLD) return 'high';
  if (confidence >= CONFIDENCE_MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}

// ─── 2. الفئات غير الاشتراكية ──────────────────────────────────────────────

/** فئة رسم دوري ليس اشتراكاً برمجياً. */
export type NonSubscriptionCategory = 'rent' | 'installment' | 'income' | 'insurance' | 'tuition';

/**
 * ▲ جدول معايرة ▲ كلمات مفتاحية تُخرج المجموعة من عدّاد الاشتراكات.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * لماذا وُجد هذا الجدول أصلاً
 * ═══════════════════════════════════════════════════════════════════════════
 * رأس `detectionEngine.ts` يكشف حدّاً صريحاً: إيجار 3500 ريالاً كل شهر يحصل على
 * درجة ثقة عالية جداً، وهذا **صحيح رياضياً** — هو فعلاً رسم دوري بمبلغ ثابت.
 * لا يملك المحرك أي إشارة تفصله عن اشتراك برمجي، وطرح ثلاثة مسارات للحلّ وترك
 * القرار لهذا الجزء. المسار المختار هنا هو الثاني (قائمة كلمات مفتاحية)
 * **مع** الثالث (عرضه للمستخدم بدل إخفائه) — لا أحدهما وحده.
 *
 * ولذلك ما تفعله هذه القائمة محدود عمداً: المجموعة المطابقة **تبقى ظاهرة**
 * للمستخدم مع وسم فئتها، لكنها لا تدخل مجموع الكلفة الشهرية ولا عدّاد
 * الاشتراكات ولا قائمة الإلغاء. المستخدم أدرى بإيجاره، ونحن لا نخفيه عنه.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * حدود هذا الأسلوب — معلنة لا مخفية
 * ═══════════════════════════════════════════════════════════════════════════
 * هذه مطابقة كلمات، وهي هشّة بطبيعتها: إيجار يُكتب باسم شركة عقارية بحتة
 * (`AL NAKHEEL REAL ESTATE`) لن تلتقطه، وشركة اشتراكات اسمها يحوي كلمة
 * `PREMIUM INSURANCE` ستسقط منه خطأً. لا تُعالَج هذه الهشاشة بتوسيع القائمة حتى
 * تبتلع نصف الأسماء، بل بإبقاء أثرها ضيّقاً: وسم وإخراج من المجموع، لا حذف.
 *
 * المطابقة على **كلمة كاملة** بعد التطبيع، حتى لا تبتلع `RENT` كلمة `PARENT`.
 */
export const NON_SUBSCRIPTION_KEYWORDS: Readonly<
  Record<NonSubscriptionCategory, readonly string[]>
> = {
  rent: ['إيجار', 'ايجار', 'الإيجار', 'RENT', 'LEASE'],
  installment: ['قسط', 'أقساط', 'تمويل', 'قرض', 'INSTALLMENT', 'LOAN', 'MORTGAGE', 'FINANCE'],
  income: ['راتب', 'رواتب', 'مرتب', 'SALARY', 'PAYROLL'],
  insurance: ['تأمين', 'التأمين', 'INSURANCE', 'TAKAFUL'],
  tuition: ['رسوم دراسية', 'مدرسة', 'جامعة', 'TUITION', 'SCHOOL', 'UNIVERSITY'],
};

/** الكلمات مطبَّعة مسبقاً ومقرونة بفئتها — يُبنى مرة واحدة عند تحميل الملف. */
const KEYWORD_INDEX: ReadonlyMap<string, NonSubscriptionCategory> = new Map(
  (Object.entries(NON_SUBSCRIPTION_KEYWORDS) as [NonSubscriptionCategory, readonly string[]][])
    .flatMap(([category, keywords]) =>
      keywords.map((keyword) => [normalizeForComparison(keyword), category] as const),
    )
    .filter(([keyword]) => keyword !== ''),
);

/**
 * يفحص اسم تاجر: هل هو رسم دوري من فئة غير اشتراكية؟
 *
 * المطابقة على تسلسل كلمات كامل، فتلتقط `رسوم دراسية` المكوّنة من كلمتين كما
 * تلتقط `RENT` المفردة، ولا تلتقط أياً منهما داخل كلمة أطول.
 *
 * @param merchant الاسم الموحّد من `merchantNormalizer`
 * @returns الفئة، أو `null` إن لم تطابق أي كلمة
 *
 * @example
 * nonSubscriptionCategory('ايجار النخيل') // 'rent'
 * nonSubscriptionCategory('PARENTING APP') // null — لا تبتلع RENT داخل PARENTING
 */
export function nonSubscriptionCategory(merchant: string): NonSubscriptionCategory | null {
  const words = normalizeForComparison(merchant).split(' ').filter((word) => word !== '');
  if (words.length === 0) return null;

  for (let start = 0; start < words.length; start += 1) {
    for (let end = start + 1; end <= words.length; end += 1) {
      const category = KEYWORD_INDEX.get(words.slice(start, end).join(' '));
      if (category !== undefined) return category;
    }
  }
  return null;
}

// ─── 3. التطبيع الشهري ─────────────────────────────────────────────────────

/**
 * ▲ ثابت معايرة ▲ طول الشهر الوسطي بالأيام: `365.25 ÷ 12`.
 *
 * ليس 30 ولا 31: التطبيع الشهري يقسم على طول الدورة بالأيام ثم يضرب في هذا،
 * فاستخدام 30 يضخّم كلفة الاشتراك الأسبوعي بنحو 1.5% ويقزّم السنوي بالمثل.
 */
export const DAYS_PER_MONTH = 365.25 / 12;

/** عدد الشهور في السنة — يُستخدم لتقدير الكلفة السنوية من الشهرية. */
export const MONTHS_PER_YEAR = 12;

/**
 * طول دورة المرشّح بالأيام كما يُستخدم في حساب الكلفة.
 *
 * نفضّل `nominalDays` (30 للشهري، 365 للسنوي) على وسيط الفروق المقيس، لأن
 * اشتراكاً شهرياً وسيط فروقه 28 يوماً ليس أغلى من نظيره ذي الـ31 — كلاهما
 * يُخصم مرة كل شهر فوترة واحد. أما غير المصنَّف فلا اسم لدورته، فنقيسه بوسيطه.
 *
 * @param candidate المرشّح
 * @returns طول الدورة بالأيام، أو `null` إذا تعذّر تقديرها
 */
export function cycleLengthDays(candidate: SubscriptionCandidate): number | null {
  const nominal = candidate.periodicity.nominalDays;
  if (nominal !== null && nominal > 0) return nominal;

  const measured = candidate.periodicity.medianGap;
  return measured > 0 ? measured : null;
}

/**
 * الكلفة الشهرية المطبّعة للمرشّح: كم يكلّفك هذا في الشهر الواحد؟
 *
 * اشتراك سنوي بـ 500 ريال = 41.6 ريالاً شهرياً، وأسبوعي بـ 20 = 87 شهرياً.
 * بلا هذا التطبيع لا يمكن جمع الاشتراكات في رقم واحد ولا مقارنتها في رسم.
 *
 * @param candidate المرشّح
 * @returns الكلفة الشهرية بعملة المرشّح، و`0` إذا تعذّر تقدير الدورة
 */
export function monthlyCost(candidate: SubscriptionCandidate): number {
  const days = cycleLengthDays(candidate);
  if (days === null || !Number.isFinite(candidate.typicalAmount)) return 0;
  return (candidate.typicalAmount * DAYS_PER_MONTH) / days;
}

/**
 * الكلفة السنوية المتوقّعة = الشهرية × 12.
 *
 * "متوقّعة" لا "مدفوعة": هي إسقاط للوضع الحالي على سنة كاملة، لا مجموع ما
 * خُصم فعلاً في الاثني عشر شهراً الماضية. الفرق يظهر في اشتراك ارتفع سعره —
 * نُسقط السعر الجديد لأنه ما ستدفعه، لا القديم الذي دفعته.
 *
 * @param candidate المرشّح
 * @returns الكلفة السنوية المتوقّعة
 */
export function annualCost(candidate: SubscriptionCandidate): number {
  return monthlyCost(candidate) * MONTHS_PER_YEAR;
}

// ─── 4. التصنيف النهائي والملخّص ───────────────────────────────────────────

/** لماذا استُبعد مرشّح من عدّاد الاشتراكات. */
export type ExclusionReason = 'below-threshold' | 'non-subscription-category';

/** مرشّح بعد إضافة قرارات هذا الملف — هذا ما تعرضه الواجهة فعلياً. */
export type DecidedSubscription = {
  /** المرشّح كما خرج من محرك الكشف، بلا تعديل. */
  candidate: SubscriptionCandidate;
  /** هل يُعدّ اشتراكاً مكتشفاً (فوق العتبة وليس فئة مستبعَدة)؟ */
  accepted: boolean;
  /** سبب الاستبعاد، و`null` للمقبول. */
  exclusion: ExclusionReason | null;
  /** الفئة غير الاشتراكية إن طابقت. */
  category: NonSubscriptionCategory | null;
  /** مستوى الثقة المعروض. */
  band: ConfidenceBand;
  /** الكلفة الشهرية المطبّعة. */
  monthly: number;
  /** الكلفة السنوية المتوقّعة. */
  annual: number;
};

/**
 * يطبّق قرارات الجزء 3 على مرشّح واحد.
 *
 * @param candidate المرشّح من محرك الكشف
 * @param threshold عتبة الثقة (تُحقن في مسح العتبات داخل `eval/`)
 * @returns المرشّح مع قراره وكلفته
 */
export function decide(
  candidate: SubscriptionCandidate,
  threshold: number = SUBSCRIPTION_CONFIDENCE_THRESHOLD,
): DecidedSubscription {
  const category = nonSubscriptionCategory(candidate.merchant);

  // ترتيب الفحصين مقصود: الفئة أولاً، حتى يُعرض إيجار عالي الثقة بوسم فئته
  // لا بوسم "ثقة منخفضة" — فالمشكلة ليست في ثقتنا به، بل في كونه ليس اشتراكاً.
  const exclusion: ExclusionReason | null =
    category !== null
      ? 'non-subscription-category'
      : candidate.confidence < threshold
        ? 'below-threshold'
        : null;

  return {
    candidate,
    accepted: exclusion === null,
    exclusion,
    category,
    band: confidenceBand(candidate.confidence),
    monthly: monthlyCost(candidate),
    annual: annualCost(candidate),
  };
}

/** مجموع الكلفة بعملة واحدة. */
export type CurrencyTotal = {
  currency: string;
  monthly: number;
  annual: number;
  count: number;
};

/** ملخّص كشف حساب كامل — مصدر البطاقات العلوية والرسم البياني. */
export type DecisionSummary = {
  /** كل المرشّحين بقراراتهم، مرتّبين كما خرجوا من المحرك (بالاشتباه). */
  decided: DecidedSubscription[];
  /** المقبولون فقط، مرتّبين بالكلفة الشهرية تنازلياً. */
  accepted: DecidedSubscription[];
  /** المستبعَدون بفئة غير اشتراكية — يُعرضون بوسمهم لا يُحذفون. */
  flaggedCategories: DecidedSubscription[];
  /** المجاميع لكل عملة، مرتّبة بالأكبر كلفة. */
  totals: CurrencyTotal[];
  /** عدد الاشتراكات المقبولة. */
  count: number;
  /** العتبة المستخدمة فعلياً في هذا الملخّص. */
  threshold: number;
};

/**
 * يبني الملخّص الكامل من مرشّحي المحرك.
 *
 * **المجاميع مفصولة بالعملة ولا تُجمع أبداً.** كشف فيه اشتراكات بالريال وأخرى
 * بالدولار له مجموعان لا مجموع واحد: تحويل العملات يحتاج سعر صرف، وسعر الصرف
 * يحتاج طلب شبكة — وهو ممنوع في هذا المشروع منعاً غير قابل للتفاوض. الأصدق أن
 * نعرض رقمين صادقين من رقم واحد مخترَع.
 *
 * @param candidates مرشّحو `detectSubscriptions`
 * @param threshold عتبة الثقة (تُحقن في مسح العتبات)
 * @returns الملخّص الكامل
 */
export function summarizeDecision(
  candidates: readonly SubscriptionCandidate[],
  threshold: number = SUBSCRIPTION_CONFIDENCE_THRESHOLD,
): DecisionSummary {
  const decided = candidates.map((candidate) => decide(candidate, threshold));

  const accepted = decided
    .filter((item) => item.accepted)
    .sort(
      (left, right) =>
        right.monthly - left.monthly ||
        left.candidate.merchant.localeCompare(right.candidate.merchant),
    );

  const totalsByCurrency = new Map<string, CurrencyTotal>();
  for (const item of accepted) {
    const currency = item.candidate.currency;
    const existing = totalsByCurrency.get(currency);
    if (existing === undefined) {
      totalsByCurrency.set(currency, {
        currency,
        monthly: item.monthly,
        annual: item.annual,
        count: 1,
      });
    } else {
      existing.monthly += item.monthly;
      existing.annual += item.annual;
      existing.count += 1;
    }
  }

  return {
    decided,
    accepted,
    flaggedCategories: decided.filter((item) => item.exclusion === 'non-subscription-category'),
    totals: [...totalsByCurrency.values()].sort(
      (left, right) => right.monthly - left.monthly || left.currency.localeCompare(right.currency),
    ),
    count: accepted.length,
    threshold,
  };
}
