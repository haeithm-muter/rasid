import { describe, expect, it } from 'vitest';
import { extractCurrency, isBlankCell, parseAmount, tryParseAmount } from '../src/core/amountParser';
import { AmountParseError } from '../src/core/errors';

describe('parseAmount — الفواصل العشرية وفواصل الآلاف', () => {
  it('يفهم النمط الإنجليزي 1,234.50', () => {
    expect(parseAmount('1,234.50').value).toBe(1234.5);
  });

  it('يفهم النمط الأوروبي 1.234,56', () => {
    expect(parseAmount('1.234,56').value).toBe(1234.56);
  });

  it('يعامل الفاصلة كعشرية حين تتبعها خانتان', () => {
    expect(parseAmount('12,50').value).toBe(12.5);
  });

  it('يعامل الفاصلة كفاصل آلاف حين تتبعها ثلاث خانات', () => {
    expect(parseAmount('1,234').value).toBe(1234);
  });

  it('يفهم فواصل الآلاف المتعدّدة', () => {
    expect(parseAmount('1,234,567.89').value).toBe(1234567.89);
    expect(parseAmount('1.234.567').value).toBe(1234567);
  });

  it('يفهم النقاط كفواصل آلاف مع عشرية أخيرة', () => {
    expect(parseAmount('1.234.56').value).toBe(1234.56);
  });

  it('يقبل الرقم الصحيح بلا فواصل', () => {
    expect(parseAmount('45').value).toBe(45);
    expect(parseAmount('0').value).toBe(0);
  });

  it('يقبل المسافة كفاصل آلاف', () => {
    expect(parseAmount('1 234.50').value).toBe(1234.5);
  });
});

describe('parseAmount — الإشارة', () => {
  it('يقرأ السالب بالشرطة', () => {
    expect(parseAmount('-45.00').value).toBe(-45);
  });

  it('يقرأ الأقواس كسالب (النمط المحاسبي)', () => {
    expect(parseAmount('(45.00)').value).toBe(-45);
  });

  it('يقرأ إشارة الطرح الرياضية U+2212', () => {
    expect(parseAmount(`${String.fromCodePoint(0x2212)}45.00`).value).toBe(-45);
  });

  it('يقرأ اللاحقة DR كخصم و CR كإيداع', () => {
    expect(parseAmount('250.00 DR').value).toBe(-250);
    expect(parseAmount('250.00 CR').value).toBe(250);
  });

  it('يقرأ اللواحق العربية مدين/دائن', () => {
    expect(parseAmount('250.00 مدين').value).toBe(-250);
    expect(parseAmount('250.00 دائن').value).toBe(250);
  });

  it('يبقي الموجب موجباً', () => {
    expect(parseAmount('+45.00').value).toBe(45);
  });
});

describe('parseAmount — رموز العملة داخل الخلية', () => {
  it('ينظّف رمز العملة النصي ويستخرجه', () => {
    expect(parseAmount('1,234.50 SAR')).toEqual({ value: 1234.5, currency: 'SAR' });
    expect(parseAmount('AED 99.00')).toEqual({ value: 99, currency: 'AED' });
  });

  it('يفهم رموز العملة العربية', () => {
    expect(parseAmount('99.00 ر.س')).toEqual({ value: 99, currency: 'SAR' });
    expect(parseAmount('99.00 د.إ')).toEqual({ value: 99, currency: 'AED' });
  });

  it('يفهم الرموز الأجنبية', () => {
    expect(parseAmount('$12.99')).toEqual({ value: 12.99, currency: 'USD' });
    expect(parseAmount('€12.99')).toEqual({ value: 12.99, currency: 'EUR' });
    expect(parseAmount('£12.99')).toEqual({ value: 12.99, currency: 'GBP' });
  });

  it('يفكّ خلية عربية كاملة: رمز + أرقام هندية + فواصل عربية', () => {
    const cell = `${String.fromCodePoint(0xfdfc)} ١٬٢٣٤٫٥٠`;
    expect(parseAmount(cell)).toEqual({ value: 1234.5, currency: 'SAR' });
  });

  it('يعيد null للعملة حين لا يوجد رمز', () => {
    expect(parseAmount('1234.50').currency).toBeNull();
  });

  it('extractCurrency لا يطابق رمزاً داخل كلمة أطول', () => {
    expect(extractCurrency('SARAH SHOP')).toBeNull();
    expect(extractCurrency('100 SAR')).toBe('SAR');
  });
});

describe('parseAmount — الحالات التالفة', () => {
  it('يرفض الخلية الفارغة', () => {
    expect(() => parseAmount('')).toThrow(AmountParseError);
    expect(() => parseAmount('   ')).toThrow(AmountParseError);
  });

  it('يرفض النص بلا أرقام', () => {
    expect(() => parseAmount('غير متوفر')).toThrow(AmountParseError);
    expect(() => parseAmount('N/A')).toThrow(AmountParseError);
  });

  it('tryParseAmount يعيد null بدل رمي الخطأ', () => {
    expect(tryParseAmount('N/A')).toBeNull();
    expect(tryParseAmount('45.00')).toEqual({ value: 45, currency: null });
  });

  it('isBlankCell يميّز الخلية الفارغة عن التالفة', () => {
    expect(isBlankCell('')).toBe(true);
    expect(isBlankCell('  ')).toBe(true);
    expect(isBlankCell(undefined)).toBe(true);
    expect(isBlankCell('N/A')).toBe(false);
    expect(isBlankCell('0')).toBe(false);
  });
});
