import { describe, expect, it } from 'vitest';
import alrajhi from '../../src/adapters/alrajhi.adapter';
import { parseCsv } from '../../src/core/csv';

/** يقرأ نص CSV ويمرّره على المحوّل، اختصاراً للتكرار في كل اختبار. */
function run(csv: string) {
  return alrajhi.parse(parseCsv(csv).rows);
}

describe('محوّل الراجحي', () => {
  it('يطابق الترويسة العربية بعمودي مدين/دائن', () => {
    expect(alrajhi.match(['التاريخ', 'البيان', 'مدين', 'دائن', 'العملة'])).toBeGreaterThan(0);
  });

  it('لا يطابق ترويسة بعمود مبلغ واحد', () => {
    expect(alrajhi.match(['تاريخ العملية', 'الوصف', 'المبلغ'])).toBe(0);
  });

  it('يحوّل صف مدين إلى عملية خصم بتاريخ DD/MM/YYYY', () => {
    const { transactions, skipped } = run(
      'التاريخ,البيان,مدين,دائن,العملة\n03/04/2024,شراء نقاط بيع - نتفلكس,56.00,,ر.س',
    );

    expect(skipped).toHaveLength(0);
    expect(transactions).toEqual([
      {
        date: '2024-04-03',
        description: 'شراء نقاط بيع - نتفلكس',
        amount: 56,
        currency: 'SAR',
        direction: 'debit',
      },
    ]);
  });

  it('يحوّل صف دائن إلى إيداع وينظّف فواصل الآلاف', () => {
    const { transactions } = run(
      'التاريخ,البيان,مدين,دائن,العملة\n25/12/2024,راتب شهر ديسمبر,,"12,500.75",ر.س',
    );

    expect(transactions[0]).toMatchObject({
      date: '2024-12-25',
      amount: 12500.75,
      direction: 'credit',
    });
  });

  it('يقرأ الأرقام الهندية والفواصل العربية داخل الخلايا', () => {
    const { transactions } = run(
      'التاريخ,البيان,مدين,دائن,العملة\n٠٣/٠٤/٢٠٢٤,اشتراك شاهد,"٤٬٢٠٠٫٥٠",,ر.س',
    );

    expect(transactions[0]).toMatchObject({ date: '2024-04-03', amount: 4200.5 });
  });

  it('يعتبر 0.00 في العمود غير المستخدم فراغاً لا مبلغاً', () => {
    const { transactions } = run(
      'التاريخ,البيان,مدين,دائن,العملة\n03/04/2024,اشتراك,56.00,0.00,ر.س',
    );

    expect(transactions[0]).toMatchObject({ amount: 56, direction: 'debit' });
  });

  it('يتخطّى الصف الذي امتلأ فيه العمودان معاً بدل تخمين الاتجاه', () => {
    const { transactions, skipped } = run(
      'التاريخ,البيان,مدين,دائن,العملة\n03/04/2024,صف غامض,56.00,10.00,ر.س',
    );

    expect(transactions).toHaveLength(0);
    expect(skipped[0]?.reason).toMatch(/غامض/);
  });

  it('يتخطّى الصف بلا مبلغ في العمودين', () => {
    const { skipped } = run('التاريخ,البيان,مدين,دائن,العملة\n03/04/2024,بلا مبلغ,,,ر.س');

    expect(skipped[0]?.reason).toMatch(/لا يوجد مبلغ/);
  });
});
