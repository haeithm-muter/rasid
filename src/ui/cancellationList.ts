/**
 * بناء ملف "قائمة الإلغاء" النصّي وتنزيله.
 *
 * البناء (`buildCancellationList`) دالة نقية تأخذ النصوص والمنسّقات كوسائط،
 * فتُختبر في Node بلا متصفح. التنزيل (`downloadTextFile`) هو الجزء الوحيد الذي
 * يلمس المتصفح، وهو أربعة أسطر معزولة.
 *
 * **لماذا نص عادي لا PDF ولا CSV؟** لأن الغرض من هذا الملف أن يُفتح على الهاتف
 * بجانب تطبيق البنك ويُشطب منه بنداً بنداً. النص العادي يُفتح في كل مكان بلا
 * تطبيق ولا مكتبة توليد.
 */

import type { DecidedSubscription, DecisionSummary } from '../core/decision';
import type { Locale, Strings } from './i18n';
import { formatCurrency, formatDate, todayIso } from './format';

/** ما يحتاجه بناء الملف من سياق العرض. */
export type CancellationListContext = {
  strings: Strings;
  locale: Locale;
  summary: DecisionSummary;
  /** تاريخ الإصدار بصيغة ISO؛ يُحقن في الاختبارات. */
  today?: string;
};

/** يبني سطر بند واحد. */
function itemLine(
  item: DecidedSubscription,
  strings: Strings,
  locale: Locale,
  index: number,
): string[] {
  const { candidate } = item;
  const cycle =
    strings.cycles[candidate.periodicity.cycle as keyof Strings['cycles']] ??
    candidate.periodicity.label;

  const lines = [
    `${index}. ${candidate.merchant}`,
    `    ${formatCurrency(candidate.typicalAmount, candidate.currency, locale)} — ${cycle} — ` +
      `${formatDate(candidate.firstDate, locale)} → ${formatDate(candidate.lastDate, locale)} — ` +
      `${formatCurrency(item.monthly, candidate.currency, locale)}/${strings.results.perMonth}`,
  ];

  const notes = candidate.flags.map((flag) => strings.flags[flag]).filter((note) => note !== '');
  if (notes.length > 0) lines.push(strings.exportFile.itemNote(notes.join('، ')));

  return lines;
}

/**
 * يبني محتوى ملف قائمة الإلغاء.
 *
 * الاشتراكات مرتّبة بالكلفة الشهرية تنازلياً (كما في `summarizeDecision`) لأن
 * من يقرأ القائمة يريد أن يبدأ بالأغلى.
 *
 * @param context النصوص واللغة والملخّص
 * @returns محتوى الملف النصّي كاملاً
 */
export function buildCancellationList(context: CancellationListContext): string {
  const { strings, locale, summary } = context;
  const lines: string[] = [
    strings.exportFile.heading,
    '='.repeat(strings.exportFile.heading.length),
    '',
    strings.exportFile.generatedOn(formatDate(context.today ?? todayIso(), locale)),
    strings.exportFile.generatedBy,
    '',
  ];

  for (const total of summary.totals) {
    lines.push(
      strings.exportFile.totalsLine(
        formatCurrency(total.monthly, total.currency, locale),
        formatCurrency(total.annual, total.currency, locale),
      ),
    );
  }

  lines.push('', strings.exportFile.columnsLine, '-'.repeat(60), '');

  summary.accepted.forEach((item, index) => {
    lines.push(...itemLine(item, strings, locale, index + 1), '');
  });

  lines.push('-'.repeat(60), strings.exportFile.disclaimer, '');

  return lines.join('\n');
}

/**
 * ينزّل نصاً كملف على جهاز المستخدم.
 *
 * `URL.createObjectURL` ينشئ رابطاً محلياً (`blob:`) داخل الصفحة نفسها — لا
 * يغادر شيء الجهاز ولا يُنشأ أي طلب شبكة. التحرير بعد النقر ضروري وإلا بقي
 * محتوى الملف في الذاكرة حتى إغلاق التبويب.
 *
 * @param content محتوى الملف
 * @param fileName اسم الملف المقترح
 */
export function downloadTextFile(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  URL.revokeObjectURL(url);
}
