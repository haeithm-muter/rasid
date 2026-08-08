import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/core/csv';
import { CsvParseError } from '../src/core/errors';

describe('parseCsv — التحليل الأساسي', () => {
  it('يقرأ الترويسة والصفوف', () => {
    const table = parseCsv('Date,Description,Amount\n01/02/2024,NETFLIX,-45.00');

    expect(table.headers).toEqual(['Date', 'Description', 'Amount']);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toEqual({
      Date: '01/02/2024',
      Description: 'NETFLIX',
      Amount: '-45.00',
    });
  });

  it('يكتشف الفاصلة المنقوطة تلقائياً (تصدير Excel العربي)', () => {
    const table = parseCsv('التاريخ;البيان;المبلغ\n01/02/2024;نتفلكس;45.00');

    expect(table.headers).toEqual(['التاريخ', 'البيان', 'المبلغ']);
    expect(table.rows[0]?.['البيان']).toBe('نتفلكس');
  });

  it('يكتشف التبويب كفاصل', () => {
    const table = parseCsv('Date\tDescription\tAmount\n01/02/2024\tNETFLIX\t-45.00');

    expect(table.headers).toEqual(['Date', 'Description', 'Amount']);
    expect(table.rows[0]?.Amount).toBe('-45.00');
  });

  it('يحترم علامات الاقتباس حول قيمة تحتوي فاصلة', () => {
    const table = parseCsv('Date,Description,Amount\n01/02/2024,"SHOP, RIYADH",1,00');

    expect(table.rows[0]?.Description).toBe('SHOP, RIYADH');
  });

  it('يقصّ المسافات من الخلايا وأسماء الأعمدة', () => {
    const table = parseCsv('  Date ,  Description \n 01/02/2024 ,  NETFLIX ');

    expect(table.headers).toEqual(['Date', 'Description']);
    expect(table.rows[0]).toEqual({ Date: '01/02/2024', Description: 'NETFLIX' });
  });

  it('يتجاهل الأسطر الفارغة', () => {
    const table = parseCsv('Date,Amount\n\n01/02/2024,45\n\n\n02/02/2024,50\n');

    expect(table.rows).toHaveLength(2);
  });

  it('يحذف BOM من أول اسم عمود', () => {
    const bom = String.fromCodePoint(0xfeff);
    const table = parseCsv(`${bom}Date,Amount\n01/02/2024,45`);

    expect(table.headers[0]).toBe('Date');
  });
});

describe('parseCsv — الترويسات غير النظيفة', () => {
  it('يعيد تسمية الأعمدة المكرّرة بدل ابتلاع إحداها', () => {
    const table = parseCsv('Amount,Amount\n10,20');

    expect(table.headers).toEqual(['Amount', 'Amount_2']);
    expect(table.rows[0]).toEqual({ Amount: '10', Amount_2: '20' });
  });

  it('يعطي اسماً بديلاً للعمود بلا اسم', () => {
    const table = parseCsv('Date,,Amount\n01/02/2024,x,45');

    expect(table.headers).toEqual(['Date', 'عمود_2', 'Amount']);
    expect(table.rows[0]?.['عمود_2']).toBe('x');
  });
});

describe('parseCsv — الصفوف الناقصة والزائدة', () => {
  it('يملأ الخلايا الناقصة بقيمة فارغة بدل رفض الصف', () => {
    const table = parseCsv('Date,Description,Amount\n01/02/2024,NETFLIX');

    expect(table.rows[0]).toEqual({ Date: '01/02/2024', Description: 'NETFLIX', Amount: '' });
  });

  it('يتجاهل الخلايا الزائدة عن عدد الأعمدة', () => {
    const table = parseCsv('Date,Amount\n01/02/2024,45,extra');

    expect(table.rows[0]).toEqual({ Date: '01/02/2024', Amount: '45' });
  });
});

describe('parseCsv — الملفات الفارغة', () => {
  it('يرمي خطأ واضحاً للملف الفارغ', () => {
    expect(() => parseCsv('')).toThrow(CsvParseError);
    expect(() => parseCsv('   \n  \n')).toThrow(CsvParseError);
  });

  it('يقبل ملفاً بترويسة فقط ويعيد صفوفاً فارغة', () => {
    const table = parseCsv('Date,Description,Amount');

    expect(table.headers).toEqual(['Date', 'Description', 'Amount']);
    expect(table.rows).toEqual([]);
  });

  it('يرمي خطأ حين تكون كل أسماء الأعمدة فارغة', () => {
    expect(() => parseCsv(',,\n1,2,3')).toThrow(CsvParseError);
  });
});
