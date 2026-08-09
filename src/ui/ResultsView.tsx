/**
 * شاشة النتائج: البطاقات، الرسم، الجدول، وقسم الرسوم غير الاشتراكية.
 *
 * ترتيب الأقسام مقصود ويتبع سؤال المستخدم لا بنية البيانات: **كم؟** (البطاقات)
 * ثم **أين يذهب؟** (الرسم) ثم **ما هي بالضبط؟** (الجدول) ثم **وماذا استبعدتم
 * ولماذا؟** (الرسوم الدورية غير الاشتراكية). الأخير في آخر الصفحة لا محذوف،
 * لأن إخفاء ما استبعدناه يجعل المستخدم يتساءل عمّا لم نعرضه.
 */

import type { ReactElement } from 'react';
import type { AnalysisResult } from '../core/analyze';
import { formatCurrency, formatDate, formatNumber } from './format';
import type { Locale, Strings } from './i18n';
import { CostChart } from './CostChart';
import { SubscriptionTable } from './SubscriptionTable';
import { SummaryCards } from './SummaryCards';
import { buildCancellationList, downloadTextFile } from './cancellationList';

/** خصائص شاشة النتائج. */
export type ResultsViewProps = {
  result: AnalysisResult;
  strings: Strings;
  locale: Locale;
  /** العودة إلى شاشة الاستقبال. */
  onReset: () => void;
};

/**
 * شاشة النتائج.
 *
 * @param props النتيجة والنصوص والإجراءات
 * @returns الشاشة
 */
export function ResultsView({ result, strings, locale, onReset }: ResultsViewProps): ReactElement {
  const { summary } = result;

  function exportList(): void {
    downloadTextFile(
      buildCancellationList({ strings, locale, summary }),
      strings.exportFile.fileName,
    );
  }

  return (
    <section className="results">
      <header className="results__header">
        <div>
          <h1 className="results__title">{strings.results.title}</h1>
          <p className="results__meta">
            {result.firstDate !== null && result.lastDate !== null
              ? strings.results.fileSummary(
                  result.transactionCount,
                  formatDate(result.firstDate, locale),
                  formatDate(result.lastDate, locale),
                )
              : formatNumber(result.transactionCount, locale)}
            {' · '}
            {strings.results.adapterUsed(result.adapterLabel)}
            {result.skippedRows.length > 0 && (
              <> {' · '}{strings.results.skippedRows(result.skippedRows.length)}</>
            )}
          </p>
        </div>

        <div className="results__actions">
          {summary.accepted.length > 0 && (
            <button type="button" className="button" onClick={exportList}>
              {strings.results.exportList}
            </button>
          )}
          <button type="button" className="button button--ghost" onClick={onReset}>
            {strings.results.startOver}
          </button>
        </div>
      </header>

      <SummaryCards summary={summary} strings={strings} locale={locale} />

      {summary.totals.length > 1 && <p className="note">{strings.results.currencyNote}</p>}

      {summary.accepted.length === 0 ? (
        <div className="empty">
          <p className="empty__title">{strings.results.empty}</p>
          <p className="empty__hint">{strings.results.emptyHint}</p>
        </div>
      ) : (
        <>
          <CostChart items={summary.accepted} strings={strings} locale={locale} />
          <SubscriptionTable items={summary.accepted} strings={strings} locale={locale} />
        </>
      )}

      {summary.flaggedCategories.length > 0 && (
        <section className="categories" aria-labelledby="categories-title">
          <h2 id="categories-title" className="section__title">
            {strings.categories.title}
          </h2>
          <p className="section__subtitle">{strings.categories.hint}</p>
          <ul className="categories__list">
            {summary.flaggedCategories.map((item) => (
              <li key={`${item.candidate.merchant}-${item.candidate.currency}`}>
                <span className="categories__merchant">{item.candidate.merchant}</span>
                <span className="categories__amount">
                  {formatCurrency(
                    item.candidate.typicalAmount,
                    item.candidate.currency,
                    locale,
                  )}
                </span>
                {item.category !== null && (
                  <span className="tag tag--category">{strings.categories[item.category]}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
