/**
 * البطاقات العلوية: الكلفة الشهرية، السنوية المتوقعة، وعدد الاشتراكات.
 *
 * العملات مفصولة لا مجموعة: البطاقة تعرض العملة الأكبر كلفةً بارزةً، وبقية
 * العملات في سطر أصغر تحتها. جمعها في رقم واحد يحتاج سعر صرف من الشبكة، وهو
 * ممنوع في هذا المشروع — والرقمان الصادقان أفضل من واحد مخترَع.
 */

import type { ReactElement } from 'react';
import type { DecisionSummary } from '../core/decision';
import { formatCurrency, formatNumber } from './format';
import type { Locale, Strings } from './i18n';

/** خصائص البطاقات. */
export type SummaryCardsProps = {
  summary: DecisionSummary;
  strings: Strings;
  locale: Locale;
};

/**
 * يعرض ملخّص الكلفة في ثلاث بطاقات.
 *
 * @param props الملخّص والنصوص
 * @returns شبكة البطاقات
 */
export function SummaryCards({ summary, strings, locale }: SummaryCardsProps): ReactElement {
  const primary = summary.totals[0];
  const others = summary.totals.slice(1);

  return (
    <div className="cards">
      <article className="card card--accent">
        <p className="card__label">{strings.results.monthlyTotal}</p>
        <p className="card__value">
          {primary === undefined
            ? formatNumber(0, locale)
            : formatCurrency(primary.monthly, primary.currency, locale)}
        </p>
        {others.length > 0 && (
          <p className="card__note">
            {strings.results.otherCurrencies}:{' '}
            {others
              .map((total) => formatCurrency(total.monthly, total.currency, locale))
              .join(' · ')}
          </p>
        )}
      </article>

      <article className="card">
        <p className="card__label">{strings.results.annualTotal}</p>
        <p className="card__value">
          {primary === undefined
            ? formatNumber(0, locale)
            : formatCurrency(primary.annual, primary.currency, locale)}
        </p>
        {others.length > 0 && (
          <p className="card__note">
            {strings.results.otherCurrencies}:{' '}
            {others.map((total) => formatCurrency(total.annual, total.currency, locale)).join(' · ')}
          </p>
        )}
      </article>

      <article className="card">
        <p className="card__label">{strings.results.subscriptionCount}</p>
        <p className="card__value">{formatNumber(summary.count, locale)}</p>
      </article>
    </div>
  );
}
