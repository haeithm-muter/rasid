/**
 * وسم درجة الثقة.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * **لا يعتمد على اللون وحده** — شرط صريح في مواصفة الواجهة.
 * ═══════════════════════════════════════════════════════════════════════════
 * نحو 8% من الرجال لا يميّزون الأحمر عن الأخضر. لذلك تحمل كل درجة **ثلاث**
 * إشارات مستقلة، تكفي أيٌّ منها وحدها:
 *
 * 1. **نص صريح**: "ثقة عالية" / "متوسطة" / "منخفضة" — مكتوب لا مرمَّز
 * 2. **شكل**: ●●● / ●●○ / ●○○ — يُقرأ حتى بالأبيض والأسود
 * 3. **لون**: للقراءة السريعة لمن يراه، لا كحامل وحيد للمعنى
 *
 * والرقم نفسه معروض بجانبها لمن يريد الدقة بدل التصنيف.
 */

import type { ReactElement } from 'react';
import type { ConfidenceBand } from '../core/decision';
import { formatPercent } from './format';
import type { Locale, Strings } from './i18n';

/** خصائص الوسم. */
export type ConfidenceBadgeProps = {
  /** درجة الثقة الخام 0..1. */
  confidence: number;
  /** المستوى المحسوب في `decision.ts`. */
  band: ConfidenceBand;
  strings: Strings;
  locale: Locale;
};

/**
 * يعرض درجة الثقة بثلاث إشارات مستقلة.
 *
 * @param props الدرجة والمستوى والنصوص
 * @returns عنصر الوسم
 */
export function ConfidenceBadge({
  confidence,
  band,
  strings,
  locale,
}: ConfidenceBadgeProps): ReactElement {
  return (
    <span className={`badge badge--${band}`}>
      <span className="badge__mark" aria-hidden="true">
        {strings.confidence.marks[band]}
      </span>
      <span className="badge__text">
        <span className="badge__label">{strings.confidence[band]}</span>
        <span className="badge__value">{formatPercent(confidence, locale)}</span>
      </span>
    </span>
  );
}
