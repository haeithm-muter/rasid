/**
 * توحيد أسماء التجار: من وصف بنكي فوضوي إلى اسم تاجر واحد قابل للتجميع.
 *
 * المشكلة: البنك يكتب نفس التاجر بعشرة أشكال مختلفة —
 * `POS NETFLIX.COM*4423`، `NETFLIX.COM AMSTERDAM NL`، `NETFLIX.COM 866-579-7172 CA`.
 * محرك الكشف في الجزء 2 لن يرى تكراراً شهرياً إلا إذا اجتمعت هذه الأشكال في
 * مجموعة واحدة.
 *
 * الحل على ثلاث مراحل:
 * 1. `cleanDescription` — حذف الضجيج (أرقام مرجعية، مدن، رموز نقاط بيع...)
 * 2. `levenshtein` — قياس التشابه بين ما تبقّى (مطوّرة هنا من الصفر)
 * 3. `clusterDescriptions` — تجميع المتشابه بعتبة قابلة للمعايرة
 */

import { normalizeForComparison } from './text';
import type { Transaction } from './types';

/**
 * ▲ عتبة المعايرة الأساسية ▲
 *
 * نسبة التشابه (0..1) التي يُعتبر عندها وصفان لنفس التاجر.
 * - رفعها → مجموعات أنقى لكن تفويت أشكال متباعدة لنفس التاجر
 * - خفضها → دمج أوسع لكن خطر خلط تجّار مختلفين
 *
 * 0.82 تعني عملياً: اسم من 6 أحرف يحتمل خطأ حرف واحد، ومن 12 حرفاً يحتمل حرفين.
 * عايِرها من هنا وحدها — لا تنثر أرقاماً سحرية في بقية الملف.
 */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.82;

/** لاحقات النطاقات التي تُحذف من أسماء المواقع (`NETFLIX.COM` → `NETFLIX`). */
const TLD_SUFFIX = /\.(COM|NET|ORG|CO|IO|APP|ME|INFO|BIZ|SA|AE|EG|UK)(?![A-Z])/g;

/** كل ما يفصل الكلمات في أوصاف البنوك: نجوم، شرطات، شرطات مائلة، أقواس... */
const SEPARATORS = /[*_#/\\|+,.\-–—:;()[\]{}"'@&~^<>=!?]+/g;

/**
 * مصطلحات نقاط البيع والدفع التي لا تحمل هوية التاجر.
 * تُقارن على مستوى الكلمة الكاملة (لا الاحتواء) حتى لا تبتلع `CARD` كلمة `CARDIFF`.
 */
const PAYMENT_NOISE: readonly string[] = [
  // إنجليزي
  'POS', 'PURCHASE', 'PUR', 'PAYMENT', 'PAYMENTS', 'PMT', 'CARD', 'DEBIT', 'CREDIT',
  'TRANSACTION', 'TRANS', 'TRN', 'TXN', 'REF', 'REFERENCE', 'ID', 'NO', 'AUTH',
  'APPROVAL', 'VISA', 'MASTERCARD', 'MC', 'MADA', 'ATM', 'WITHDRAWAL', 'TRANSFER',
  'RECURRING', 'AUTOPAY', 'ONLINE', 'INTERNET', 'ECOM', 'ECOMMERCE', 'MERCHANT',
  'TO', 'FROM', 'VIA', 'WWW', 'HTTP', 'HTTPS', 'HELP', 'SUPPORT',
  // عربي
  'شراء', 'مشتريات', 'نقاط', 'بيع', 'نقطة', 'مدى', 'عملية', 'حركة', 'سداد',
  'تحويل', 'حوالة', 'خصم', 'بطاقة', 'ائتمان', 'مباشر', 'إنترنت', 'صراف', 'سحب',
  'دفع', 'مرجع', 'رقم', 'من', 'إلى', 'عبر',
];

/** لواحق الكيانات القانونية — جزء من الاسم الرسمي لا من هوية التاجر. */
const LEGAL_SUFFIXES: readonly string[] = [
  'LLC', 'LTD', 'LIMITED', 'INC', 'INCORPORATED', 'PLC', 'GMBH', 'BV', 'NV',
  'AB', 'AS', 'SARL', 'SPA', 'PTE', 'PTY', 'CORP', 'COMPANY',
  'شركة', 'مؤسسة', 'مؤسسه', 'المحدودة', 'محدودة',
];

/**
 * مدن ودول تُلحق بالوصف كموقع الفرع.
 * ملاحظة: `SA` و`CA` ونظائرها رموز مواقع في هذا السياق، وحذفها مقصود.
 */
const LOCATION_NOISE: readonly string[] = [
  // رموز الدول
  'SA', 'AE', 'US', 'USA', 'GB', 'UK', 'NL', 'SE', 'IE', 'LU', 'DE', 'FR', 'EG',
  'KW', 'BH', 'QA', 'OM', 'JO', 'CA', 'TR', 'CN', 'JP', 'AU', 'ES', 'CH', 'SG', 'HK',
  // مدن بالإنجليزية
  'RIYADH', 'JEDDAH', 'DAMMAM', 'KHOBAR', 'ALKHOBAR', 'MAKKAH', 'MECCA', 'MADINAH',
  'MEDINA', 'TAIF', 'ABHA', 'TABUK', 'JUBAIL', 'YANBU', 'DUBAI', 'ABUDHABI',
  'SHARJAH', 'AJMAN', 'DOHA', 'KUWAIT', 'MANAMA', 'MUSCAT', 'CAIRO', 'AMMAN',
  'BEIRUT', 'LONDON', 'AMSTERDAM', 'STOCKHOLM', 'SEATTLE', 'DUBLIN', 'LUXEMBOURG',
  'SINGAPORE', 'PARIS', 'BERLIN', 'TOKYO', 'SYDNEY', 'TORONTO',
  // مدن ودول بالعربية
  'الرياض', 'جدة', 'الدمام', 'الخبر', 'مكة', 'المدينة', 'المنورة', 'الطائف',
  'أبها', 'تبوك', 'الجبيل', 'ينبع', 'دبي', 'أبوظبي', 'الشارقة', 'عجمان',
  'الدوحة', 'الكويت', 'المنامة', 'مسقط', 'القاهرة', 'بيروت', 'السعودية', 'الإمارات',
];

/**
 * كل كلمات الضجيج مطبَّعة مسبقاً.
 * التطبيع ضروري: `مدى` تصبح `مدي` و`عملية` تصبح `عمليه` بعد توحيد الحروف،
 * فلو قارنّا بالنص الخام لما تطابق شيء.
 */
const NOISE_TOKENS: ReadonlySet<string> = new Set(
  [...PAYMENT_NOISE, ...LEGAL_SUFFIXES, ...LOCATION_NOISE].map((token) =>
    normalizeForComparison(token),
  ),
);

/**
 * هل هذه الكلمة رقم مرجعي أو رمز عملية لا هوية له؟
 *
 * القواعد: رقم صرف من خانتين فأكثر، أو أي رمز يحوي ثلاثة أرقام فأكثر
 * (`P123456789`، `1A2B3C`)، أو قناع بطاقة (`XXXX1234`).
 * الأرقام المفردة تبقى لأنها قد تكون جزءاً من الاسم (`7 ELEVEN`، `3M`).
 *
 * @param token كلمة واحدة بعد التطبيع
 * @returns `true` إذا كانت رقماً مرجعياً يجب حذفه
 */
function isReferenceToken(token: string): boolean {
  if (/^\d{2,}$/.test(token)) return true;
  if ((token.match(/\d/g) ?? []).length >= 3) return true;
  if (/^X{3,}\d*$/.test(token)) return true;
  return false;
}

/**
 * ينظّف وصفاً بنكياً خاماً ويستخرج منه اسم التاجر وحده.
 *
 * خطوات التنظيف بالترتيب:
 * 1. تطبيع عام (أرقام هندية، تشكيل، همزات، حروف كبيرة، مسافات)
 * 2. حذف لاحقات النطاقات (`NETFLIX.COM` → `NETFLIX`)
 * 3. تحويل كل الفواصل (`*` `-` `/` `#` ...) إلى مسافات
 * 4. حذف كلمات الضجيج: رموز نقاط البيع، الكيانات القانونية، المدن والدول
 * 5. حذف الأرقام المرجعية وأقنعة البطاقات
 * 6. حذف تكرار الكلمة نفسها (`UBER TRIP UBER` → `UBER TRIP`)
 *
 * إذا ابتلع التنظيف الوصف كاملاً، نعيد النص المطبَّع بدل نص فارغ — اسم مزعج
 * أفضل من فقدان العملية.
 *
 * @param raw الوصف كما ورد في كشف الحساب
 * @returns اسم التاجر المنظّف بحروف كبيرة
 */
export function cleanDescription(raw: string): string {
  const base = normalizeForComparison(raw);
  if (base === '') return '';

  const tokens = base
    .replace(TLD_SUFFIX, '')
    .replace(SEPARATORS, ' ')
    .split(' ')
    .filter((token) => token !== '')
    .filter((token) => !NOISE_TOKENS.has(token) && !isReferenceToken(token));

  const deduped: string[] = [];
  for (const token of tokens) {
    if (!deduped.includes(token)) deduped.push(token);
  }

  const cleaned = deduped.join(' ');
  return cleaned === '' ? base : cleaned;
}

/**
 * مسافة ليفنشتاين — أقل عدد من الإضافات والحذوفات والاستبدالات لتحويل نص لآخر.
 * مطوّرة هنا من الصفر بلا أي مكتبة خارجية.
 *
 * التنفيذ بصفّين فقط بدل مصفوفة كاملة: الذاكرة `O(min(m,n))` والزمن `O(m·n)`.
 * `maxDistance` يقصّ الحساب مبكراً حين تتجاوز المسافة ما يهمّنا — وهو ما يجعل
 * تجميع آلاف الأوصاف عملياً.
 *
 * @param a النص الأول
 * @param b النص الثاني
 * @param maxDistance أقصى مسافة تهمّنا؛ عند تجاوزها يعود `maxDistance + 1`
 * @returns المسافة بين النصين
 */
export function levenshtein(a: string, b: string, maxDistance: number = Infinity): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  // نجعل النص الأقصر هو الأفقي لتصغير حجم الصف
  const source = a.length >= b.length ? a : b;
  const target = a.length >= b.length ? b : a;

  let previous: number[] = Array.from({ length: target.length + 1 }, (_, index) => index);
  let current: number[] = new Array<number>(target.length + 1).fill(0);

  for (let i = 1; i <= source.length; i += 1) {
    current[0] = i;
    let rowMinimum = i;
    const sourceChar = source[i - 1];

    for (let j = 1; j <= target.length; j += 1) {
      const substitutionCost = sourceChar === target[j - 1] ? 0 : 1;
      const value = Math.min(
        (current[j - 1] as number) + 1, // إدراج
        (previous[j] as number) + 1, // حذف
        (previous[j - 1] as number) + substitutionCost, // استبدال
      );
      current[j] = value;
      if (value < rowMinimum) rowMinimum = value;
    }

    // كل قيم هذا الصف تجاوزت الحد → لا أمل في النزول تحته لاحقاً
    if (rowMinimum > maxDistance) return maxDistance + 1;

    const swap = previous;
    previous = current;
    current = swap;
  }

  return previous[target.length] as number;
}

/**
 * نسبة التشابه بين نصين: 1 = متطابقان، 0 = لا يشتركان في شيء.
 *
 * @param a النص الأول
 * @param b النص الثاني
 * @returns نسبة بين 0 و1
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}

/**
 * هل النصان متشابهان بما يكفي حسب العتبة؟
 * يستخدم القصّ المبكر بدل حساب المسافة كاملة — أسرع بكثير على قوائم طويلة.
 *
 * @param a النص الأول
 * @param b النص الثاني
 * @param threshold عتبة التشابه (0..1)
 * @returns `true` إذا بلغ التشابه العتبة
 */
export function areSimilar(a: string, b: string, threshold: number): boolean {
  if (a === b) return true;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return true;

  const allowedDistance = Math.floor(longest * (1 - threshold));
  if (Math.abs(a.length - b.length) > allowedDistance) return false;

  return levenshtein(a, b, allowedDistance) <= allowedDistance;
}

/** شكل أصلي واحد لوصف تاجر، محفوظ للتحقق اليدوي في الواجهة. */
export type MerchantVariant = {
  /** الوصف كما ورد حرفياً في كشف الحساب. */
  raw: string;
  /** الوصف بعد التنظيف. */
  cleaned: string;
  /** كم مرة ظهر هذا الشكل بالضبط. */
  count: number;
};

/** مجموعة أوصاف تنتمي لتاجر واحد. */
export type MerchantCluster = {
  /**
   * الاسم الموحّد المعروض — تنظيف أكثر الأشكال تكراراً.
   * فريد داخل النتيجة الواحدة، فيصلح مفتاحاً في الجزء 2.
   */
  canonical: string;
  /** كل الأوصاف الأصلية داخل المجموعة، مرتّبة بالأكثر تكراراً. */
  variants: MerchantVariant[];
  /** مجموع ظهور كل الأشكال. */
  count: number;
};

/** خيارات التجميع. */
export type ClusterOptions = {
  /** عتبة التشابه؛ الافتراضي `DEFAULT_SIMILARITY_THRESHOLD`. */
  threshold?: number;
};

/**
 * يجمّع أوصاف العمليات في مجموعات تاجر واحد.
 *
 * الخوارزمية "قائد ومنضمّون" (leader clustering) لا الربط الأحادي:
 * نرتّب الأشكال بالأكثر تكراراً، ونقارن كل شكل بقائد كل مجموعة قائمة فقط.
 * هذا يمنع التسلسل (A تشبه B، وB تشبه C، فتبتلع مجموعة واحدة تجّاراً متباعدين)
 * ويجعل الاسم الموحّد دائماً هو الأكثر شيوعاً لا أول ما صادفناه.
 *
 * كل الأوصاف الأصلية تُحفظ في `variants` — لا شيء يُفقد، والمستخدم يستطيع
 * مراجعة كل مجموعة يدوياً في الواجهة.
 *
 * @param descriptions أوصاف العمليات الخام (يجوز تكرارها)
 * @param options خيارات التجميع (العتبة)
 * @returns المجموعات مرتّبة بالأكثر ظهوراً
 */
export function clusterDescriptions(
  descriptions: readonly string[],
  options: ClusterOptions = {},
): MerchantCluster[] {
  const threshold = options.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;

  // 1) عدّ التكرار الحرفي لكل وصف
  const rawCounts = new Map<string, number>();
  for (const description of descriptions) {
    rawCounts.set(description, (rawCounts.get(description) ?? 0) + 1);
  }

  // 2) تجميع سريع بالتطابق التام بعد التنظيف
  const seeds = new Map<string, { key: string; count: number; variants: MerchantVariant[] }>();
  for (const [raw, count] of rawCounts) {
    const cleaned = cleanDescription(raw);
    const seed = seeds.get(cleaned);
    if (seed === undefined) {
      seeds.set(cleaned, { key: cleaned, count, variants: [{ raw, cleaned, count }] });
    } else {
      seed.count += count;
      seed.variants.push({ raw, cleaned, count });
    }
  }

  // 3) ترتيب حتمي: الأكثر تكراراً أولاً، ثم أبجدياً عند التساوي
  const sortedSeeds = [...seeds.values()].sort(
    (left, right) => right.count - left.count || left.key.localeCompare(right.key),
  );

  // 4) ضمّ كل بذرة إلى أول مجموعة يشبه قائدها
  const clusters: MerchantCluster[] = [];
  for (const seed of sortedSeeds) {
    const host = clusters.find((cluster) => areSimilar(cluster.canonical, seed.key, threshold));

    if (host === undefined) {
      clusters.push({ canonical: seed.key, variants: [...seed.variants], count: seed.count });
    } else {
      host.variants.push(...seed.variants);
      host.count += seed.count;
    }
  }

  for (const cluster of clusters) {
    cluster.variants.sort((left, right) => right.count - left.count || left.raw.localeCompare(right.raw));
  }

  return clusters.sort(
    (left, right) => right.count - left.count || left.canonical.localeCompare(right.canonical),
  );
}

/** فهرس التجّار: المجموعات + خريطة من الوصف الخام إلى اسم التاجر الموحّد. */
export type MerchantIndex = {
  clusters: MerchantCluster[];
  /** وصف خام → `canonical` مجموعته. */
  byDescription: Map<string, string>;
};

/**
 * يبني فهرس التجّار من قائمة عمليات — هذه هي الدالة التي سيستدعيها
 * محرك الكشف في الجزء 2 قبل البحث عن الدورات المتكررة.
 *
 * @param transactions العمليات بعد التوحيد
 * @param options خيارات التجميع
 * @returns المجموعات وخريطة الوصف → التاجر
 */
export function buildMerchantIndex(
  transactions: readonly Transaction[],
  options: ClusterOptions = {},
): MerchantIndex {
  const clusters = clusterDescriptions(
    transactions.map((transaction) => transaction.description),
    options,
  );

  const byDescription = new Map<string, string>();
  for (const cluster of clusters) {
    for (const variant of cluster.variants) {
      byDescription.set(variant.raw, cluster.canonical);
    }
  }

  return { clusters, byDescription };
}
