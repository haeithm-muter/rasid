/**
 * محوّل بنك الإمارات دبي الوطني — كشف إنجليزي بعمودي مدين/دائن.
 *
 * شكل الملف النموذجي:
 * ```csv
 * Date,Narrative,Debit Amount,Credit Amount,Currency
 * 03/04/2024,POS SPOTIFY AB STOCKHOLM,"1,234.50",,AED
 * ```
 * الخصائص المميّزة: تاريخ `DD/MM/YYYY` (خلافاً للنمط الأمريكي رغم كون
 * الترويسة إنجليزية)، وعمودان منفصلان للمبلغ مع فواصل آلاف.
 */

import { createBankAdapter } from './createBankAdapter';

export default createBankAdapter({
  id: 'enbd',
  label: 'بنك الإمارات دبي الوطني (Emirates NBD)',
  dateFormat: 'DD/MM/YYYY',
  defaultCurrency: 'AED',
  columns: {
    date: ['Date', 'Transaction Date', 'Value Date', 'Booking Date'],
    description: ['Narrative', 'Description', 'Transaction Details', 'Details'],
    currency: ['Currency', 'Ccy'],
  },
  amount: {
    kind: 'split',
    debit: ['Debit Amount', 'Debit', 'Withdrawal', 'Money Out'],
    credit: ['Credit Amount', 'Credit', 'Deposit', 'Money In'],
  },
});
