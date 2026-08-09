import { describe, expect, it } from 'vitest';
import { decodeCsvBytes } from '../src/core/csv';
import { CsvParseError, NoMatchingAdapterError } from '../src/core/errors';
import { importCsvBytes, importCsvText } from '../src/core/importCsv';

/**
 * يرمّز نصاً بترميز windows-1256 (العربي القديم).
 *
 * نبني جدول الترميز العكسي من `TextDecoder` نفسه بدل كتابة 256 قيمة يدوياً:
 * نفكّ كل بايت على حدة ونحفظ الحرف الناتج، فنحصل على خريطة حرف → بايت.
 */
function encodeWindows1256(text: string): Uint8Array {
  const decoder = new TextDecoder('windows-1256');
  const reverse = new Map<string, number>();

  for (let byte = 0; byte <= 0xff; byte += 1) {
    const char = decoder.decode(new Uint8Array([byte]));
    if (!reverse.has(char)) reverse.set(char, byte);
  }

  return new Uint8Array(
    [...text].map((char) => {
      const byte = reverse.get(char);
      if (byte === undefined) {
        throw new Error(`حرف غير مدعوم في windows-1256: ${char}`);
      }
      return byte;
    }),
  );
}

/** يرمّز نصاً بـ UTF-8 مع علامة ترتيب البايت في المقدمة. */
function encodeUtf8WithBom(text: string): Uint8Array {
  const body = new TextEncoder().encode(text);
  const bytes = new Uint8Array(body.length + 3);
  bytes.set([0xef, 0xbb, 0xbf], 0);
  bytes.set(body, 3);
  return bytes;
}

const ARABIC_CSV = 'التاريخ,البيان,مدين,دائن\n03/04/2024,اشتراك نتفلكس,56.00,\n';

describe('الحالات الحدية — الملفات الفارغة', () => {
  it('ملف فارغ تماماً يرمي خطأً واضحاً بالعربية', () => {
    expect(() => importCsvText('')).toThrow(CsvParseError);
    expect(() => importCsvText('')).toThrow(/الملف فارغ/);
  });

  it('ملف من أسطر فارغة فقط يرمي خطأً', () => {
    expect(() => importCsvText('\n\n   \n')).toThrow(CsvParseError);
  });

  it('بايتات فارغة ترمي خطأً قبل محاولة التحليل', () => {
    expect(() => importCsvBytes(new Uint8Array(0))).toThrow(CsvParseError);
  });

  it('ملف بترويسة فقط بلا بيانات ينجح ويعيد صفراً من العمليات', () => {
    const result = importCsvText('التاريخ,البيان,مدين,دائن');

    expect(result.adapter.id).toBe('alrajhi');
    expect(result.transactions).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('ملف بترويسة غير معروفة يرمي خطأ كشف يحمل المرشّحين للاختيار اليدوي', () => {
    expect(() => importCsvText('col1,col2,col3\n1,2,3')).toThrow(NoMatchingAdapterError);
  });
});

describe('الحالات الحدية — الصفوف التالفة والناقصة', () => {
  it('يتخطّى الصف التالف ويُبقي الصفوف السليمة', () => {
    const result = importCsvText(
      [
        'التاريخ,البيان,مدين,دائن',
        '03/04/2024,اشتراك نتفلكس,56.00,',
        'تاريخ-غلط,اشتراك شاهد,29.00,',
        '05/04/2024,اشتراك سبوتيفاي,21.99,',
      ].join('\n'),
    );

    expect(result.transactions).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toMatch(/تاريخ غير صالح/);
    expect(result.skipped[0]?.index).toBe(1);
  });

  it('يحتفظ بالصف الخام كاملاً مع سبب التخطّي للعرض لاحقاً', () => {
    const result = importCsvText('التاريخ,البيان,مدين,دائن\nتاريخ-غلط,اشتراك,56.00,');

    expect(result.skipped[0]?.row).toEqual({
      التاريخ: 'تاريخ-غلط',
      البيان: 'اشتراك',
      مدين: '56.00',
      دائن: '',
    });
  });

  it('يتخطّى الصف الناقص الخلايا', () => {
    const result = importCsvText('التاريخ,البيان,مدين,دائن\n03/04/2024,اشتراك');

    expect(result.transactions).toHaveLength(0);
    expect(result.skipped[0]?.reason).toMatch(/لا يوجد مبلغ/);
  });

  it('يتخطّى الصف بوصف فارغ', () => {
    const result = importCsvText('التاريخ,البيان,مدين,دائن\n03/04/2024,,56.00,');

    expect(result.skipped[0]?.reason).toMatch(/وصف العملية فارغ/);
  });

  it('يتخطّى الصف بمبلغ غير رقمي', () => {
    const result = importCsvText('التاريخ,البيان,مدين,دائن\n03/04/2024,اشتراك,غير متوفر,');

    expect(result.skipped[0]?.reason).toMatch(/مبلغ مدين غير صالح/);
  });

  it('يعيد نتيجة فارغة سليمة حين تتلف كل الصفوف', () => {
    const result = importCsvText(
      'التاريخ,البيان,مدين,دائن\nxx,اشتراك,56.00,\nyy,اشتراك آخر,20.00,',
    );

    expect(result.transactions).toEqual([]);
    expect(result.skipped).toHaveLength(2);
  });

  it('يتجاهل الأسطر الفارغة بين الصفوف بلا اعتبارها تالفة', () => {
    const result = importCsvText(
      'التاريخ,البيان,مدين,دائن\n\n03/04/2024,اشتراك نتفلكس,56.00,\n\n\n05/04/2024,شاهد,29.00,\n',
    );

    expect(result.transactions).toHaveLength(2);
    expect(result.skipped).toEqual([]);
  });
});

describe('الحالات الحدية — الترميز غير UTF-8', () => {
  it('يفكّ ملفاً عربياً بترميز windows-1256 بدل تشويهه', () => {
    const { text, encoding } = decodeCsvBytes(encodeWindows1256(ARABIC_CSV));

    expect(encoding).toBe('windows-1256');
    expect(text).toBe(ARABIC_CSV);
    expect(text).not.toContain(String.fromCodePoint(0xfffd)); // لا محارف مشوّهة
  });

  it('يستورد ملف windows-1256 كاملاً بأوصاف عربية سليمة', () => {
    const result = importCsvBytes(encodeWindows1256(ARABIC_CSV));

    expect(result.encoding).toBe('windows-1256');
    expect(result.adapter.id).toBe('alrajhi');
    expect(result.transactions[0]).toEqual({
      date: '2024-04-03',
      description: 'اشتراك نتفلكس',
      amount: 56,
      currency: 'SAR',
      direction: 'debit',
    });
  });

  it('يتعرّف على UTF-8 مع BOM ويحذف العلامة من أول عمود', () => {
    const result = importCsvBytes(encodeUtf8WithBom(ARABIC_CSV));

    expect(result.encoding).toBe('utf-8');
    expect(result.headers[0]).toBe('التاريخ');
    expect(result.transactions).toHaveLength(1);
  });

  it('يتعرّف على UTF-8 بلا BOM', () => {
    const bytes = new TextEncoder().encode(ARABIC_CSV);

    expect(decodeCsvBytes(bytes).encoding).toBe('utf-8');
  });

  it('يقبل ArrayBuffer مباشرة كما يأتي من File.arrayBuffer()', () => {
    const bytes = new TextEncoder().encode(ARABIC_CSV);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

    expect(importCsvBytes(buffer).transactions).toHaveLength(1);
  });
});
