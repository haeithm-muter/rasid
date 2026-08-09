import { describe, expect, it } from 'vitest';
import {
  CYCLE_RANGES,
  IRREGULAR_LABEL,
  MIN_TRANSACTIONS_FOR_PERIODICITY,
  analyzePeriodicity,
  classifyCycle,
  daysBetween,
  gapsInDays,
  sortByDate,
  toDayNumber,
} from '../src/core/periodicity';
import type { Transaction } from '../src/core/types';

// ─── مولّدات بيانات اصطناعية ──────────────────────────────────────────────

/** يضيف عدداً من الأيام إلى تاريخ ISO ويعيد تاريخ ISO. */
function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** سلسلة تواريخ تفصل بينها `step` يوماً بالضبط. */
function everyNDays(start: string, step: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(start, index * step));
}

/** سلسلة تواريخ في نفس رقم اليوم من كل شهر تقويمي (النمط "العادي"). */
function sameDayEachMonth(year: number, month: number, day: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, day));
    return date.toISOString().slice(0, 10);
  });
}

/** رقم اليوم من الشهر لتاريخ ISO. */
function dayOfMonth(isoDate: string): number {
  return Number(isoDate.slice(8, 10));
}

/** مفتاح الشهر `YYYY-MM` — لمحاكاة الأدوات التي تجمّع بالشهر التقويمي. */
function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

// ─── الاختبارات ───────────────────────────────────────────────────────────

describe('toDayNumber و daysBetween — الحساب بالأيام لا بالتقويم', () => {
  it('يحسب الفرق بالأيام عبر حدود الشهور', () => {
    expect(daysBetween('2024-01-01', '2024-01-29')).toBe(28);
    expect(daysBetween('2024-01-29', '2024-02-26')).toBe(28);
    expect(daysBetween('2024-02-26', '2024-03-25')).toBe(28);
  });

  it('يراعي فبراير الكبيس', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2); // 2024 كبيسة
    expect(daysBetween('2023-02-28', '2023-03-01')).toBe(1); // 2023 ليست كبيسة
  });

  it('يعبر حدود السنة', () => {
    expect(daysBetween('2024-12-31', '2025-01-01')).toBe(1);
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366); // سنة كبيسة
  });

  it('يعطي فرقاً سالباً حين يكون الترتيب معكوساً', () => {
    expect(daysBetween('2024-01-29', '2024-01-01')).toBe(-28);
  });

  it('يرفض التواريخ غير الصالحة بدل تصحيحها بصمت', () => {
    expect(toDayNumber('2024-02-30')).toBeNull();
    expect(toDayNumber('2024-13-01')).toBeNull();
    expect(toDayNumber('01/01/2024')).toBeNull();
    expect(toDayNumber('')).toBeNull();
    expect(daysBetween('2024-01-01', 'ليس تاريخاً')).toBeNull();
  });
});

describe('gapsInDays — الفروق بين العمليات المتتالية', () => {
  it('يحسب الفروق بترتيبها الزمني', () => {
    expect(gapsInDays(['2024-01-01', '2024-01-29', '2024-02-26'])).toEqual([28, 28]);
  });

  it('يرتّب المدخلات قبل الحساب', () => {
    expect(gapsInDays(['2024-02-26', '2024-01-01', '2024-01-29'])).toEqual([28, 28]);
  });

  it('يعيد قائمة فارغة لتاريخ واحد أو بلا تواريخ', () => {
    expect(gapsInDays(['2024-01-01'])).toEqual([]);
    expect(gapsInDays([])).toEqual([]);
  });

  it('يتخطّى التواريخ التالفة بدل إسقاط المجموعة', () => {
    expect(gapsInDays(['2024-01-01', 'تالف', '2024-01-29'])).toEqual([28]);
  });
});

describe('classifyCycle — جدول التصنيف بحدوده الشاملة', () => {
  it('أسبوعي: 6–8', () => {
    expect(classifyCycle(6)?.kind).toBe('weekly');
    expect(classifyCycle(7)?.kind).toBe('weekly');
    expect(classifyCycle(8)?.kind).toBe('weekly');
    expect(classifyCycle(5)).toBeNull();
    expect(classifyCycle(9)).toBeNull();
  });

  it('نصف شهري: 13–16', () => {
    expect(classifyCycle(13)?.kind).toBe('semimonthly');
    expect(classifyCycle(16)?.kind).toBe('semimonthly');
    expect(classifyCycle(12)).toBeNull();
    expect(classifyCycle(17)).toBeNull();
  });

  it('شهري: 27–32', () => {
    expect(classifyCycle(27)?.kind).toBe('monthly');
    expect(classifyCycle(32)?.kind).toBe('monthly');
    expect(classifyCycle(26)).toBeNull();
    expect(classifyCycle(33)).toBeNull();
  });

  it('ربع سنوي: 85–95', () => {
    expect(classifyCycle(85)?.kind).toBe('quarterly');
    expect(classifyCycle(95)?.kind).toBe('quarterly');
    expect(classifyCycle(84)).toBeNull();
    expect(classifyCycle(96)).toBeNull();
  });

  it('نصف سنوي: 175–190', () => {
    expect(classifyCycle(175)?.kind).toBe('semiannual');
    expect(classifyCycle(190)?.kind).toBe('semiannual');
    expect(classifyCycle(174)).toBeNull();
    expect(classifyCycle(191)).toBeNull();
  });

  it('سنوي: 355–375', () => {
    expect(classifyCycle(355)?.kind).toBe('annual');
    expect(classifyCycle(375)?.kind).toBe('annual');
    expect(classifyCycle(354)).toBeNull();
    expect(classifyCycle(376)).toBeNull();
  });

  it('المنطقة الرمادية بين المدايات ترفض التصنيف بدل التخمين', () => {
    for (const grayZone of [10, 20, 45, 60, 120, 250, 300, 500]) {
      expect(classifyCycle(grayZone)).toBeNull();
    }
  });

  it('يقبل الوسيط الكسري الناتج عن عدد زوجي من الفروق', () => {
    expect(classifyCycle(30.5)?.kind).toBe('monthly');
    expect(classifyCycle(14.5)?.kind).toBe('semimonthly');
  });

  it('المدايات لا تتداخل ومرتّبة تصاعدياً', () => {
    for (let i = 1; i < CYCLE_RANGES.length; i += 1) {
      const previous = CYCLE_RANGES[i - 1] as (typeof CYCLE_RANGES)[number];
      const current = CYCLE_RANGES[i] as (typeof CYCLE_RANGES)[number];
      expect(current.minDays).toBeGreaterThan(previous.maxDays);
    }
  });
});

describe('analyzePeriodicity — تصنيف كل مدى من الجدول', () => {
  it('أسبوعي', () => {
    const result = analyzePeriodicity(everyNDays('2024-01-01', 7, 8));

    expect(result.cycle).toBe('weekly');
    expect(result.label).toBe('أسبوعي');
    expect(result.medianGap).toBe(7);
    expect(result.regularity).toBe(1);
  });

  it('نصف شهري', () => {
    const result = analyzePeriodicity(everyNDays('2024-01-01', 14, 8));

    expect(result.cycle).toBe('semimonthly');
    expect(result.label).toBe('نصف شهري');
    expect(result.medianGap).toBe(14);
  });

  it('شهري', () => {
    const result = analyzePeriodicity(everyNDays('2024-01-01', 30, 6));

    expect(result.cycle).toBe('monthly');
    expect(result.label).toBe('شهري');
    expect(result.medianGap).toBe(30);
  });

  it('شهري تقويمي (نفس رقم اليوم) رغم اختلاف أطوال الشهور', () => {
    const result = analyzePeriodicity(sameDayEachMonth(2024, 1, 5, 12));

    expect(result.cycle).toBe('monthly');
    expect(result.gaps).toContain(31);
    expect(result.gaps).toContain(29); // فبراير 2024 الكبيس
    expect(result.regularity).toBeGreaterThan(0.9);
  });

  it('ربع سنوي', () => {
    const result = analyzePeriodicity(everyNDays('2024-01-01', 91, 5));

    expect(result.cycle).toBe('quarterly');
    expect(result.label).toBe('ربع سنوي');
  });

  it('نصف سنوي', () => {
    const result = analyzePeriodicity(everyNDays('2022-01-01', 182, 5));

    expect(result.cycle).toBe('semiannual');
    expect(result.label).toBe('نصف سنوي');
  });

  it('سنوي', () => {
    const result = analyzePeriodicity(everyNDays('2020-01-01', 365, 5));

    expect(result.cycle).toBe('annual');
    expect(result.label).toBe('سنوي');
  });

  it('يرفض تصنيف ما يقع خارج كل المدايات', () => {
    for (const step of [45, 60, 120, 250]) {
      const result = analyzePeriodicity(everyNDays('2020-01-01', step, 6));

      expect(result.cycle).toBe('irregular');
      expect(result.label).toBe(IRREGULAR_LABEL);
      expect(result.nominalDays).toBeNull();
      // الانتظام مرتفع (الفروق متطابقة) لكن التصنيف مرفوض — قياسان مستقلان
      expect(result.regularity).toBe(1);
    }
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * المتطلب الحرج: الدورة كل 28 يوماً المنزلقة عبر الشهور.
 *
 * هذه بالضبط الحالة التي تفشل فيها الأدوات البسيطة التي تبحث عن "خصم في نفس
 * رقم اليوم من كل شهر" أو تجمّع العمليات في دلاء شهرية تقويمية.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('الدورة كل 28 يوماً المنزلقة عبر الشهور (المتطلب الحرج)', () => {
  /** ثمانية خصوم كل 28 يوماً ابتداءً من 1 يناير 2024. */
  const SLIDING_28 = everyNDays('2024-01-01', 28, 8);

  it('يكشف اشتراكاً كل 28 يوماً بالضبط رغم انزلاق تاريخ الخصم عبر أيام الشهر', () => {
    const result = analyzePeriodicity(SLIDING_28);

    expect(result.gaps).toEqual([28, 28, 28, 28, 28, 28, 28]);
    expect(result.medianGap).toBe(28);
    expect(result.cycle).toBe('monthly');
    expect(result.label).toBe('شهري');
    expect(result.regularity).toBe(1);
    expect(result.hasEnoughData).toBe(true);
  });

  it('السلسلة المكشوفة تنزلق فعلاً: كل خصم في رقم يوم مختلف من الشهر', () => {
    expect(SLIDING_28).toEqual([
      '2024-01-01',
      '2024-01-29',
      '2024-02-26',
      '2024-03-25',
      '2024-04-22',
      '2024-05-20',
      '2024-06-17',
      '2024-07-15',
    ]);

    // ثمانية خصوم في ثمانية أرقام أيام مختلفة — أي منطق يعتمد على رقم اليوم يعمى هنا
    const distinctDays = new Set(SLIDING_28.map(dayOfMonth));
    expect(distinctDays.size).toBe(8);
  });

  it('السلسلة تكسر افتراض "خصم واحد لكل شهر تقويمي" ومع ذلك تُكشف', () => {
    const perMonth = new Map<string, number>();
    for (const date of SLIDING_28) {
      perMonth.set(monthKey(date), (perMonth.get(monthKey(date)) ?? 0) + 1);
    }

    // يناير فيه خصمان، وشهور السنة الباقية بلا خصم إطلاقاً
    expect(perMonth.get('2024-01')).toBe(2);
    expect(perMonth.size).toBeLessThan(SLIDING_28.length);

    expect(analyzePeriodicity(SLIDING_28).cycle).toBe('monthly');
  });

  it('الدورة المنزلقة تُكشف بقوة الدورة التقويمية الثابتة أو أكثر', () => {
    const sliding = analyzePeriodicity(SLIDING_28);
    const calendar = analyzePeriodicity(sameDayEachMonth(2024, 1, 5, 8));

    expect(sliding.cycle).toBe(calendar.cycle);
    // بل إنها أنظف: فروقها متطابقة بينما الشهر التقويمي يتراوح بين 28 و31
    expect(sliding.regularity).toBeGreaterThanOrEqual(calendar.regularity);
  });

  it('تصمد عبر سنة كاملة بما فيها فبراير الكبيس وحدود السنة', () => {
    const result = analyzePeriodicity(everyNDays('2024-01-31', 28, 16));

    expect(result.medianGap).toBe(28);
    expect(result.cycle).toBe('monthly');
    expect(result.regularity).toBe(1);
  });

  it('لا تُخلط مع نصف شهري ولا مع ربع سنوي', () => {
    const result = analyzePeriodicity(SLIDING_28);

    expect(result.cycle).not.toBe('semimonthly');
    expect(result.cycle).not.toBe('quarterly');
  });

  it('تبقى مكشوفة حتى لو تأخّر خصم واحد يومين', () => {
    const withDelay = [...SLIDING_28];
    withDelay[4] = addDays(withDelay[4] as string, 2);

    const result = analyzePeriodicity(withDelay);

    expect(result.medianGap).toBe(28);
    expect(result.cycle).toBe('monthly');
    expect(result.regularity).toBeGreaterThan(0.9);
  });
});

describe('درجة الانتظام — من التشتت حول الوسيط', () => {
  it('فروق متطابقة تعطي انتظاماً تاماً', () => {
    expect(analyzePeriodicity(everyNDays('2024-01-01', 30, 6)).regularity).toBe(1);
  });

  it('كلما زاد التشتت قلّ الانتظام', () => {
    const tight = analyzePeriodicity(['2024-01-01', '2024-01-31', '2024-03-01', '2024-03-31']);
    const loose = analyzePeriodicity(['2024-01-01', '2024-01-25', '2024-03-05', '2024-03-28']);

    expect(tight.regularity).toBeGreaterThan(loose.regularity);
    expect(loose.regularity).toBeGreaterThan(0);
  });

  it('انقطاع طويل يمحو الانتظام مع بقاء التصنيف على الوسيط', () => {
    // ثلاثة خصوم شهرية ثم انقطاع ستة أشهر: [30, 30, 30, 180]
    const result = analyzePeriodicity([
      '2024-01-01',
      '2024-01-31',
      '2024-03-01',
      '2024-03-31',
      '2024-09-27',
    ]);

    expect(result.medianGap).toBe(30);
    expect(result.cycle).toBe('monthly'); // الوسيط صامد أمام الشاذة
    expect(result.regularity).toBe(0); // ودرجة الانتظام تفضحها
  });

  it('نمط فوضوي تماماً ينهار انتظامه', () => {
    const result = analyzePeriodicity([
      '2024-01-01',
      '2024-01-03',
      '2024-02-20',
      '2024-02-22',
      '2024-06-15',
    ]);

    expect(result.regularity).toBeLessThan(0.3);
  });

  it('الانتظام محصور دائماً بين 0 و1', () => {
    const samples = [
      everyNDays('2024-01-01', 7, 5),
      ['2024-01-01', '2024-01-02', '2024-12-31'],
      ['2024-01-01', '2024-06-01', '2024-06-02', '2024-06-03'],
    ];

    for (const dates of samples) {
      const { regularity } = analyzePeriodicity(dates);
      expect(regularity).toBeGreaterThanOrEqual(0);
      expect(regularity).toBeLessThanOrEqual(1);
    }
  });
});

describe('الحالات الحدية — بيانات لا تكفي للحديث عن دورية', () => {
  it('الحد الأدنى المعلن ثلاث عمليات', () => {
    expect(MIN_TRANSACTIONS_FOR_PERIODICITY).toBe(3);
  });

  it('عمليتان لا تُصنَّفان دورية (فرق واحد ليس نمطاً)', () => {
    const result = analyzePeriodicity(['2024-01-01', '2024-01-31']);

    expect(result.hasEnoughData).toBe(false);
    expect(result.cycle).toBe('irregular');
    expect(result.regularity).toBe(0);
    expect(result.medianGap).toBe(0);
    expect(result.occurrences).toBe(2);
  });

  it('عملية واحدة يتيمة لا تُصنَّف', () => {
    const result = analyzePeriodicity(['2024-01-01']);

    expect(result.hasEnoughData).toBe(false);
    expect(result.occurrences).toBe(1);
    expect(result.gaps).toEqual([]);
  });

  it('بلا عمليات إطلاقاً', () => {
    const result = analyzePeriodicity([]);

    expect(result.hasEnoughData).toBe(false);
    expect(result.occurrences).toBe(0);
    expect(result.cycle).toBe('irregular');
  });

  it('ثلاث عمليات هي أول عدد يُصنَّف', () => {
    const result = analyzePeriodicity(['2024-01-01', '2024-01-31', '2024-03-01']);

    expect(result.hasEnoughData).toBe(true);
    expect(result.cycle).toBe('monthly');
  });

  it('عمليات في نفس اليوم تكرار لا دورة', () => {
    const result = analyzePeriodicity(['2024-01-01', '2024-01-01', '2024-01-01']);

    expect(result.hasEnoughData).toBe(true);
    expect(result.medianGap).toBe(0);
    expect(result.cycle).toBe('irregular');
    expect(result.regularity).toBe(0);
  });

  it('ثلاث عمليات إحداها بتاريخ تالف لا تكفي بعد التخطّي', () => {
    const result = analyzePeriodicity(['2024-01-01', 'تالف', '2024-01-31']);

    expect(result.hasEnoughData).toBe(false);
    expect(result.occurrences).toBe(2);
  });

  it('ترتيب المدخلات لا يغيّر النتيجة', () => {
    const ordered = analyzePeriodicity(everyNDays('2024-01-01', 28, 6));
    const shuffled = analyzePeriodicity([...everyNDays('2024-01-01', 28, 6)].reverse());

    expect(shuffled).toEqual(ordered);
  });
});

describe('sortByDate — الترتيب الزمني الحتمي', () => {
  /** عملية اختبارية مختصرة. */
  function transaction(date: string, amount: number, description = 'NETFLIX'): Transaction {
    return { date, description, amount, currency: 'SAR', direction: 'debit' };
  }

  it('يرتّب من الأقدم إلى الأحدث', () => {
    const sorted = sortByDate([
      transaction('2024-03-01', 56),
      transaction('2024-01-01', 56),
      transaction('2024-02-01', 56),
    ]);

    expect(sorted.map((item) => item.date)).toEqual(['2024-01-01', '2024-02-01', '2024-03-01']);
  });

  it('لا يعدّل المصفوفة الأصلية', () => {
    const original = [transaction('2024-03-01', 56), transaction('2024-01-01', 56)];
    sortByDate(original);

    expect(original[0]?.date).toBe('2024-03-01');
  });

  it('يفكّ تعادل التاريخ بالمبلغ ثم الوصف — نتيجة حتمية', () => {
    const sorted = sortByDate([
      transaction('2024-01-01', 90, 'B'),
      transaction('2024-01-01', 10, 'C'),
      transaction('2024-01-01', 10, 'A'),
    ]);

    expect(sorted.map((item) => [item.amount, item.description])).toEqual([
      [10, 'A'],
      [10, 'C'],
      [90, 'B'],
    ]);
  });
});
