/**
 * تنسيق الأرقام والتواريخ والعملات حسب اللغة المعروضة.
 *
 * كل شيء هنا يعتمد على `Intl` المدمجة في المتصفح: لا مكتبة تنسيق، ولا جدول
 * أسماء شهور مكتوب يدوياً، **ولا طلب شبكة واحد** — `Intl` بيانات محلية داخل
 * المتصفح نفسه، وهذا ما يجعلها الخيار الوحيد المتوافق مع شرط "صفر شبكة".
 */

import type { Locale } from './i18n';

/**
 * سلاسل اللغة الممرَّرة إلى `Intl`.
 *
 * `-u-nu-latn` لاحقة مقصودة: بدونها تعرض `ar-SA` الأرقام الهندية-العربية
 * (٥٦٫٠٠)، وهي صحيحة لغوياً لكن تطبيقات البنوك في المنطقة تعرض الأرقام
 * اللاتينية، ومخالفة ما اعتاده المستخدم في سياق مالي تُبطئ قراءته.
 */
const INTL_LOCALES: Readonly<Record<Locale, string>> = {
  ar: 'ar-SA-u-nu-latn',
  en: 'en-US',
};

/** ذاكرة مؤقتة للمنسّقات — إنشاء `Intl.NumberFormat` مكلف نسبياً ويتكرّر كثيراً. */
const currencyCache = new Map<string, Intl.NumberFormat>();

/**
 * ينسّق مبلغاً بعملته.
 *
 * @param amount المبلغ
 * @param currency رمز ISO-4217
 * @param locale لغة العرض
 * @returns نص المبلغ مع رمز عملته
 */
export function formatCurrency(amount: number, currency: string, locale: Locale): string {
  const key = `${locale}:${currency}`;
  let formatter = currencyCache.get(key);

  if (formatter === undefined) {
    try {
      formatter = new Intl.NumberFormat(INTL_LOCALES[locale], {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      });
    } catch {
      // رمز عملة غير معروف لـ `Intl` — نعرضه كرقم متبوعاً بالرمز كما ورد
      formatter = new Intl.NumberFormat(INTL_LOCALES[locale], { maximumFractionDigits: 2 });
      currencyCache.set(key, formatter);
      return `${formatter.format(amount)} ${currency}`;
    }
    currencyCache.set(key, formatter);
  }

  return formatter.format(amount);
}

/**
 * ينسّق عدداً صحيحاً (عدد عمليات، عدد اشتراكات).
 *
 * @param value العدد
 * @param locale لغة العرض
 * @returns النص المنسّق
 */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALES[locale], { maximumFractionDigits: 1 }).format(value);
}

/**
 * ينسّق نسبة مئوية من كسر بين 0 و1.
 *
 * @param value الكسر
 * @param locale لغة العرض
 * @returns النسبة المئوية
 */
export function formatPercent(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALES[locale], {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * ينسّق تاريخ ISO `YYYY-MM-DD` بصيغة مقروءة.
 *
 * التاريخ يُبنى بـ `Date.UTC` لا بالمنشئ المحلي: `new Date('2024-03-01')` تُقرأ
 * كمنتصف ليل UTC ثم تُعرض بتوقيت الجهاز، فيظهر 29 فبراير لمن هو غرب غرينتش.
 *
 * @param isoDate التاريخ بصيغة ISO
 * @param locale لغة العرض
 * @returns التاريخ المنسّق، أو النص كما هو إن كان غير صالح
 */
export function formatDate(isoDate: string, locale: Locale): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (match === null) return isoDate;

  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(timestamp);
}

/**
 * تاريخ اليوم بصيغة ISO — يُستخدم في ترويسة ملف التصدير وحده.
 *
 * @returns `YYYY-MM-DD`
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
