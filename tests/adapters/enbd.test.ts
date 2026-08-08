import { describe, expect, it } from 'vitest';
import enbd from '../../src/adapters/enbd.adapter';
import { parseCsv } from '../../src/core/csv';

/** يقرأ نص CSV ويمرّره على المحوّل. */
function run(csv: string) {
  return enbd.parse(parseCsv(csv).rows);
}

describe('محوّل الإمارات دبي الوطني', () => {
  it('يطابق الترويسة الإنجليزية بعمودي Debit/Credit', () => {
    expect(
      enbd.match(['Date', 'Narrative', 'Debit Amount', 'Credit Amount', 'Currency']),
    ).toBeGreaterThan(0);
  });

  it('لا يطابق ترويسة بعمود Amount واحد', () => {
    expect(enbd.match(['Transaction Date', 'Description', 'Amount'])).toBe(0);
  });

  it('يفسّر التاريخ DD/MM/YYYY رغم الترويسة الإنجليزية', () => {
    const { transactions, skipped } = run(
      'Date,Narrative,Debit Amount,Credit Amount,Currency\n03/04/2024,POS SPOTIFY AB STOCKHOLM,"1,234.50",,AED',
    );

    expect(skipped).toHaveLength(0);
    expect(transactions).toEqual([
      {
        date: '2024-04-03',
        description: 'POS SPOTIFY AB STOCKHOLM',
        amount: 1234.5,
        currency: 'AED',
        direction: 'debit',
      },
    ]);
  });

  it('يحوّل عمود Credit Amount إلى إيداع', () => {
    const { transactions } = run(
      'Date,Narrative,Debit Amount,Credit Amount,Currency\n28/02/2024,SALARY TRANSFER,,"18,000.00",AED',
    );

    expect(transactions[0]).toMatchObject({
      date: '2024-02-28',
      amount: 18000,
      direction: 'credit',
    });
  });

  it('يستخدم العملة الافتراضية AED حين لا يوجد عمود عملة', () => {
    const { transactions } = run(
      'Date,Narrative,Debit Amount,Credit Amount\n03/04/2024,CAREEM RIDE,25.00,',
    );

    expect(transactions[0]?.currency).toBe('AED');
  });
});
