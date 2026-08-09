import { describe, expect, it } from 'vitest';
import {
  FREE_TRIAL_MAX_RATIO,
  NEAR_FIXED_MAX_SPREAD,
  PRICE_LEVEL_TOLERANCE,
  analyzeAmountStability,
  detectFreeTrialConversion,
  detectPriceChange,
  effectiveAmountStability,
  segmentByPriceLevel,
} from '../src/core/amountAnalysis';
import type { AmountPoint } from '../src/core/amountAnalysis';

/**
 * يبني سلسلة عمليات شهرية (كل 30 يوماً) بالمبالغ المعطاة بترتيبها.
 * التواريخ هنا مجرد ناقل للترتيب الزمني — تحليل المبالغ لا يهمّه الإيقاع.
 */
function points(amounts: readonly number[], start = '2024-01-01', stepDays = 30): AmountPoint[] {
  const [year, month, day] = start.split('-').map(Number) as [number, number, number];
  return amounts.map((amount, index) => ({
    date: new Date(Date.UTC(year, month - 1, day + index * stepDays)).toISOString().slice(0, 10),
    amount,
  }));
}

describe('analyzeAmountStability — ثبات المبلغ', () => {
  it('مبالغ ثابتة تماماً', () => {
    const result = analyzeAmountStability([56, 56, 56, 56]);

    expect(result.kind).toBe('fixed');
    expect(result.label).toBe('ثابت');
    expect(result.spread).toBe(0);
    expect(result.score).toBe(1);
    expect(result.median).toBe(56);
  });

  it('مبالغ شبه ثابتة (فروق ضريبة وتقريب)', () => {
    const result = analyzeAmountStability([56, 57.5, 56, 56.25]);

    expect(result.kind).toBe('near-fixed');
    expect(result.label).toBe('شبه ثابت');
    expect(result.spread).toBeGreaterThan(0);
    expect(result.spread).toBeLessThanOrEqual(NEAR_FIXED_MAX_SPREAD);
    expect(result.score).toBeGreaterThan(0.9);
  });

  it('مبالغ متذبذبة تماماً (بقالة أسبوعية) تنهار درجتها', () => {
    const result = analyzeAmountStability([120, 340, 85, 260, 190]);

    expect(result.kind).toBe('variable');
    expect(result.label).toBe('متذبذب');
    expect(result.spread).toBeGreaterThan(0.3);
    expect(result.score).toBe(0);
  });

  it('التذبذب المتوسط يعطي درجة متوسطة لا صفراً', () => {
    const result = analyzeAmountStability([50, 60, 70]);

    expect(result.kind).toBe('variable');
    expect(result.score).toBeGreaterThan(0.4);
    expect(result.score).toBeLessThan(0.8);
  });

  it('يرتّب الدرجات ترتيباً منطقياً: ثابت > شبه ثابت > متذبذب', () => {
    const fixed = analyzeAmountStability([56, 56, 56]).score;
    const nearFixed = analyzeAmountStability([56, 58, 56]).score;
    const variable = analyzeAmountStability([56, 120, 20]).score;

    expect(fixed).toBeGreaterThan(nearFixed);
    expect(nearFixed).toBeGreaterThan(variable);
  });

  it('يحسب الوسيط والمتوسط والحدّين', () => {
    const result = analyzeAmountStability([10, 20, 90]);

    expect(result.median).toBe(20);
    expect(result.mean).toBe(40);
    expect(result.min).toBe(10);
    expect(result.max).toBe(90);
    expect(result.count).toBe(3);
  });

  it('لا يتأثّر بترتيب المدخلات', () => {
    expect(analyzeAmountStability([56, 70, 56])).toEqual(analyzeAmountStability([70, 56, 56]));
  });

  it('قائمة فارغة تعطي درجة صفر بلا انهيار', () => {
    const result = analyzeAmountStability([]);

    expect(result.count).toBe(0);
    expect(result.score).toBe(0);
    expect(result.kind).toBe('variable');
  });
});

describe('segmentByPriceLevel — التقطيع الزمني إلى مستويات', () => {
  it('يفصل مستويين متجاورين زمنياً', () => {
    const segments = segmentByPriceLevel(points([56, 56, 70, 70]));

    expect(segments).toHaveLength(2);
    expect(segments[0]?.map((point) => point.amount)).toEqual([56, 56]);
    expect(segments[1]?.map((point) => point.amount)).toEqual([70, 70]);
  });

  it('التذبذب ينتج مقطعاً لكل عملية', () => {
    expect(segmentByPriceLevel(points([56, 70, 56, 70]))).toHaveLength(4);
  });

  it('مبالغ متطابقة تبقى مقطعاً واحداً', () => {
    expect(segmentByPriceLevel(points([56, 56, 56, 56]))).toHaveLength(1);
  });

  it('الفرق داخل هامش المستوى لا يفتح مقطعاً جديداً', () => {
    // 2 على 58 ≈ 3.4% — أقل من الهامش
    expect(PRICE_LEVEL_TOLERANCE).toBe(0.05);
    expect(segmentByPriceLevel(points([56, 58, 56]))).toHaveLength(1);
  });

  it('الفرق فوق الهامش يفتح مقطعاً جديداً', () => {
    // 4 على 60 ≈ 6.7% — فوق الهامش
    expect(segmentByPriceLevel(points([56, 60]))).toHaveLength(2);
  });

  it('يرتّب زمنياً قبل التقطيع', () => {
    const shuffled = [...points([56, 56, 70, 70])].reverse();

    expect(segmentByPriceLevel(shuffled).map((segment) => segment.length)).toEqual([2, 2]);
  });

  it('قائمة فارغة تعطي صفر مقاطع', () => {
    expect(segmentByPriceLevel([])).toEqual([]);
  });
});

describe('detectPriceChange — كشف زيادة السعر', () => {
  it('يكشف زيادة بمستويين ويخرج النسبة والتاريخ التقريبي', () => {
    const entries = points([56, 56, 56, 56, 70, 70, 70]);
    const change = detectPriceChange(entries);

    expect(change).not.toBeNull();
    expect(change?.levels).toHaveLength(2);
    expect(change?.steps).toHaveLength(1);
    expect(change?.direction).toBe('increase');
    expect(change?.hasIncrease).toBe(true);

    const [step] = change?.steps ?? [];
    expect(step?.from).toBe(56);
    expect(step?.to).toBe(70);
    expect(step?.changeRatio).toBeCloseTo(0.25, 6);
    // الزيادة وقعت بين آخر خصم قديم وأول خصم جديد
    expect(step?.previousDate).toBe(entries[3]?.date);
    expect(step?.effectiveDate).toBe(entries[4]?.date);
  });

  it('يكشف زيادة بثلاثة مستويات ويجمع النسبة الكلية', () => {
    const change = detectPriceChange(points([39, 39, 39, 45, 45, 45, 56, 56, 56]));

    expect(change?.levels.map((level) => level.amount)).toEqual([39, 45, 56]);
    expect(change?.steps).toHaveLength(2);
    expect(change?.direction).toBe('increase');
    expect(change?.totalChangeRatio).toBeCloseTo((56 - 39) / 39, 6);
  });

  it('يعدّ عمليات كل مستوى ويحدّد بدايته ونهايته', () => {
    const entries = points([56, 56, 56, 70, 70]);
    const change = detectPriceChange(entries);

    expect(change?.levels[0]?.count).toBe(3);
    expect(change?.levels[0]?.firstDate).toBe(entries[0]?.date);
    expect(change?.levels[0]?.lastDate).toBe(entries[2]?.date);
    expect(change?.levels[1]?.count).toBe(2);
  });

  it('يكشف زيادة وقعت للتوّ ولو بخصم واحد بالسعر الجديد', () => {
    const change = detectPriceChange(points([56, 56, 56, 56, 70]));

    expect(change?.direction).toBe('increase');
    expect(change?.levels[1]?.count).toBe(1);
  });

  it('يكشف الانخفاض ويميّزه عن الزيادة', () => {
    const change = detectPriceChange(points([70, 70, 70, 56, 56]));

    expect(change?.direction).toBe('decrease');
    expect(change?.hasIncrease).toBe(false);
    expect(change?.steps[0]?.changeRatio).toBeCloseTo(-0.2, 6);
  });

  it('يكشف الصعود ثم الهبوط إلى سعر ثالث كـ mixed', () => {
    const change = detectPriceChange(points([40, 40, 70, 70, 55, 55]));

    expect(change?.direction).toBe('mixed');
    expect(change?.hasIncrease).toBe(true);
  });

  it('يرفض التذبذب: السعر عاد إلى قيمته القديمة', () => {
    expect(detectPriceChange(points([56, 56, 70, 70, 56, 56]))).toBeNull();
  });

  it('يرفض التناوب بين سعرين', () => {
    expect(detectPriceChange(points([56, 70, 56, 70, 56, 70]))).toBeNull();
  });

  it('يرفض المبالغ الثابتة (لا مستويات أصلاً)', () => {
    expect(detectPriceChange(points([56, 56, 56, 56]))).toBeNull();
  });

  it('يرفض البقالة المتغيّرة: كل مبلغ مستوى بذاته ليس زيادة سعر', () => {
    expect(detectPriceChange(points([120, 340, 85, 260, 190]))).toBeNull();
  });

  it('يرفض الارتفاع التدريجي بلا مستوى مستقرّ', () => {
    expect(detectPriceChange(points([56, 60, 65, 70, 75, 80]))).toBeNull();
  });

  it('يرفض عمليتين فقط: لا سعر ساد قبل التغيّر', () => {
    expect(detectPriceChange(points([56, 70]))).toBeNull();
  });

  it('يقبل أصغر حالة معقولة: سعر ساد مرتين ثم تغيّر', () => {
    expect(detectPriceChange(points([56, 56, 70]))?.direction).toBe('increase');
  });

  it('يرفض المبالغ الصفرية كمستوى سعر', () => {
    expect(detectPriceChange(points([0, 0, 56, 56]))).toBeNull();
  });

  it('لا يتأثّر بترتيب المدخلات', () => {
    const ordered = detectPriceChange(points([56, 56, 56, 70, 70]));
    const shuffled = detectPriceChange([...points([56, 56, 56, 70, 70])].reverse());

    expect(shuffled).toEqual(ordered);
  });
});

describe('detectFreeTrialConversion — تحوّل التجربة المجانية', () => {
  it('يكشف التجربة المجانية الكاملة: أول رسم صفر', () => {
    const entries = points([0, 56, 56, 56]);
    const trial = detectFreeTrialConversion(entries);

    expect(trial).not.toBeNull();
    expect(trial?.initialAmount).toBe(0);
    expect(trial?.ratio).toBe(0);
    expect(trial?.settledAmount).toBe(56);
    expect(trial?.initialDate).toBe(entries[0]?.date);
    expect(trial?.convertedDate).toBe(entries[1]?.date);
  });

  it('يكشف الرسم الرمزي: أقل من 25% من السعر اللاحق', () => {
    const trial = detectFreeTrialConversion(points([5, 56, 56, 56]));

    expect(trial?.ratio).toBeCloseTo(5 / 56, 6);
    expect(trial?.settledAmount).toBe(56);
  });

  it('حدّ الـ 25% حدّ صارم: عنده لا كشف، وتحته كشف', () => {
    expect(FREE_TRIAL_MAX_RATIO).toBe(0.25);
    expect(detectFreeTrialConversion(points([14, 56, 56, 56]))).toBeNull();
    expect(detectFreeTrialConversion(points([13.9, 56, 56, 56]))).not.toBeNull();
  });

  it('لا يعتبر الخصم الترحيبي العادي تجربة مجانية', () => {
    expect(detectFreeTrialConversion(points([50, 56, 56, 56]))).toBeNull();
  });

  it('لا يعتبر أرخص عملية عند تاجر متقلّب المبالغ تجربة مجانية', () => {
    // الرسوم اللاحقة فوضوية تماماً — لا "سعر مستقرّ" ليُقاس عليه
    expect(detectFreeTrialConversion(points([15, 120, 340, 260]))).toBeNull();
  });

  it('يقبل تذبذباً طفيفاً في الرسوم اللاحقة', () => {
    expect(detectFreeTrialConversion(points([0, 56, 57.5, 56]))).not.toBeNull();
  });

  it('يعمل مع عمليتين فقط', () => {
    expect(detectFreeTrialConversion(points([0, 56]))?.ratio).toBe(0);
  });

  it('عملية واحدة أو بلا عمليات لا تُصنَّف', () => {
    expect(detectFreeTrialConversion(points([0]))).toBeNull();
    expect(detectFreeTrialConversion([])).toBeNull();
  });

  it('رسوم لاحقة صفرية لا تُصنَّف (لا سعر مستقرّ)', () => {
    expect(detectFreeTrialConversion(points([0, 0, 0]))).toBeNull();
  });

  it('يرتّب زمنياً قبل الحكم: الأقدم هو "الأول" مهما كان ترتيب المدخل', () => {
    const shuffled = [...points([0, 56, 56, 56])].reverse();

    expect(detectFreeTrialConversion(shuffled)?.initialAmount).toBe(0);
  });
});

describe('effectiveAmountStability — إنصاف الاشتراك الذي ارتفع سعره', () => {
  it('مبالغ ثابتة: مستوى واحد ودرجة تامة', () => {
    const result = effectiveAmountStability(points([56, 56, 56, 56]));

    expect(result.basis).toBe('single-level');
    expect(result.score).toBe(1);
  });

  it('زيادة سعر نظيفة تبقى بدرجة ثبات عالية بدل أن تُعاقَب', () => {
    const entries = points([56, 56, 56, 70, 70, 70]);

    const raw = analyzeAmountStability(entries.map((point) => point.amount)).score;
    const effective = effectiveAmountStability(entries);

    expect(effective.basis).toBe('price-levels');
    expect(effective.score).toBe(1);
    expect(effective.score).toBeGreaterThan(raw);
  });

  it('نفس المبالغ بترتيب متذبذب لا تُنصَف: الترتيب الزمني وحده هو الفرق', () => {
    // المجموعتان تحويان المبالغ نفسها {56×3, 70×3} — الفرق في توزيعها زمنياً
    const oscillating = effectiveAmountStability(points([56, 70, 56, 70, 56, 70]));
    const cleanHike = effectiveAmountStability(points([56, 56, 56, 70, 70, 70]));

    expect(oscillating.basis).toBe('single-level');
    expect(cleanHike.basis).toBe('price-levels');
    expect(oscillating.score).toBeLessThan(cleanHike.score);
  });

  it('البقالة المتغيّرة تسقط تماماً', () => {
    const result = effectiveAmountStability(points([120, 340, 85, 260, 190]));

    expect(result.basis).toBe('single-level');
    expect(result.score).toBe(0);
  });

  it('التذبذب داخل المستويات ينقص الدرجة عن التمام', () => {
    const result = effectiveAmountStability(points([56, 58, 56, 75, 78, 75]));

    expect(result.basis).toBe('price-levels');
    expect(result.score).toBeLessThan(1);
    expect(result.score).toBeGreaterThan(0.8);
  });
});
