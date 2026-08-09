import { describe, expect, it } from 'vitest';
import {
  clamp01,
  mean,
  meanAbsoluteDeviation,
  median,
  relativeSpread,
  stabilityFromSpread,
} from '../src/core/stats';

describe('median — الوسيط لا المتوسط', () => {
  it('يعيد القيمة الوسطى لعدد فردي', () => {
    expect(median([30, 28, 31])).toBe(30);
    expect(median([7])).toBe(7);
  });

  it('يعيد متوسط الوسطيين لعدد زوجي', () => {
    expect(median([28, 30])).toBe(29);
    expect(median([28, 30, 31, 33])).toBe(30.5);
  });

  it('لا يتأثّر بترتيب المدخلات', () => {
    expect(median([180, 30, 30, 30, 30])).toBe(median([30, 30, 30, 30, 180]));
  });

  it('لا يعدّل القائمة الأصلية', () => {
    const values = [30, 10, 20];
    median(values);
    expect(values).toEqual([30, 10, 20]);
  });

  it('يعيد صفراً للقائمة الفارغة', () => {
    expect(median([])).toBe(0);
  });

  /**
   * هذا هو سبب اختيار الوسيط أصلاً: اشتراك شهري انقطع خمسة أشهر ثم عاد.
   * المتوسط يقول 60 يوماً (تصنيف خاطئ)، والوسيط يقول 30 يوماً (الصحيح).
   */
  it('يصمد أمام قيمة شاذة حيث ينهار المتوسط', () => {
    const gaps = [30, 30, 30, 30, 180];

    expect(median(gaps)).toBe(30);
    expect(mean(gaps)).toBe(60);
  });
});

describe('mean — للعرض والمقارنة فقط', () => {
  it('يحسب المتوسط الحسابي', () => {
    expect(mean([10, 20, 30])).toBe(20);
  });

  it('يعيد صفراً للقائمة الفارغة', () => {
    expect(mean([])).toBe(0);
  });
});

describe('meanAbsoluteDeviation — الانحراف حول الوسيط', () => {
  it('يعطي صفراً لقيم متطابقة', () => {
    expect(meanAbsoluteDeviation([28, 28, 28, 28])).toBe(0);
  });

  it('يبقي القيمة الشاذة مرئية (بعكس MAD الكلاسيكي)', () => {
    // وسيط الانحرافات هنا صفر لأن ثلاثة من أربعة متطابقة — لذلك لا نستخدمه
    expect(meanAbsoluteDeviation([30, 30, 30, 180])).toBe(37.5);
  });

  it('يقيس التذبذب المعتدل', () => {
    // الوسيط 30، الانحرافات [2,1,1,2] ومتوسطها 1.5
    expect(meanAbsoluteDeviation([28, 29, 31, 32])).toBe(1.5);
  });

  it('يعيد صفراً للقائمة الفارغة', () => {
    expect(meanAbsoluteDeviation([])).toBe(0);
  });
});

describe('relativeSpread — التشتت منسوباً للوسيط', () => {
  it('يعطي صفراً لقيم ثابتة تماماً', () => {
    expect(relativeSpread([56, 56, 56])).toBe(0);
  });

  it('يجعل نفس الانحراف المطلق أثقل على المقياس الصغير', () => {
    const weekly = relativeSpread([5, 7, 9]); // انحراف يومين على وسيط 7
    const annual = relativeSpread([363, 365, 367]); // انحراف يومين على وسيط 365

    expect(weekly).toBeGreaterThan(annual * 10);
  });

  it('يعيد صفراً حين يكون الوسيط صفراً أو القائمة فارغة', () => {
    expect(relativeSpread([])).toBe(0);
    expect(relativeSpread([0, 0, 0])).toBe(0);
  });
});

describe('clamp01 و stabilityFromSpread', () => {
  it('clamp01 يحصر في المجال [0,1]', () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(0.42)).toBe(0.42);
    expect(clamp01(9)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
  });

  it('stabilityFromSpread يعكس التشتت إلى درجة', () => {
    expect(stabilityFromSpread(0, 0.5)).toBe(1);
    expect(stabilityFromSpread(0.25, 0.5)).toBe(0.5);
    expect(stabilityFromSpread(0.5, 0.5)).toBe(0);
    expect(stabilityFromSpread(0.9, 0.5)).toBe(0);
  });

  it('stabilityFromSpread يعيد صفراً لحد انهيار غير صالح', () => {
    expect(stabilityFromSpread(0.1, 0)).toBe(0);
  });
});
