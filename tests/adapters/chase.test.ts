import { describe, expect, it } from 'vitest';
import chase from '../../src/adapters/chase.adapter';
import { parseCsv } from '../../src/core/csv';

/** يقرأ نص CSV ويمرّره على المحوّل. */
function run(csv: string) {
  return chase.parse(parseCsv(csv).rows);
}

describe('محوّل النمط الأمريكي (Chase)', () => {
  it('يطابق الترويسة الإنجليزية بعمود Amount', () => {
    expect(chase.match(['Transaction Date', 'Description', 'Amount', 'Type'])).toBeGreaterThan(0);
  });

  it('لا يطابق ترويسة بعمودي Debit/Credit', () => {
    expect(chase.match(['Date', 'Narrative', 'Debit Amount', 'Credit Amount'])).toBe(0);
  });

  it('يفسّر التاريخ بالنمط الأمريكي MM/DD/YYYY وينظّف رمز $', () => {
    const { transactions, skipped } = run(
      'Transaction Date,Description,Amount,Type\n04/03/2024,NETFLIX.COM 866-579-7172 CA,-$15.49,DEBIT',
    );

    expect(skipped).toHaveLength(0);
    expect(transactions).toEqual([
      {
        date: '2024-04-03',
        description: 'NETFLIX.COM 866-579-7172 CA',
        amount: 15.49,
        currency: 'USD',
        direction: 'debit',
      },
    ]);
  });

  it('يقرأ الأقواس كخصم في التصدير المحاسبي', () => {
    const { transactions } = run(
      'Transaction Date,Description,Amount\n12/25/2024,SPOTIFY USA,"(1,199.00)"',
    );

    expect(transactions[0]).toMatchObject({
      date: '2024-12-25',
      amount: 1199,
      direction: 'debit',
    });
  });

  it('يقرأ الإيداع الموجب مع عمود Type', () => {
    const { transactions } = run(
      'Transaction Date,Description,Amount,Type\n01/15/2024,PAYROLL DEPOSIT,3500.00,CREDIT',
    );

    expect(transactions[0]).toMatchObject({ amount: 3500, direction: 'credit' });
  });

  it('يحترم عمود Currency حين يوجد', () => {
    const { transactions } = run(
      'Transaction Date,Description,Amount,Currency\n04/03/2024,AWS EMEA,-40.00,EUR',
    );

    expect(transactions[0]?.currency).toBe('EUR');
  });
});
