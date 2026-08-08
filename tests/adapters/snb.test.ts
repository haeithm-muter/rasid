import { describe, expect, it } from 'vitest';
import snb from '../../src/adapters/snb.adapter';
import { parseCsv } from '../../src/core/csv';

/** يقرأ نص CSV ويمرّره على المحوّل. */
function run(csv: string) {
  return snb.parse(parseCsv(csv).rows);
}

describe('محوّل البنك الأهلي السعودي', () => {
  it('يطابق ترويسة عربية بعمود مبلغ واحد', () => {
    expect(snb.match(['تاريخ العملية', 'تفاصيل العملية', 'المبلغ', 'نوع العملية'])).toBeGreaterThan(
      0,
    );
  });

  it('لا يطابق ترويسة بعمودي مدين/دائن', () => {
    expect(snb.match(['التاريخ', 'البيان', 'مدين', 'دائن'])).toBe(0);
  });

  it('يقرأ تاريخ ISO ومبلغاً يحمل رمز العملة داخل الخلية', () => {
    const { transactions, skipped } = run(
      'تاريخ العملية,تفاصيل العملية,المبلغ,نوع العملية\n2024-04-03,مدى-شراء-جرير-الرياض-1234,"1,234.50 ر.س",مدين',
    );

    expect(skipped).toHaveLength(0);
    expect(transactions).toEqual([
      {
        date: '2024-04-03',
        description: 'مدى-شراء-جرير-الرياض-1234',
        amount: 1234.5,
        currency: 'SAR',
        direction: 'debit',
      },
    ]);
  });

  it('يعطي عمود "نوع العملية" الأولوية على إشارة الرقم', () => {
    const { transactions } = run(
      'تاريخ العملية,تفاصيل العملية,المبلغ,نوع العملية\n2024-04-03,استرداد,99.00,دائن\n2024-04-04,اشتراك,99.00,مدين',
    );

    expect(transactions[0]?.direction).toBe('credit');
    expect(transactions[1]?.direction).toBe('debit');
  });

  it('يرجع لإشارة الرقم حين لا يوجد عمود نوع العملية', () => {
    const { transactions } = run(
      'تاريخ العملية,تفاصيل العملية,المبلغ\n2024-04-03,اشتراك أبل,-29.99\n2024-04-05,تحويل وارد,500.00',
    );

    expect(transactions[0]).toMatchObject({ amount: 29.99, direction: 'debit' });
    expect(transactions[1]).toMatchObject({ amount: 500, direction: 'credit' });
  });

  it('يتخطّى الصف ذا التاريخ غير المتوافق مع صيغة البنك', () => {
    const { transactions, skipped } = run(
      'تاريخ العملية,تفاصيل العملية,المبلغ\n03/04/2024,تاريخ بصيغة أخرى,99.00',
    );

    expect(transactions).toHaveLength(0);
    expect(skipped[0]?.reason).toMatch(/تاريخ غير صالح/);
  });
});
