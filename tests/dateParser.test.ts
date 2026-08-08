import { describe, expect, it } from 'vitest';
import { inferDateFormat, parseDate, tryParseDate } from '../src/core/dateParser';
import { DateParseError } from '../src/core/errors';

describe('parseDate — الصيغ الثلاث المصرّح بها', () => {
  it('يفسّر 03/04/2024 كـ 3 أبريل بصيغة DD/MM/YYYY', () => {
    expect(parseDate('03/04/2024', 'DD/MM/YYYY')).toBe('2024-04-03');
  });

  it('يفسّر نفس النص كـ 4 مارس بصيغة MM/DD/YYYY', () => {
    expect(parseDate('03/04/2024', 'MM/DD/YYYY')).toBe('2024-03-04');
  });

  it('يقبل ISO كما هو', () => {
    expect(parseDate('2024-04-03', 'YYYY-MM-DD')).toBe('2024-04-03');
  });

  it('يضيف أصفاراً للأرقام المفردة', () => {
    expect(parseDate('3/4/2024', 'DD/MM/YYYY')).toBe('2024-04-03');
  });

  it('يرفض قيمة غير ISO حين تكون الصيغة المصرّح بها ISO', () => {
    expect(() => parseDate('03/04/2024', 'YYYY-MM-DD')).toThrow(DateParseError);
  });

  it('يتعرّف على ISO حتى لو صرّح المحوّل بصيغة أخرى (كشوف مختلطة)', () => {
    expect(parseDate('2024-04-03', 'DD/MM/YYYY')).toBe('2024-04-03');
  });
});

describe('parseDate — التواريخ الغامضة', () => {
  it('يحسم DMY تلقائياً حين يتجاوز الرقم الأول 12', () => {
    expect(parseDate('25/12/2024', 'auto')).toBe('2024-12-25');
  });

  it('يحسم MDY تلقائياً حين يتجاوز الرقم الثاني 12', () => {
    expect(parseDate('12/25/2024', 'auto')).toBe('2024-12-25');
  });

  it('يرمي خطأ عند الالتباس الحقيقي بدل التخمين الصامت', () => {
    expect(() => parseDate('03/04/2024', 'auto')).toThrow(DateParseError);
    expect(() => parseDate('03/04/2024', 'auto')).toThrow(/غامض/);
  });

  it('يحترم تفضيل DMY عند الالتباس', () => {
    expect(parseDate('03/04/2024', 'auto', { ambiguousPreference: 'DMY' })).toBe('2024-04-03');
  });

  it('يحترم تفضيل MDY عند الالتباس', () => {
    expect(parseDate('03/04/2024', 'auto', { ambiguousPreference: 'MDY' })).toBe('2024-03-04');
  });

  it('يرفض قيمة يتجاوز فيها الرقمان 12 معاً', () => {
    expect(() => parseDate('13/25/2024', 'auto')).toThrow(DateParseError);
  });
});

describe('parseDate — تنويعات الشكل', () => {
  it('يقبل الأرقام الهندية-العربية', () => {
    expect(parseDate('٠٣/٠٤/٢٠٢٤', 'DD/MM/YYYY')).toBe('2024-04-03');
  });

  it('يقبل الفواصل - و . و المسافة', () => {
    expect(parseDate('03-04-2024', 'DD/MM/YYYY')).toBe('2024-04-03');
    expect(parseDate('03.04.2024', 'DD/MM/YYYY')).toBe('2024-04-03');
    expect(parseDate('03 04 2024', 'DD/MM/YYYY')).toBe('2024-04-03');
  });

  it('يتجاهل الوقت الملحق بالتاريخ', () => {
    expect(parseDate('03/04/2024 14:33', 'DD/MM/YYYY')).toBe('2024-04-03');
    expect(parseDate('03/04/2024 02:15:00 PM', 'DD/MM/YYYY')).toBe('2024-04-03');
    expect(parseDate('2024-04-03T00:00:00Z', 'YYYY-MM-DD')).toBe('2024-04-03');
  });

  it('يتجاهل المسافات الزائدة', () => {
    expect(parseDate('  03/04/2024  ', 'DD/MM/YYYY')).toBe('2024-04-03');
  });

  it('يوسّع السنة ذات الرقمين حول العتبة 68', () => {
    expect(parseDate('03/04/24', 'DD/MM/YYYY')).toBe('2024-04-03');
    expect(parseDate('03/04/99', 'DD/MM/YYYY')).toBe('1999-04-03');
    expect(parseDate('03/04/68', 'DD/MM/YYYY')).toBe('2068-04-03');
    expect(parseDate('03/04/69', 'DD/MM/YYYY')).toBe('1969-04-03');
  });

  it('يقبل أسماء الشهور بالإنجليزية والعربية', () => {
    expect(parseDate('12-Mar-2024', 'auto')).toBe('2024-03-12');
    expect(parseDate('12 March 2024', 'auto')).toBe('2024-03-12');
    expect(parseDate('12 مارس 2024', 'auto')).toBe('2024-03-12');
    expect(parseDate('12 أبريل 2024', 'auto')).toBe('2024-04-12');
    expect(parseDate('2024-Mar-12', 'auto')).toBe('2024-03-12');
  });
});

describe('parseDate — الحالات الحدية', () => {
  it('يقبل 29 فبراير في سنة كبيسة', () => {
    expect(parseDate('29/02/2024', 'DD/MM/YYYY')).toBe('2024-02-29');
  });

  it('يرفض 29 فبراير في سنة غير كبيسة', () => {
    expect(() => parseDate('29/02/2023', 'DD/MM/YYYY')).toThrow(DateParseError);
  });

  it('يتعامل مع قاعدة القرون (1900 ليست كبيسة، 2000 كبيسة)', () => {
    expect(() => parseDate('29/02/1900', 'DD/MM/YYYY')).toThrow(DateParseError);
    expect(parseDate('29/02/2000', 'DD/MM/YYYY')).toBe('2000-02-29');
  });

  it('يرفض يوماً لا يوجد في الشهر', () => {
    expect(() => parseDate('31/04/2024', 'DD/MM/YYYY')).toThrow(/يوم غير موجود/);
  });

  it('يرفض رقم شهر خارج النطاق', () => {
    expect(() => parseDate('01/13/2024', 'DD/MM/YYYY')).toThrow(/شهر خارج النطاق/);
  });

  it('يرفض اليوم صفر', () => {
    expect(() => parseDate('00/04/2024', 'DD/MM/YYYY')).toThrow(DateParseError);
  });

  it('يرفض النصوص غير التاريخية والفارغة والناقصة', () => {
    expect(() => parseDate('abc', 'DD/MM/YYYY')).toThrow(DateParseError);
    expect(() => parseDate('', 'DD/MM/YYYY')).toThrow(DateParseError);
    expect(() => parseDate('   ', 'DD/MM/YYYY')).toThrow(DateParseError);
    expect(() => parseDate('03/04', 'DD/MM/YYYY')).toThrow(DateParseError);
    expect(() => parseDate('03/04/2024/05', 'DD/MM/YYYY')).toThrow(DateParseError);
  });

  it('tryParseDate يعيد null بدل رمي الخطأ', () => {
    expect(tryParseDate('abc', 'DD/MM/YYYY')).toBeNull();
    expect(tryParseDate('03/04/2024', 'DD/MM/YYYY')).toBe('2024-04-03');
  });
});

describe('inferDateFormat — استنتاج صيغة العمود كاملاً', () => {
  it('يحسم DD/MM/YYYY من قيمة واحدة قاطعة', () => {
    expect(inferDateFormat(['03/04/2024', '25/12/2024', '01/02/2024'])).toBe('DD/MM/YYYY');
  });

  it('يحسم MM/DD/YYYY من قيمة واحدة قاطعة', () => {
    expect(inferDateFormat(['03/04/2024', '12/25/2024'])).toBe('MM/DD/YYYY');
  });

  it('يتعرّف على عمود ISO', () => {
    expect(inferDateFormat(['2024-01-01', '2024-12-31'])).toBe('YYYY-MM-DD');
  });

  it('يعيد null حين يبقى العمود كله غامضاً', () => {
    expect(inferDateFormat(['03/04/2024', '05/06/2024'])).toBeNull();
  });

  it('يعيد null حين تتناقض القيم', () => {
    expect(inferDateFormat(['25/12/2024', '12/25/2024'])).toBeNull();
  });

  it('يتجاهل القيم التالفة بدل الانهيار', () => {
    expect(inferDateFormat(['', 'abc', '25/12/2024'])).toBe('DD/MM/YYYY');
  });
});
