import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_HIGH_THRESHOLD,
  CONFIDENCE_MEDIUM_THRESHOLD,
  DAYS_PER_MONTH,
  MONTHS_PER_YEAR,
  SUBSCRIPTION_CONFIDENCE_THRESHOLD,
  annualCost,
  confidenceBand,
  cycleLengthDays,
  decide,
  monthlyCost,
  nonSubscriptionCategory,
  summarizeDecision,
} from '../src/core/decision';
import { analyzeGroup } from '../src/core/detectionEngine';
import type { SubscriptionCandidate } from '../src/core/detectionEngine';
import type { Transaction } from '../src/core/types';

// ─── مساعدات ──────────────────────────────────────────────────────────────

/** يبني سلسلة عمليات لتاجر واحد بإيقاع ثابت بالأيام. */
function series(options: {
  description: string;
  amount: number;
  count: number;
  stepDays: number;
  start?: string;
  currency?: string;
}): Transaction[] {
  const { description, amount, count, stepDays, start = '2024-01-05', currency = 'SAR' } = options;
  const [year, month, day] = start.split('-').map(Number) as [number, number, number];

  return Array.from({ length: count }, (_, index) => ({
    date: new Date(Date.UTC(year, month - 1, day + index * stepDays)).toISOString().slice(0, 10),
    description,
    amount,
    currency,
    direction: 'debit' as const,
  }));
}

/** يبني مرشّحاً حقيقياً عبر محرك الكشف نفسه (لا كائناً مزيّفاً باليد). */
function candidate(options: Parameters<typeof series>[0]): SubscriptionCandidate {
  const transactions = series(options);
  return analyzeGroup({
    merchant: options.description,
    currency: options.currency ?? 'SAR',
    transactions,
  });
}

// ─── مستويات الثقة ────────────────────────────────────────────────────────

describe('confidenceBand — تحويل الدرجة إلى مستوى معروض', () => {
  it('يصنّف ما بلغ حدّ العالي عالياً', () => {
    expect(confidenceBand(CONFIDENCE_HIGH_THRESHOLD)).toBe('high');
    expect(confidenceBand(1)).toBe('high');
  });

  it('يصنّف ما بين الحدّين متوسطاً', () => {
    expect(confidenceBand(CONFIDENCE_MEDIUM_THRESHOLD)).toBe('medium');
    expect(confidenceBand((CONFIDENCE_MEDIUM_THRESHOLD + CONFIDENCE_HIGH_THRESHOLD) / 2)).toBe(
      'medium',
    );
  });

  it('يصنّف ما دون حدّ المتوسط منخفضاً', () => {
    expect(confidenceBand(CONFIDENCE_MEDIUM_THRESHOLD - 0.01)).toBe('low');
    expect(confidenceBand(0)).toBe('low');
  });

  it('يجعل حدّ "متوسط" مطابقاً لعتبة القبول فلا يظهر صف مقبول بثقة منخفضة', () => {
    expect(CONFIDENCE_MEDIUM_THRESHOLD).toBe(SUBSCRIPTION_CONFIDENCE_THRESHOLD);
  });
});

// ─── الفئات غير الاشتراكية ────────────────────────────────────────────────

describe('nonSubscriptionCategory — الفئات التي ليست اشتراكات', () => {
  it('يلتقط الإيجار بالعربية والإنجليزية', () => {
    expect(nonSubscriptionCategory('ايجار شقه')).toBe('rent');
    expect(nonSubscriptionCategory('إيجار')).toBe('rent');
    expect(nonSubscriptionCategory('RENT AL NAKHEEL')).toBe('rent');
  });

  it('يلتقط القسط والراتب والتأمين والرسوم الدراسية', () => {
    expect(nonSubscriptionCategory('قسط سيارة')).toBe('installment');
    expect(nonSubscriptionCategory('MONTHLY LOAN')).toBe('installment');
    expect(nonSubscriptionCategory('راتب')).toBe('income');
    expect(nonSubscriptionCategory('تأمين طبي')).toBe('insurance');
    expect(nonSubscriptionCategory('TUITION')).toBe('tuition');
  });

  it('يطابق تسلسل كلمات كاملاً لا كلمة واحدة منه', () => {
    expect(nonSubscriptionCategory('رسوم دراسية')).toBe('tuition');
  });

  it('لا يبتلع الكلمة المفتاحية داخل كلمة أطول', () => {
    expect(nonSubscriptionCategory('PARENTING APP')).toBeNull();
    expect(nonSubscriptionCategory('CURRENT ACCOUNT')).toBeNull();
  });

  it('لا يطابق أسماء التجّار العادية', () => {
    expect(nonSubscriptionCategory('NETFLIX')).toBeNull();
    expect(nonSubscriptionCategory('SPOTIFY')).toBeNull();
    expect(nonSubscriptionCategory('')).toBeNull();
  });

  it('يتحمّل اختلاف الهمزات والتشكيل لأن المطابقة بعد التطبيع', () => {
    expect(nonSubscriptionCategory('إيجَار')).toBe('rent');
    expect(nonSubscriptionCategory('rent payment')).toBe('rent');
  });
});

// ─── التطبيع الشهري ───────────────────────────────────────────────────────

describe('monthlyCost — تطبيع الكلفة على الشهر', () => {
  it('يترك الاشتراك الشهري كما هو تقريباً', () => {
    const monthly = candidate({ description: 'NETFLIX', amount: 56, count: 8, stepDays: 30 });
    expect(monthlyCost(monthly)).toBeCloseTo((56 * DAYS_PER_MONTH) / 30, 5);
  });

  it('يوزّع الاشتراك السنوي على اثني عشر شهراً', () => {
    const annual = candidate({ description: 'GODADDY', amount: 600, count: 3, stepDays: 365 });
    expect(annual.periodicity.cycle).toBe('annual');
    // 600 على مدى 365 يوماً ≈ 50 شهرياً
    expect(monthlyCost(annual)).toBeCloseTo((600 * DAYS_PER_MONTH) / 365, 5);
    expect(monthlyCost(annual)).toBeGreaterThan(49);
    expect(monthlyCost(annual)).toBeLessThan(51);
  });

  it('يضاعف الاشتراك الأسبوعي إلى ما يزيد على أربع مرات شهرياً', () => {
    const weekly = candidate({ description: 'COFFEE PASS', amount: 20, count: 10, stepDays: 7 });
    expect(weekly.periodicity.cycle).toBe('weekly');
    expect(monthlyCost(weekly)).toBeCloseTo((20 * DAYS_PER_MONTH) / 7, 5);
    expect(monthlyCost(weekly)).toBeGreaterThan(80);
  });

  it('يستخدم الطول الاسمي للدورة لا وسيط الفروق المقيس', () => {
    // دورة 28 يوماً تُصنَّف شهرية، فتُحسب كخصم شهري واحد لا كـ 30/28 منه
    const drifting = candidate({ description: 'SPOTIFY', amount: 21, count: 8, stepDays: 28 });
    expect(cycleLengthDays(drifting)).toBe(30);
    expect(monthlyCost(drifting)).toBeCloseTo((21 * DAYS_PER_MONTH) / 30, 5);
  });

  it('يعود إلى وسيط الفروق حين لا تُصنَّف الدورة', () => {
    const odd = candidate({ description: 'ODD', amount: 50, count: 6, stepDays: 45 });
    expect(odd.periodicity.cycle).toBe('irregular');
    expect(cycleLengthDays(odd)).toBe(45);
  });

  it('الكلفة السنوية هي الشهرية × 12', () => {
    const monthly = candidate({ description: 'NETFLIX', amount: 56, count: 8, stepDays: 30 });
    expect(annualCost(monthly)).toBeCloseTo(monthlyCost(monthly) * MONTHS_PER_YEAR, 6);
  });
});

// ─── القرار ───────────────────────────────────────────────────────────────

describe('decide — قبول المرشّح أو استبعاده', () => {
  it('يقبل اشتراكاً نظيفاً فوق العتبة', () => {
    const decided = decide(candidate({ description: 'NETFLIX', amount: 56, count: 8, stepDays: 30 }));
    expect(decided.accepted).toBe(true);
    expect(decided.exclusion).toBeNull();
    expect(decided.candidate.confidence).toBeGreaterThanOrEqual(
      SUBSCRIPTION_CONFIDENCE_THRESHOLD,
    );
  });

  it('يستبعد ما دون العتبة بسبب معلن', () => {
    // بقالة أسبوعية: دورية تماماً لكن مبالغها فوضوية → بوابة المبلغ تُسقطها
    const groceries = analyzeGroup({
      merchant: 'PANDA',
      currency: 'SAR',
      transactions: [120, 340, 85, 260, 190, 310, 95].map((amount, index) => ({
        date: new Date(Date.UTC(2024, 0, 5 + index * 7)).toISOString().slice(0, 10),
        description: 'PANDA',
        amount,
        currency: 'SAR',
        direction: 'debit' as const,
      })),
    });

    const decided = decide(groceries);
    expect(decided.accepted).toBe(false);
    expect(decided.exclusion).toBe('below-threshold');
  });

  it('يستبعد الإيجار بفئته لا بثقته — ويبقيه معروضاً', () => {
    const rent = candidate({ description: 'ايجار شقه', amount: 3500, count: 10, stepDays: 30 });

    // الثقة عالية فعلاً: هو رسم دوري ثابت المبلغ، والمحرك محقّ رياضياً
    expect(rent.confidence).toBeGreaterThan(SUBSCRIPTION_CONFIDENCE_THRESHOLD);

    const decided = decide(rent);
    expect(decided.accepted).toBe(false);
    expect(decided.exclusion).toBe('non-subscription-category');
    expect(decided.category).toBe('rent');
  });

  it('تتقدّم الفئة على العتبة في تحديد سبب الاستبعاد', () => {
    // إيجار بعمليات قليلة: ثقته منخفضة **و** فئته مستبعَدة؛ يُنسب للفئة
    const weakRent = candidate({ description: 'ايجار', amount: 3500, count: 3, stepDays: 47 });
    expect(decide(weakRent).exclusion).toBe('non-subscription-category');
  });

  it('يحترم عتبة محقونة تخالف الافتراضية', () => {
    const weak = candidate({ description: 'SOMETHING', amount: 30, count: 3, stepDays: 30 });
    expect(decide(weak, 0).accepted).toBe(true);
    expect(decide(weak, 1.01).accepted).toBe(false);
  });
});

// ─── الملخّص ──────────────────────────────────────────────────────────────

describe('summarizeDecision — البطاقات العلوية', () => {
  const netflix = candidate({ description: 'NETFLIX', amount: 56, count: 10, stepDays: 30 });
  const spotify = candidate({ description: 'SPOTIFY', amount: 21, count: 10, stepDays: 30 });
  const rent = candidate({ description: 'ايجار شقه', amount: 3500, count: 10, stepDays: 30 });

  it('يجمع الكلفة الشهرية للمقبولين وحدهم', () => {
    const summary = summarizeDecision([netflix, spotify, rent]);

    expect(summary.count).toBe(2);
    expect(summary.totals).toHaveLength(1);
    expect(summary.totals[0]?.currency).toBe('SAR');
    expect(summary.totals[0]?.monthly).toBeCloseTo(
      monthlyCost(netflix) + monthlyCost(spotify),
      6,
    );
  });

  it('لا يُدخل الإيجار في المجموع لكنه يبقى معروضاً بفئته', () => {
    const summary = summarizeDecision([netflix, rent]);

    expect(summary.flaggedCategories).toHaveLength(1);
    expect(summary.flaggedCategories[0]?.category).toBe('rent');
    expect(summary.totals[0]?.monthly).toBeCloseTo(monthlyCost(netflix), 6);
  });

  it('يرتّب المقبولين بالكلفة الشهرية تنازلياً', () => {
    const summary = summarizeDecision([spotify, netflix]);
    expect(summary.accepted.map((item) => item.candidate.merchant)).toEqual(['NETFLIX', 'SPOTIFY']);
  });

  it('يفصل العملات ولا يجمعها في رقم واحد', () => {
    const dollars = candidate({
      description: 'ADOBE',
      amount: 30,
      count: 10,
      stepDays: 30,
      currency: 'USD',
    });
    const summary = summarizeDecision([netflix, dollars]);

    expect(summary.totals).toHaveLength(2);
    expect(summary.totals.map((total) => total.currency).sort()).toEqual(['SAR', 'USD']);
    // كل مجموع يخصّ عملته وحدها
    const sar = summary.totals.find((total) => total.currency === 'SAR');
    expect(sar?.monthly).toBeCloseTo(monthlyCost(netflix), 6);
  });

  it('الكلفة السنوية في المجاميع هي الشهرية × 12', () => {
    const summary = summarizeDecision([netflix, spotify]);
    expect(summary.totals[0]?.annual).toBeCloseTo(
      (summary.totals[0]?.monthly ?? 0) * MONTHS_PER_YEAR,
      6,
    );
  });

  it('يعيد ملخّصاً فارغاً بلا انهيار حين لا مرشّح', () => {
    const summary = summarizeDecision([]);
    expect(summary.count).toBe(0);
    expect(summary.totals).toEqual([]);
    expect(summary.accepted).toEqual([]);
  });
});
