import { describe, expect, it } from 'vitest';
import {
  AMOUNT_GATE_FULL_STABILITY,
  CONFIDENCE_COUNT_SATURATION,
  CONFIDENCE_WEIGHT_AMOUNT,
  CONFIDENCE_WEIGHT_COUNT,
  CONFIDENCE_WEIGHT_REGULARITY,
  LARGE_AMOUNT_CEILING,
  SMALL_AMOUNT_FLOOR,
  SUSPICION_WEIGHT_LONGEVITY,
  SUSPICION_WEIGHT_PATTERN,
  SUSPICION_WEIGHT_SMALLNESS,
  UNCLASSIFIED_CYCLE_FACTOR,
  analyzeGroup,
  computeConfidence,
  computeSuspicion,
  detectSubscriptions,
  groupByMerchant,
} from '../src/core/detectionEngine';
import type { SubscriptionCandidate } from '../src/core/detectionEngine';
import type { Direction, Transaction } from '../src/core/types';

// ─── مولّدات بيانات اصطناعية ──────────────────────────────────────────────

type StreamOptions = {
  /** الوصف الخام كما يكتبه البنك. */
  description: string;
  /** مبلغ كل عملية بترتيبها الزمني. */
  amounts: readonly number[];
  /** تاريخ أول عملية. */
  start?: string;
  /** الفاصل بالأيام بين كل عمليتين. */
  stepDays?: number;
  currency?: string;
  direction?: Direction;
};

/** يبني سلسلة عمليات لتاجر واحد بإيقاع ثابت. */
function stream(options: StreamOptions): Transaction[] {
  const {
    description,
    amounts,
    start = '2024-01-01',
    stepDays = 30,
    currency = 'SAR',
    direction = 'debit',
  } = options;

  const [year, month, day] = start.split('-').map(Number) as [number, number, number];

  return amounts.map((amount, index) => ({
    date: new Date(Date.UTC(year, month - 1, day + index * stepDays)).toISOString().slice(0, 10),
    description,
    amount,
    currency,
    direction,
  }));
}

/** مبلغ ثابت مكرّر. */
function repeat(amount: number, times: number): number[] {
  return Array.from({ length: times }, () => amount);
}

/** مبالغ متغيّرة تماماً، تدور على نفس القيم — نمط البقالة. */
function chaotic(times: number): number[] {
  const cycle = [120, 340, 85, 260, 190];
  return Array.from({ length: times }, (_, index) => cycle[index % cycle.length] as number);
}

/** يبحث عن مرشّح باسم تاجره. */
function find(candidates: readonly SubscriptionCandidate[], merchant: string): SubscriptionCandidate {
  const found = candidates.find((candidate) => candidate.merchant === merchant);
  if (found === undefined) throw new Error(`لم يُكشف التاجر ${merchant}`);
  return found;
}

// ─── درجة الثقة ───────────────────────────────────────────────────────────

describe('computeConfidence — الصيغة والأوزان', () => {
  it('الأوزان الثلاثة مجموعها 1', () => {
    expect(
      CONFIDENCE_WEIGHT_REGULARITY + CONFIDENCE_WEIGHT_AMOUNT + CONFIDENCE_WEIGHT_COUNT,
    ).toBeCloseTo(1, 10);
  });

  it('اشتراك مثالي يبلغ الدرجة القصوى', () => {
    expect(
      computeConfidence({
        regularity: 1,
        amountStability: 1,
        occurrences: 8,
        cycleRecognized: true,
      }),
    ).toBe(1);
  });

  it('انعدام كل العوامل يعطي صفراً', () => {
    expect(
      computeConfidence({
        regularity: 0,
        amountStability: 0,
        occurrences: 0,
        cycleRecognized: false,
      }),
    ).toBe(0);
  });

  it('كل عامل يساهم بوزنه المعلن', () => {
    // انتظام وحده (مع فتح بوابة المبلغ بثبات تام) — الفرق هو وزن الانتظام
    const withRegularity = computeConfidence({
      regularity: 1,
      amountStability: 1,
      occurrences: CONFIDENCE_COUNT_SATURATION,
      cycleRecognized: true,
    });
    const withoutRegularity = computeConfidence({
      regularity: 0,
      amountStability: 1,
      occurrences: CONFIDENCE_COUNT_SATURATION,
      cycleRecognized: true,
    });

    expect(withRegularity - withoutRegularity).toBeCloseTo(CONFIDENCE_WEIGHT_REGULARITY, 10);
  });

  it('عامل العدد يشبع عند ست عمليات ويعطي ربعاً عند ثلاث', () => {
    const base = { regularity: 1, amountStability: 1, cycleRecognized: true };

    const three = computeConfidence({ ...base, occurrences: 3 });
    const four = computeConfidence({ ...base, occurrences: 4 });
    const six = computeConfidence({ ...base, occurrences: 6 });
    const twenty = computeConfidence({ ...base, occurrences: 20 });

    expect(three).toBeCloseTo(0.85, 10); // 0.45 + 0.35 + 0.20×0.25
    expect(four).toBeCloseTo(0.9, 10); // 0.45 + 0.35 + 0.20×0.50
    expect(six).toBeCloseTo(1, 10);
    expect(twenty).toBe(six); // الإشباع: ما بعد الست لا يضيف
  });

  it('بوابة الدورة تنصّف الثقة حين لا تقع في مدى معروف', () => {
    const input = {
      regularity: 1,
      amountStability: 1,
      occurrences: 8,
    };

    const recognized = computeConfidence({ ...input, cycleRecognized: true });
    const unrecognized = computeConfidence({ ...input, cycleRecognized: false });

    expect(unrecognized).toBeCloseTo(recognized * UNCLASSIFIED_CYCLE_FACTOR, 10);
  });

  it('بوابة المبلغ تُسقط النمط المنتظم بمبالغ فوضوية إلى الصفر', () => {
    // بقالة أسبوعية منتظمة تماماً: لولا البوابة لحصلت على 0.65
    expect(
      computeConfidence({
        regularity: 1,
        amountStability: 0,
        occurrences: 20,
        cycleRecognized: true,
      }),
    ).toBe(0);
  });

  it('بوابة المبلغ مفتوحة تماماً فوق حدّها فلا تعاقب الثبات الجزئي مرتين', () => {
    const atGate = computeConfidence({
      regularity: 1,
      amountStability: AMOUNT_GATE_FULL_STABILITY,
      occurrences: 8,
      cycleRecognized: true,
    });

    // 0.45 + 0.35×0.5 + 0.20 = 0.825 بلا أي خفض إضافي
    expect(atGate).toBeCloseTo(0.825, 10);
  });

  it('تحت حدّ البوابة يهبط السقف تدريجياً لا فجأة', () => {
    const base = { regularity: 1, occurrences: 8, cycleRecognized: true };

    const half = computeConfidence({ ...base, amountStability: 0.25 });
    const full = computeConfidence({ ...base, amountStability: 0.5 });

    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(full);
  });

  it('انهيار الانتظام لا يُسقط الاشتراك تماماً (المبلغ ما زال ثابتاً)', () => {
    const score = computeConfidence({
      regularity: 0,
      amountStability: 1,
      occurrences: 8,
      cycleRecognized: true,
    });

    expect(score).toBeCloseTo(0.55, 10); // 0.35 + 0.20
  });

  it('الدرجة محصورة دائماً بين 0 و1 حتى مع مدخلات خارج المجال', () => {
    const score = computeConfidence({
      regularity: 5,
      amountStability: 9,
      occurrences: 1000,
      cycleRecognized: true,
    });

    expect(score).toBe(1);
  });
});

// ─── درجة الاشتباه ────────────────────────────────────────────────────────

describe('computeSuspicion — ترتيب ما يُرجَّح نسيانه', () => {
  it('الأوزان الثلاثة مجموعها 1', () => {
    expect(
      SUSPICION_WEIGHT_LONGEVITY + SUSPICION_WEIGHT_SMALLNESS + SUSPICION_WEIGHT_PATTERN,
    ).toBeCloseTo(1, 10);
  });

  it('الصغير القديم الثابت يبلغ القمة', () => {
    expect(computeSuspicion({ spanDays: 730, typicalAmount: 15, confidence: 1 })).toBe(1);
  });

  it('الكبير الجديد المتقلّب يبلغ القاع', () => {
    expect(computeSuspicion({ spanDays: 0, typicalAmount: 900, confidence: 0 })).toBe(0);
  });

  it('الأقدم أعلى شكاً عند تساوي ما عداه', () => {
    const old = computeSuspicion({ spanDays: 700, typicalAmount: 56, confidence: 1 });
    const recent = computeSuspicion({ spanDays: 90, typicalAmount: 56, confidence: 1 });

    expect(old).toBeGreaterThan(recent);
  });

  it('الأصغر مبلغاً أعلى شكاً عند تساوي ما عداه', () => {
    const small = computeSuspicion({ spanDays: 400, typicalAmount: 19, confidence: 1 });
    const large = computeSuspicion({ spanDays: 400, typicalAmount: 850, confidence: 1 });

    expect(small).toBeGreaterThan(large);
  });

  it('أثبت نمطاً أعلى شكاً عند تساوي ما عداه', () => {
    const steady = computeSuspicion({ spanDays: 400, typicalAmount: 56, confidence: 1 });
    const shaky = computeSuspicion({ spanDays: 400, typicalAmount: 56, confidence: 0.2 });

    expect(steady).toBeGreaterThan(shaky);
  });

  it('عامل الاستمرار يشبع عند سنة', () => {
    const year = computeSuspicion({ spanDays: 365, typicalAmount: 56, confidence: 0 });
    const decade = computeSuspicion({ spanDays: 3650, typicalAmount: 56, confidence: 0 });

    expect(decade).toBe(year);
  });

  it('نافذة المبلغ: تحت الأرضية كلها شكّ، وفوق السقف لا شيء', () => {
    const base = { spanDays: 0, confidence: 0 };

    expect(computeSuspicion({ ...base, typicalAmount: SMALL_AMOUNT_FLOOR })).toBeCloseTo(
      SUSPICION_WEIGHT_SMALLNESS,
      10,
    );
    expect(computeSuspicion({ ...base, typicalAmount: 5 })).toBeCloseTo(
      SUSPICION_WEIGHT_SMALLNESS,
      10,
    );
    expect(computeSuspicion({ ...base, typicalAmount: LARGE_AMOUNT_CEILING })).toBe(0);
    expect(computeSuspicion({ ...base, typicalAmount: 5000 })).toBe(0);
  });

  it('تدرّج المبلغ لوغاريتمي: الفرق في الصغائر أثقل منه في الكبائر', () => {
    const base = { spanDays: 0, confidence: 0 };

    const smallGap =
      computeSuspicion({ ...base, typicalAmount: 25 }) -
      computeSuspicion({ ...base, typicalAmount: 50 });
    const largeGap =
      computeSuspicion({ ...base, typicalAmount: 225 }) -
      computeSuspicion({ ...base, typicalAmount: 250 });

    expect(smallGap).toBeGreaterThan(largeGap);
  });
});

// ─── التجميع ──────────────────────────────────────────────────────────────

describe('groupByMerchant — التجميع قبل التحليل', () => {
  it('يضمّ أشكال الوصف المختلفة لنفس التاجر في مجموعة واحدة', () => {
    const groups = groupByMerchant([
      ...stream({ description: 'POS NETFLIX.COM*4423', amounts: repeat(56, 2) }),
      ...stream({ description: 'NETFLIX.COM AMSTERDAM NL', amounts: repeat(56, 2), start: '2024-05-01' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.merchant).toBe('NETFLIX');
    expect(groups[0]?.transactions).toHaveLength(4);
  });

  it('يرتّب عمليات كل مجموعة زمنياً', () => {
    const transactions = stream({ description: 'NETFLIX', amounts: repeat(56, 4) });
    const groups = groupByMerchant([...transactions].reverse());

    expect(groups[0]?.transactions.map((item) => item.date)).toEqual(
      transactions.map((item) => item.date),
    );
  });

  it('يستبعد الإيداعات افتراضياً', () => {
    const groups = groupByMerchant([
      ...stream({ description: 'NETFLIX', amounts: repeat(56, 3) }),
      ...stream({ description: 'SALARY', amounts: repeat(9000, 3), direction: 'credit' }),
    ]);

    expect(groups.map((group) => group.merchant)).toEqual(['NETFLIX']);
  });

  it('يشمل الإيداعات عند الطلب الصريح', () => {
    const groups = groupByMerchant(
      [
        ...stream({ description: 'NETFLIX', amounts: repeat(56, 3) }),
        ...stream({ description: 'SALARY', amounts: repeat(9000, 3), direction: 'credit' }),
      ],
      { includeCredits: true },
    );

    expect(groups.map((group) => group.merchant).sort()).toEqual(['NETFLIX', 'SALARY']);
  });

  it('يفصل نفس التاجر بعملتين مختلفتين — خلطهما يفسد قياس المبلغ', () => {
    const groups = groupByMerchant([
      ...stream({ description: 'NETFLIX', amounts: repeat(56, 3) }),
      ...stream({ description: 'NETFLIX', amounts: repeat(15, 3), currency: 'USD' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.currency).sort()).toEqual(['SAR', 'USD']);
  });

  it('يحترم عتبة التشابه الممرَّرة', () => {
    const transactions = [
      ...stream({ description: 'STARBUCKS RIYADH', amounts: repeat(18, 3) }),
      ...stream({ description: 'STARBUCK RIYADH', amounts: repeat(18, 3), start: '2024-06-01' }),
    ];

    expect(groupByMerchant(transactions)).toHaveLength(1);
    expect(groupByMerchant(transactions, { similarityThreshold: 0.99 })).toHaveLength(2);
  });

  it('بلا عمليات يعطي بلا مجموعات', () => {
    expect(groupByMerchant([])).toEqual([]);
  });
});

// ─── التكامل ──────────────────────────────────────────────────────────────

describe('detectSubscriptions — الكشف الكامل', () => {
  it('يكشف اشتراكاً شهرياً ثابتاً بثقة قصوى', () => {
    const { candidates } = detectSubscriptions(
      stream({ description: 'NETFLIX', amounts: repeat(56, 12) }),
    );

    const netflix = find(candidates, 'NETFLIX');
    expect(netflix.periodicity.cycle).toBe('monthly');
    expect(netflix.amountStability.kind).toBe('fixed');
    expect(netflix.typicalAmount).toBe(56);
    expect(netflix.occurrences).toBe(12);
    expect(netflix.confidence).toBe(1);
    expect(netflix.flags).toEqual([]);
  });

  it('يحفظ العمليات الأصلية ومدى المجموعة الزمني', () => {
    const transactions = stream({ description: 'SPOTIFY', amounts: repeat(21.99, 6) });
    const { candidates } = detectSubscriptions(transactions);
    const spotify = find(candidates, 'SPOTIFY');

    expect(spotify.transactions).toHaveLength(6);
    expect(spotify.firstDate).toBe(transactions[0]?.date);
    expect(spotify.lastDate).toBe(transactions[5]?.date);
    expect(spotify.spanDays).toBe(150);
  });

  it('يخفض ثقة الدورة غير المصنّفة ويضع وسمها', () => {
    const { candidates } = detectSubscriptions(
      stream({ description: 'ODDPAY', amounts: repeat(56, 8), stepDays: 45 }),
    );

    const odd = find(candidates, 'ODDPAY');
    expect(odd.periodicity.cycle).toBe('irregular');
    expect(odd.flags).toContain('unclassified-cycle');
    expect(odd.confidence).toBeCloseTo(UNCLASSIFIED_CYCLE_FACTOR, 10);
  });

  it('يعطي نتيجة حتمية لا تتأثّر بترتيب المدخلات', () => {
    const transactions = [
      ...stream({ description: 'NETFLIX', amounts: repeat(56, 6) }),
      ...stream({ description: 'SPOTIFY', amounts: repeat(21.99, 6) }),
    ];

    const forward = detectSubscriptions(transactions);
    const backward = detectSubscriptions([...transactions].reverse());

    expect(backward).toEqual(forward);
  });

  it('كشف حساب فارغ يعطي تقريراً فارغاً', () => {
    expect(detectSubscriptions([])).toEqual({ candidates: [], skipped: [] });
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * المتطلب الحرج مكرّراً على مستوى المحرك الكامل، لا على الدورية وحدها.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('المحرك الكامل يكشف اشتراك الـ28 يوماً المنزلق عبر الشهور', () => {
  const SLIDING = stream({ description: 'NETFLIX', amounts: repeat(56, 10), stepDays: 28 });

  it('يكشفه شهرياً بثقة قصوى رغم انزلاق تاريخ الخصم', () => {
    const netflix = find(detectSubscriptions(SLIDING).candidates, 'NETFLIX');

    expect(netflix.periodicity.medianGap).toBe(28);
    expect(netflix.periodicity.cycle).toBe('monthly');
    expect(netflix.periodicity.regularity).toBe(1);
    expect(netflix.confidence).toBe(1);
  });

  it('السلسلة تنزلق فعلاً: عشرة خصوم في عشرة أرقام أيام مختلفة', () => {
    const days = new Set(SLIDING.map((transaction) => Number(transaction.date.slice(8, 10))));

    expect(days.size).toBe(10);
  });

  it('يُكشف بنفس قوة اشتراك يخصم في نفس اليوم من كل شهر', () => {
    const sliding = find(detectSubscriptions(SLIDING).candidates, 'NETFLIX');
    const calendar = find(
      detectSubscriptions(stream({ description: 'NETFLIX', amounts: repeat(56, 10), stepDays: 30 }))
        .candidates,
      'NETFLIX',
    );

    expect(sliding.confidence).toBeGreaterThanOrEqual(calendar.confidence);
    expect(sliding.periodicity.cycle).toBe(calendar.periodicity.cycle);
  });
});

describe('التكامل — زيادة السعر والتجربة المجانية', () => {
  it('يكشف زيادة السعر ويضع وسمها ويعرض السعر الحالي', () => {
    const transactions = stream({
      description: 'SPOTIFY',
      amounts: [...repeat(21.99, 5), ...repeat(27.99, 5)],
    });

    const spotify = find(detectSubscriptions(transactions).candidates, 'SPOTIFY');

    expect(spotify.flags).toContain('price-increase');
    expect(spotify.priceChange?.steps).toHaveLength(1);
    expect(spotify.priceChange?.steps[0]?.changeRatio).toBeCloseTo((27.99 - 21.99) / 21.99, 6);
    expect(spotify.priceChange?.steps[0]?.effectiveDate).toBe(transactions[5]?.date);
    expect(spotify.typicalAmount).toBe(27.99);
  });

  it('زيادة السعر لا تُسقط الاشتراك من النتائج — تُنصفه', () => {
    const withHike = find(
      detectSubscriptions(
        stream({ description: 'SPOTIFY', amounts: [...repeat(21.99, 5), ...repeat(27.99, 5)] }),
      ).candidates,
      'SPOTIFY',
    );

    expect(withHike.amountStability.kind).toBe('variable'); // القياس الخام يراها متذبذبة
    expect(withHike.effectiveStability.basis).toBe('price-levels');
    expect(withHike.confidence).toBe(1); // والقياس داخل المستويات ينصفها
  });

  it('يكشف زيادة بثلاثة مستويات', () => {
    const gym = find(
      detectSubscriptions(
        stream({
          description: 'GYM',
          amounts: [...repeat(150, 4), ...repeat(180, 4), ...repeat(220, 4)],
        }),
      ).candidates,
      'GYM',
    );

    expect(gym.priceChange?.levels.map((level) => level.amount)).toEqual([150, 180, 220]);
    expect(gym.priceChange?.steps).toHaveLength(2);
    expect(gym.typicalAmount).toBe(220);
  });

  it('يكشف تحوّل التجربة المجانية ويضع وسمها', () => {
    const transactions = stream({ description: 'SHAHID', amounts: [0, ...repeat(29, 6)] });
    const shahid = find(detectSubscriptions(transactions).candidates, 'SHAHID');

    expect(shahid.flags).toContain('free-trial-converted');
    expect(shahid.freeTrial?.initialAmount).toBe(0);
    expect(shahid.freeTrial?.settledAmount).toBe(29);
    expect(shahid.freeTrial?.convertedDate).toBe(transactions[1]?.date);
  });

  it('رسم التجربة لا يُحسب سعراً ولا يفتعل زيادة وهمية', () => {
    const shahid = find(
      detectSubscriptions(stream({ description: 'SHAHID', amounts: [0, ...repeat(29, 6)] }))
        .candidates,
      'SHAHID',
    );

    expect(shahid.priceChange).toBeNull();
    expect(shahid.typicalAmount).toBe(29);
    expect(shahid.confidence).toBe(1);
  });

  it('يكشف التجربة الرمزية (أقل من ربع السعر اللاحق)', () => {
    const candidate = find(
      detectSubscriptions(stream({ description: 'ANGHAMI', amounts: [1, ...repeat(19, 6)] }))
        .candidates,
      'ANGHAMI',
    );

    expect(candidate.flags).toContain('free-trial-converted');
    expect(candidate.freeTrial?.ratio).toBeCloseTo(1 / 19, 6);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * حالات حدية **معروفة ومعلنة** — لا تُعدّ فشلاً كاملاً إن لم تُستبعد تماماً.
 *
 * - **الإيجار الثابت:** يجب أن يحصل على ثقة عالية، وهذا صحيح رياضياً: هو رسم
 *   دوري بمبلغ ثابت. لا يملك محرك الجزء 2 أي إشارة تفصل "رسم دوري" عن
 *   "اشتراك برمجي". ما يخفّفه هنا — ولا يحلّه — هو درجة الاشتباه. الحلّ
 *   الكامل (عتبة مبلغ أو قائمة فئات) قرار مرحلة التقييم في الجزء 3،
 *   وموثّق صراحةً في رأس `detectionEngine.ts`.
 * - **البقالة المتغيّرة:** هذه يجب أن تُستبعد فعلاً، وباختبار ثبات المبلغ
 *   وحده بلا أي قاعدة خاصة بها.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('حالات حدية معروفة — الإيجار الثابت والبقالة المتغيّرة', () => {
  const RENT = stream({ description: 'RENT', amounts: repeat(3500, 12) });
  const GROCERY = stream({ description: 'CARREFOUR', amounts: chaotic(20), stepDays: 7 });
  const SUBSCRIPTION = stream({ description: 'NETFLIX', amounts: repeat(19, 12) });

  it('الإيجار يُصنَّف دورياً ثابتاً بثقة عالية — حدّ معروف لا خطأ', () => {
    const rent = find(detectSubscriptions(RENT).candidates, 'RENT');

    expect(rent.periodicity.cycle).toBe('monthly');
    expect(rent.amountStability.kind).toBe('fixed');
    expect(rent.confidence).toBe(1);
  });

  it('درجة الاشتباه تخفّف الإيجار جزئياً: يهبط تحت اشتراك صغير بنفس العمر', () => {
    const { candidates } = detectSubscriptions([...RENT, ...SUBSCRIPTION]);

    const rent = find(candidates, 'RENT');
    const subscription = find(candidates, 'NETFLIX');

    // نفس الثقة تماماً — الفرق كله من صغر المبلغ
    expect(rent.confidence).toBe(subscription.confidence);
    expect(subscription.suspicion).toBeGreaterThan(rent.suspicion);
    expect(candidates.indexOf(subscription)).toBeLessThan(candidates.indexOf(rent));
  });

  it('البقالة الأسبوعية تسقط باختبار ثبات المبلغ وحده', () => {
    const grocery = find(detectSubscriptions(GROCERY).candidates, 'CARREFOUR');

    // دوريتها سليمة تماماً — لو كان الانتظام وحده معياراً لمرّت
    expect(grocery.periodicity.cycle).toBe('weekly');
    expect(grocery.periodicity.regularity).toBe(1);

    // لكن مبلغها ليس سعراً
    expect(grocery.amountStability.kind).toBe('variable');
    expect(grocery.effectiveStability.score).toBe(0);
    expect(grocery.flags).toContain('variable-amount');
    expect(grocery.confidence).toBe(0);
  });

  it('البقالة تأتي بعد الاشتراك الحقيقي في الترتيب', () => {
    const { candidates } = detectSubscriptions([...GROCERY, ...SUBSCRIPTION]);

    const grocery = find(candidates, 'CARREFOUR');
    const subscription = find(candidates, 'NETFLIX');

    expect(candidates.indexOf(subscription)).toBeLessThan(candidates.indexOf(grocery));
  });
});

// ─── الحالات الحدية ───────────────────────────────────────────────────────

describe('الحالات الحدية — مجموعات لا تكفي عملياتها', () => {
  it('مجموعة بعمليتين تُستبعد مع سبب مقروء', () => {
    const { candidates, skipped } = detectSubscriptions(
      stream({ description: 'NETFLIX', amounts: repeat(56, 2) }),
    );

    expect(candidates).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.merchant).toBe('NETFLIX');
    expect(skipped[0]?.occurrences).toBe(2);
    expect(skipped[0]?.reason).toMatch(/أقل من 3/);
  });

  it('عملية واحدة يتيمة تُستبعد', () => {
    const { candidates, skipped } = detectSubscriptions(
      stream({ description: 'AMAZON', amounts: [199] }),
    );

    expect(candidates).toEqual([]);
    expect(skipped[0]?.occurrences).toBe(1);
  });

  it('ثلاث عمليات هي أول عدد يُحلَّل', () => {
    const { candidates, skipped } = detectSubscriptions(
      stream({ description: 'NETFLIX', amounts: repeat(56, 3) }),
    );

    expect(skipped).toEqual([]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.periodicity.hasEnoughData).toBe(true);
  });

  it('يفصل القليل عن الكثير في نفس الكشف', () => {
    const { candidates, skipped } = detectSubscriptions([
      ...stream({ description: 'NETFLIX', amounts: repeat(56, 6) }),
      ...stream({ description: 'AMAZON', amounts: [199, 45] }),
      ...stream({ description: 'IKEA', amounts: [850] }),
    ]);

    expect(candidates.map((candidate) => candidate.merchant)).toEqual(['NETFLIX']);
    expect(skipped.map((group) => group.merchant).sort()).toEqual(['AMAZON', 'IKEA']);
  });

  it('يمكن رفع الحد الأدنى أو خفضه', () => {
    const transactions = stream({ description: 'NETFLIX', amounts: repeat(56, 4) });

    expect(detectSubscriptions(transactions, { minOccurrences: 5 }).candidates).toEqual([]);
    expect(detectSubscriptions(transactions, { minOccurrences: 4 }).candidates).toHaveLength(1);
  });

  it('عمليات في نفس اليوم لا تُصنَّف دورية', () => {
    const sameDay = repeat(56, 4).map((amount) => ({
      date: '2024-03-01',
      description: 'NETFLIX',
      amount,
      currency: 'SAR',
      direction: 'debit' as Direction,
    }));

    const candidate = find(detectSubscriptions(sameDay).candidates, 'NETFLIX');

    expect(candidate.periodicity.medianGap).toBe(0);
    expect(candidate.periodicity.cycle).toBe('irregular');
    expect(candidate.spanDays).toBe(0);
    expect(candidate.flags).toContain('unclassified-cycle');
  });

  it('analyzeGroup يعمل على مجموعة بعملية واحدة بلا انهيار', () => {
    const candidate = analyzeGroup({
      merchant: 'IKEA',
      currency: 'SAR',
      transactions: stream({ description: 'IKEA', amounts: [850] }),
    });

    expect(candidate.occurrences).toBe(1);
    expect(candidate.spanDays).toBe(0);
    expect(candidate.periodicity.hasEnoughData).toBe(false);
    expect(candidate.confidence).toBe(0);
  });
});
