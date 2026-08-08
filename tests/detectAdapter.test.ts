import { describe, expect, it } from 'vitest';
import { adapters, createBankAdapter, detectAdapter, getAdapterById, listAdapters } from '../src/adapters';
import { AmbiguousAdapterError, NoMatchingAdapterError } from '../src/core/errors';
import { importCsvText } from '../src/core/importCsv';

describe('سجلّ المحوّلات', () => {
  it('يسجّل المحوّلات الأربعة تلقائياً بلا تعديل أي ملف', () => {
    expect(adapters.map((adapter) => adapter.id)).toEqual(['alrajhi', 'chase', 'enbd', 'snb']);
  });

  it('يعيد محوّلاً بمعرّفه للاختيار اليدوي', () => {
    expect(getAdapterById('chase')?.dateFormat).toBe('MM/DD/YYYY');
    expect(getAdapterById('لا-يوجد')).toBeUndefined();
  });

  it('يعرض قائمة الاختيار اليدوي بمعرّف واسم', () => {
    const list = listAdapters();

    expect(list).toHaveLength(4);
    expect(list.every((entry) => entry.label.length > 0)).toBe(true);
  });
});

describe('detectAdapter — الكشف التلقائي', () => {
  it('يتعرّف على الراجحي من ترويسته العربية', () => {
    expect(detectAdapter(['التاريخ', 'البيان', 'مدين', 'دائن', 'العملة']).id).toBe('alrajhi');
  });

  it('يتعرّف على الأهلي السعودي', () => {
    expect(detectAdapter(['تاريخ العملية', 'تفاصيل العملية', 'المبلغ', 'نوع العملية']).id).toBe(
      'snb',
    );
  });

  it('يتعرّف على النمط الأمريكي', () => {
    expect(detectAdapter(['Transaction Date', 'Description', 'Amount', 'Type']).id).toBe('chase');
  });

  it('يتعرّف على الإمارات دبي الوطني', () => {
    expect(detectAdapter(['Date', 'Narrative', 'Debit Amount', 'Credit Amount', 'Currency']).id).toBe(
      'enbd',
    );
  });

  it('لا يتأثّر بترتيب الأعمدة ولا بالمسافات الزائدة', () => {
    expect(detectAdapter(['  دائن ', 'البيان', 'مدين', ' التاريخ']).id).toBe('alrajhi');
  });

  it('يتجاهل الأعمدة الإضافية غير المعروفة', () => {
    expect(detectAdapter(['التاريخ', 'البيان', 'مدين', 'دائن', 'الرصيد', 'رقم المرجع']).id).toBe(
      'alrajhi',
    );
  });
});

describe('detectAdapter — الفشل المفهوم', () => {
  it('يرمي خطأً يحمل قائمة المحوّلات حين لا يطابق شيء', () => {
    expect(() => detectAdapter(['foo', 'bar'])).toThrow(NoMatchingAdapterError);

    try {
      detectAdapter(['foo', 'bar']);
      expect.unreachable('كان يجب أن يرمي خطأ');
    } catch (error) {
      expect(error).toBeInstanceOf(NoMatchingAdapterError);
      expect((error as NoMatchingAdapterError).candidates).toEqual([
        'alrajhi',
        'chase',
        'enbd',
        'snb',
      ]);
      expect((error as NoMatchingAdapterError).message).toMatch(/تعذّر التعرّف/);
    }
  });

  it('يرمي خطأً حين ينقص عمود المبلغ وحده', () => {
    expect(() => detectAdapter(['التاريخ', 'البيان'])).toThrow(NoMatchingAdapterError);
  });

  it('يرمي خطأ التباس حين يتعادل محوّلان', () => {
    const twin = (id: string) =>
      createBankAdapter({
        id,
        label: id,
        dateFormat: 'DD/MM/YYYY',
        defaultCurrency: 'SAR',
        columns: { date: ['Date'], description: ['Description'] },
        amount: { kind: 'signed', amount: ['Amount'] },
      });

    expect(() => detectAdapter(['Date', 'Description', 'Amount'], [twin('a'), twin('b')])).toThrow(
      AmbiguousAdapterError,
    );
  });

  it('يفضّل المحوّل الأكثر تخصّصاً بدل رمي خطأ التباس', () => {
    const generic = createBankAdapter({
      id: 'generic',
      label: 'generic',
      dateFormat: 'DD/MM/YYYY',
      defaultCurrency: 'SAR',
      columns: { date: ['Date'], description: ['Description'] },
      amount: { kind: 'signed', amount: ['Amount'] },
    });
    const specific = createBankAdapter({
      id: 'specific',
      label: 'specific',
      dateFormat: 'DD/MM/YYYY',
      defaultCurrency: 'SAR',
      columns: { date: ['Date'], description: ['Description'], currency: ['Currency'] },
      amount: { kind: 'signed', amount: ['Amount'], direction: ['Type'] },
    });

    expect(
      detectAdapter(['Date', 'Description', 'Amount', 'Currency', 'Type'], [generic, specific]).id,
    ).toBe('specific');
  });
});

describe('importCsvText — خط الاستيراد الكامل', () => {
  it('يكشف البنك ويحوّل الملف في خطوة واحدة', () => {
    const result = importCsvText(
      'التاريخ,البيان,مدين,دائن,العملة\n03/04/2024,اشتراك نتفلكس,56.00,,ر.س',
    );

    expect(result.adapter.id).toBe('alrajhi');
    expect(result.headers).toContain('البيان');
    expect(result.transactions[0]).toMatchObject({ date: '2024-04-03', amount: 56 });
  });

  it('يستخدم المحوّل المفروض يدوياً بلا مرور على الكشف التلقائي', () => {
    const result = importCsvText('Date,Description,Amount\n04/03/2024,NETFLIX,-15.49', {
      adapterId: 'chase',
    });

    expect(result.adapter.id).toBe('chase');
    // MM/DD/YYYY الخاصة بـ chase — لو فُسّرت DD/MM لأعطت 2024-03-04
    expect(result.transactions[0]?.date).toBe('2024-04-03');
  });

  it('يتخطّى كل الصفوف بسبب مفهوم حين يفرض المستخدم بنكاً خاطئاً', () => {
    const result = importCsvText('التاريخ,البيان,مدين,دائن\n03/04/2024,اشتراك,56.00,', {
      adapterId: 'snb',
    });

    expect(result.adapter.id).toBe('snb');
    expect(result.transactions).toHaveLength(0);
    expect(result.skipped[0]?.reason).toMatch(/الأعمدة المطلوبة لتنسيق snb غير موجودة/);
  });

  it('يرمي خطأً حين يكون المعرّف اليدوي غير معروف', () => {
    expect(() =>
      importCsvText('Date,Description,Amount\n04/03/2024,NETFLIX,-15.49', {
        adapterId: 'بنك-وهمي',
      }),
    ).toThrow(NoMatchingAdapterError);
  });
});
