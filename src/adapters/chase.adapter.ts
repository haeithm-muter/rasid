/**
 * محوّل النمط الأمريكي (Chase / Bank of America) — عمود مبلغ واحد مُشار.
 *
 * شكل الملف النموذجي:
 * ```csv
 * Transaction Date,Description,Amount,Type
 * 04/03/2024,NETFLIX.COM 866-579-7172 CA,-$15.49,DEBIT
 * ```
 * الخصائص المميّزة: تاريخ `MM/DD/YYYY` (النمط الأمريكي)، رمز `$` داخل الخلية،
 * والأقواس للسالب في بعض التصديرات `(15.49)`.
 */

import { createBankAdapter } from './createBankAdapter';

export default createBankAdapter({
  id: 'chase',
  label: 'النمط الأمريكي — Chase / Bank of America',
  dateFormat: 'MM/DD/YYYY',
  defaultCurrency: 'USD',
  columns: {
    date: ['Transaction Date', 'Posting Date', 'Post Date', 'Date'],
    description: ['Description', 'Merchant', 'Transaction Description', 'Payee'],
    currency: ['Currency'],
  },
  amount: {
    kind: 'signed',
    amount: ['Amount', 'Transaction Amount'],
    direction: ['Type', 'Transaction Type'],
  },
});
