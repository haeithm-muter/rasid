/**
 * شاشة المعالجة: شريط تقدّم يعكس مراحل حقيقية.
 *
 * كل قفزة في الشريط تقابل مرحلة انتهت فعلاً في العامل (`AnalysisStage`)، لا
 * رسماً متحرّكاً يوهم بالانشغال. اسم المرحلة معروض تحته للسبب نفسه: من ينتظر
 * يستحق أن يعرف ما الذي ينتظره.
 */

import type { ReactElement } from 'react';
import type { AnalysisStage } from '../core/analyze';
import { formatPercent } from './format';
import type { Locale, Strings } from './i18n';

/** خصائص شاشة المعالجة. */
export type ProcessingViewProps = {
  stage: AnalysisStage;
  ratio: number;
  strings: Strings;
  locale: Locale;
};

/**
 * شاشة التقدّم.
 *
 * @param props المرحلة والنسبة والنصوص
 * @returns الشاشة
 */
export function ProcessingView({
  stage,
  ratio,
  strings,
  locale,
}: ProcessingViewProps): ReactElement {
  const percentValue = Math.round(ratio * 100);

  return (
    <section className="processing">
      <h1 className="processing__title">{strings.processing.title}</h1>
      <p className="processing__subtitle">{strings.processing.subtitle}</p>

      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentValue}
        aria-label={strings.processing.stages[stage]}
      >
        <div className="progress__fill" style={{ inlineSize: `${percentValue}%` }} />
      </div>

      <p className="processing__stage">
        <span>{strings.processing.stages[stage]}</span>
        <span className="processing__percent">{formatPercent(ratio, locale)}</span>
      </p>
    </section>
  );
}
