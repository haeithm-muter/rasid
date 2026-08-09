/**
 * رسم توزيع الكلفة الشهرية — أعمدة CSS خالصة بلا أي مكتبة رسوم.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * لماذا بلا مكتبة
 * ═══════════════════════════════════════════════════════════════════════════
 * المطلوب مقارنة أطوال، وهذا ما يفعله `width: %` تماماً. أصغر مكتبة رسوم تضيف
 * عشرات الكيلوبايتات إلى حزمة يُفترض أن تُحمَّل مرة وتعمل بلا شبكة، مقابل
 * إمكانات (محاور، تكبير، تلميحات) لا يحتاجها عمود أفقي واحد.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * وإمكانية الوصول
 * ═══════════════════════════════════════════════════════════════════════════
 * الرسم قائمة تعريف (`dl`) لا صورة: كل عمود اسمٌ ورقمٌ ونسبةٌ مكتوبة بجانبه،
 * فقارئ الشاشة يقرأ البيانات نفسها لا "رسم بياني". الطول البصري إضافة للعين،
 * لا حاملٌ وحيد للمعنى — نفس المبدأ في `ConfidenceBadge`.
 */

import type { ReactElement } from 'react';
import type { DecidedSubscription } from '../core/decision';
import { formatCurrency, formatPercent } from './format';
import type { Locale, Strings } from './i18n';

/** ▲ ثابت عرض ▲ عدد الأعمدة قبل تجميع الباقي في عمود واحد. */
const MAX_BARS = 8;

/** خصائص الرسم. */
export type CostChartProps = {
  /** الاشتراكات المقبولة مرتّبة بالكلفة الشهرية تنازلياً. */
  items: readonly DecidedSubscription[];
  strings: Strings;
  locale: Locale;
};

/** عمود واحد جاهز للرسم. */
type Bar = { key: string; label: string; monthly: number; currency: string };

/**
 * يعرض الكلفة الشهرية موزّعة على التجّار.
 *
 * @param props الاشتراكات والنصوص
 * @returns الرسم، أو `null` إذا لم يوجد ما يُرسم
 */
export function CostChart({ items, strings, locale }: CostChartProps): ReactElement | null {
  if (items.length === 0) return null;

  const total = items.reduce((sum, item) => sum + item.monthly, 0);
  if (total <= 0) return null;

  const head = items.slice(0, MAX_BARS);
  const tail = items.slice(MAX_BARS);

  const bars: Bar[] = head.map((item) => ({
    key: `${item.candidate.merchant}-${item.candidate.currency}`,
    label: item.candidate.merchant,
    monthly: item.monthly,
    currency: item.candidate.currency,
  }));

  if (tail.length > 0) {
    bars.push({
      key: '__others__',
      label: strings.chart.others(tail.length),
      monthly: tail.reduce((sum, item) => sum + item.monthly, 0),
      currency: (tail[0] as DecidedSubscription).candidate.currency,
    });
  }

  const largest = Math.max(...bars.map((bar) => bar.monthly));

  return (
    <section className="chart" aria-labelledby="chart-title">
      <h2 id="chart-title" className="section__title">
        {strings.chart.title}
      </h2>
      <p className="section__subtitle">{strings.chart.subtitle}</p>

      <dl className="chart__list">
        {bars.map((bar) => {
          const share = bar.monthly / total;
          return (
            <div className="chart__row" key={bar.key}>
              <dt className="chart__label">{bar.label}</dt>
              <dd className="chart__data">
                {/* المسار يأخذ المساحة المتبقية، والعمود نسبة منه — بهذا لا
                    يزاحم العمودُ الرقمَ مهما ضاقت الشاشة */}
                <span className="chart__track">
                  <span
                    className="chart__bar"
                    /* النسبة إلى الأكبر لا إلى المجموع: تملأ المساحة فيتضح الفرق */
                    style={{ inlineSize: `${Math.max(2, (bar.monthly / largest) * 100)}%` }}
                  />
                </span>
                <span className="chart__value">
                  {formatCurrency(bar.monthly, bar.currency, locale)}
                  <span className="chart__share">
                    {' '}
                    {strings.chart.shareOfTotal(formatPercent(share, locale))}
                  </span>
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
