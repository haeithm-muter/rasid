/**
 * كل نصوص الواجهة في ملف واحد — عربي وإنجليزي.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * قاعدة غير قابلة للكسر: **لا نص معروض للمستخدم خارج هذا الملف.**
 * ═══════════════════════════════════════════════════════════════════════════
 * أي مكوّن يكتب حرفاً عربياً أو إنجليزياً بين وسمين يكون قد كسر الترجمة. حتى
 * الفواصل والوحدات ("عملية"، "شهرياً") تعيش هنا، لأن ما يبدو محايداً في لغة
 * يكون قابلاً للترجمة في أخرى.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * كيف تُضمن المطابقة بين اللغتين
 * ═══════════════════════════════════════════════════════════════════════════
 * `ar` هو المرجع، و`Strings` نوعه المستنتَج، و`en` مصرَّح به من هذا النوع. أي
 * مفتاح يُضاف للعربية ولا يُضاف للإنجليزية **يوقف البناء** — لا يحتاج الأمر
 * انتباهاً بشرياً ولا اختباراً يُنسى. (وهناك اختبار يؤكّده أيضاً في
 * `tests/i18n.test.ts` لأن الفحص المزدوج هنا رخيص.)
 *
 * الدوال بدل قوالب النصوص مقصودة: ترتيب الكلمات يختلف بين العربية والإنجليزية،
 * فتمرير القيم كوسائط يترك لكل لغة أن ترتّب جملتها كما تشاء.
 */

/** اللغات المدعومة. */
export type Locale = 'ar' | 'en';

/** اتجاه الكتابة لكل لغة. */
export const DIRECTION: Readonly<Record<Locale, 'rtl' | 'ltr'>> = { ar: 'rtl', en: 'ltr' };

/** اسم كل لغة بلغتها هي — كما يُعرض في زرّ التبديل. */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = { ar: 'العربية', en: 'English' };

/** ترتيب اللغات في زرّ التبديل. */
export const LOCALES: readonly Locale[] = ['ar', 'en'];

const ar = {
  app: {
    name: 'رصيد',
    tagline: 'اكتشف الاشتراكات التي نسيتَ أنك تدفع لها',
    description:
      'ارفع كشف حسابك البنكي بصيغة CSV، وسيبحث رصيد عن الرسوم المتكررة وزيادات الأسعار الصامتة والتجارب المجانية التي تحوّلت إلى اشتراكات مدفوعة.',
    privacyHeadline: 'ملفك لا يغادر جهازك — لا يوجد خادم',
    privacyDetail:
      'كل المعالجة تجري داخل متصفحك. لا رفع، ولا حساب مستخدم، ولا تحليلات، ولا طلب شبكة واحد بعد فتح الصفحة.',
    switchLanguage: 'English',
    footer: 'يعمل بالكامل داخل متصفحك — أغلق الإنترنت وجرّب.',
  },

  upload: {
    dropTitle: 'أفلت ملف CSV هنا',
    dropHint: 'أو اختر ملفاً من جهازك',
    browse: 'اختيار ملف',
    demo: 'جرّب ببيانات تجريبية',
    demoHint: 'كشف حساب مولَّد داخل المتصفح — لا يُرفع ولا يُقرأ أي ملف حقيقي.',
    supported: 'التنسيقات المدعومة',
    howToExport: 'صدّر كشف حسابك من تطبيق بنكك بصيغة CSV، ثم أفلته هنا.',
    fileTooLarge: (limitMb: number) => `الملف أكبر من ${limitMb} ميجابايت.`,
    wrongType: 'الملف المختار ليس ملف CSV.',
  },

  processing: {
    title: 'جارٍ التحليل',
    subtitle: 'داخل جهازك، بلا أي اتصال',
    stages: {
      decoding: 'قراءة الملف وفكّ ترميزه',
      parsing: 'تحليل الجدول',
      converting: 'توحيد العمليات',
      detecting: 'البحث عن الأنماط المتكررة',
      summarizing: 'حساب الكلفة',
      done: 'اكتمل',
    },
  },

  results: {
    title: 'النتائج',
    monthlyTotal: 'الكلفة الشهرية',
    annualTotal: 'الكلفة السنوية المتوقعة',
    subscriptionCount: 'اشتراك مكتشف',
    perMonth: 'شهرياً',
    perYear: 'سنوياً',
    startOver: 'كشف آخر',
    exportList: 'تصدير قائمة الإلغاء',
    empty: 'لم يُعثر على أي رسم متكرر يشبه الاشتراك في هذا الكشف.',
    emptyHint:
      'قد يعني هذا أن كشفك نظيف فعلاً، أو أن مدّته أقصر من أن تُظهر تكراراً (يلزم ثلاثة خصوم على الأقل من التاجر نفسه).',
    fileSummary: (transactions: number, from: string, to: string) =>
      `${transactions} عملية بين ${from} و${to}`,
    adapterUsed: (label: string) => `التنسيق المكتشف: ${label}`,
    skippedRows: (count: number) => `${count} صفاً تُخطّي لتعذّر قراءته`,
    otherCurrencies: 'بعملات أخرى',
    currencyNote:
      'المجاميع مفصولة بالعملة ولا تُجمع: تحويل العملات يحتاج سعر صرف من الشبكة، والشبكة ممنوعة هنا.',
  },

  chart: {
    title: 'توزيع الكلفة الشهرية',
    subtitle: 'أين يذهب المال كل شهر',
    others: (count: number) => `و${count} اشتراكاً آخر`,
    shareOfTotal: (share: string) => `${share} من الإجمالي`,
  },

  table: {
    title: 'الاشتراكات المكتشفة',
    merchant: 'التاجر',
    amount: 'المبلغ',
    cycle: 'الدورة',
    firstSeen: 'أول ظهور',
    lastCharge: 'آخر خصم',
    confidence: 'درجة الثقة',
    flags: 'ملاحظات',
    monthlyEquivalent: 'ما يعادله شهرياً',
    expandHint: 'اضغط أي صف لعرض العمليات الأصلية التي بُني عليها الاستنتاج',
    expand: 'عرض العمليات الأصلية',
    collapse: 'إخفاء العمليات الأصلية',
    originalTransactions: 'العمليات الأصلية كما وردت في كشفك',
    originalDescription: 'الوصف كما ورد',
    date: 'التاريخ',
    occurrences: (count: number) => `${count} خصماً`,
    evidence: 'على أي أساس',
    medianGap: (days: string) => `وسيط الفارق بين الخصوم: ${days} يوماً`,
    regularity: (score: string) => `انتظام الدورة: ${score}`,
    stability: (score: string) => `ثبات المبلغ: ${score}`,
    priceLevels: 'مستويات السعر',
    priceStep: (from: string, to: string, date: string) => `${from} ← ${to} ابتداءً من ${date}`,
    trialInfo: (initial: string, settled: string, date: string) =>
      `بدأ بـ ${initial} ثم أصبح ${settled} في ${date}`,
  },

  confidence: {
    high: 'ثقة عالية',
    medium: 'ثقة متوسطة',
    low: 'ثقة منخفضة',
    /** رموز نصّية تغني عن اللون وحده لمن لا يميّز الألوان. */
    marks: { high: '●●●', medium: '●●○', low: '●○○' },
  },

  flags: {
    'price-increase': 'زيادة سعر',
    'price-decrease': 'انخفاض سعر',
    'free-trial-converted': 'تجربة تحوّلت',
    'unclassified-cycle': 'دورة غير معروفة',
    'variable-amount': 'مبلغ متذبذب',
  },

  cycles: {
    weekly: 'أسبوعي',
    semimonthly: 'نصف شهري',
    monthly: 'شهري',
    quarterly: 'ربع سنوي',
    semiannual: 'نصف سنوي',
    annual: 'سنوي',
    irregular: 'غير منتظم',
  },

  categories: {
    title: 'رسوم دورية ليست اشتراكات',
    hint: 'هذه رسوم منتظمة ثابتة المبلغ تشبه الاشتراك حسابياً، لكن اسمها يدلّ على أنها ليست كذلك. لم تُحسب في المجاميع أعلاه، ونعرضها لأنك أدرى بها.',
    rent: 'إيجار',
    installment: 'قسط أو تمويل',
    income: 'راتب',
    insurance: 'تأمين',
    tuition: 'رسوم دراسية',
  },

  errors: {
    title: 'تعذّر قراءة الملف',
    unknownFormat: 'لم نتعرّف على تنسيق هذا الكشف.',
    chooseBank: 'اختر بنكك يدوياً:',
    chooseBankAction: 'إعادة المحاولة بهذا التنسيق',
    retry: 'اختيار ملف آخر',
    unexpected: 'حدث خطأ غير متوقع أثناء التحليل.',
    columnsFound: (headers: string) => `الأعمدة الموجودة في ملفك: ${headers}`,
  },

  exportFile: {
    fileName: 'rasid-cancellation-list.txt',
    heading: 'قائمة الاشتراكات المرشّحة للإلغاء',
    generatedBy: 'مولَّدة بواسطة رصيد — محلياً داخل المتصفح',
    generatedOn: (date: string) => `تاريخ الإصدار: ${date}`,
    totalsLine: (monthly: string, annual: string) =>
      `الإجمالي: ${monthly} شهرياً، أي ${annual} سنوياً`,
    columnsLine: 'التاجر | المبلغ | الدورة | أول ظهور | آخر خصم | ما يعادله شهرياً',
    itemNote: (notes: string) => `    ملاحظات: ${notes}`,
    disclaimer:
      'راجع كل بند بنفسك قبل الإلغاء. رصيد يقرأ الأنماط في كشفك فقط، ولا يعرف ما إذا كنت تستخدم الخدمة فعلاً.',
  },
};

/** شكل نصوص الواجهة — مستنتَج من العربية، وتلتزم به كل لغة أخرى. */
export type Strings = typeof ar;

const en: Strings = {
  app: {
    name: 'Rasid',
    tagline: 'Find the subscriptions you forgot you were paying for',
    description:
      'Upload your bank statement as CSV and Rasid will look for recurring charges, silent price increases, and free trials that quietly turned into paid subscriptions.',
    privacyHeadline: 'Your file never leaves your device — there is no server',
    privacyDetail:
      'Everything runs inside your browser. No upload, no account, no analytics, and not a single network request after the page loads.',
    switchLanguage: 'العربية',
    footer: 'Runs entirely in your browser — turn off your internet and try it.',
  },

  upload: {
    dropTitle: 'Drop a CSV file here',
    dropHint: 'or pick one from your device',
    browse: 'Choose a file',
    demo: 'Try it with sample data',
    demoHint: 'A statement generated inside your browser — no real file is uploaded or read.',
    supported: 'Supported formats',
    howToExport: 'Export your statement from your bank app as CSV, then drop it here.',
    fileTooLarge: (limitMb: number) => `The file is larger than ${limitMb} MB.`,
    wrongType: 'The selected file is not a CSV file.',
  },

  processing: {
    title: 'Analysing',
    subtitle: 'on your device, with no connection',
    stages: {
      decoding: 'Reading and decoding the file',
      parsing: 'Parsing the table',
      converting: 'Normalising transactions',
      detecting: 'Looking for recurring patterns',
      summarizing: 'Computing cost',
      done: 'Done',
    },
  },

  results: {
    title: 'Results',
    monthlyTotal: 'Monthly cost',
    annualTotal: 'Projected annual cost',
    subscriptionCount: 'subscriptions found',
    perMonth: 'per month',
    perYear: 'per year',
    startOver: 'Another statement',
    exportList: 'Export cancellation list',
    empty: 'No recurring charge in this statement looks like a subscription.',
    emptyHint:
      'That may mean your statement really is clean, or that it is too short to show repetition (at least three charges from the same merchant are needed).',
    fileSummary: (transactions: number, from: string, to: string) =>
      `${transactions} transactions between ${from} and ${to}`,
    adapterUsed: (label: string) => `Detected format: ${label}`,
    skippedRows: (count: number) => `${count} rows skipped as unreadable`,
    otherCurrencies: 'In other currencies',
    currencyNote:
      'Totals are kept separate per currency and never added together: converting currencies needs an exchange rate from the network, and the network is off-limits here.',
  },

  chart: {
    title: 'Monthly cost breakdown',
    subtitle: 'where the money goes each month',
    others: (count: number) => `and ${count} more`,
    shareOfTotal: (share: string) => `${share} of the total`,
  },

  table: {
    title: 'Detected subscriptions',
    merchant: 'Merchant',
    amount: 'Amount',
    cycle: 'Cycle',
    firstSeen: 'First seen',
    lastCharge: 'Last charge',
    confidence: 'Confidence',
    flags: 'Notes',
    monthlyEquivalent: 'Monthly equivalent',
    expandHint: 'Click any row to see the original transactions behind the conclusion',
    expand: 'Show original transactions',
    collapse: 'Hide original transactions',
    originalTransactions: 'Original transactions exactly as they appear in your statement',
    originalDescription: 'Description as written',
    date: 'Date',
    occurrences: (count: number) => `${count} charges`,
    evidence: 'On what basis',
    medianGap: (days: string) => `Median gap between charges: ${days} days`,
    regularity: (score: string) => `Cycle regularity: ${score}`,
    stability: (score: string) => `Amount stability: ${score}`,
    priceLevels: 'Price levels',
    priceStep: (from: string, to: string, date: string) => `${from} → ${to} starting ${date}`,
    trialInfo: (initial: string, settled: string, date: string) =>
      `started at ${initial}, then ${settled} on ${date}`,
  },

  confidence: {
    high: 'High confidence',
    medium: 'Medium confidence',
    low: 'Low confidence',
    marks: { high: '●●●', medium: '●●○', low: '●○○' },
  },

  flags: {
    'price-increase': 'price increase',
    'price-decrease': 'price decrease',
    'free-trial-converted': 'trial converted',
    'unclassified-cycle': 'unrecognised cycle',
    'variable-amount': 'variable amount',
  },

  cycles: {
    weekly: 'weekly',
    semimonthly: 'twice a month',
    monthly: 'monthly',
    quarterly: 'quarterly',
    semiannual: 'twice a year',
    annual: 'annual',
    irregular: 'irregular',
  },

  categories: {
    title: 'Recurring charges that are not subscriptions',
    hint: 'These are regular fixed charges that look like subscriptions mathematically, but whose name says otherwise. They are excluded from the totals above, and shown because you know them better than we do.',
    rent: 'rent',
    installment: 'instalment or financing',
    income: 'salary',
    insurance: 'insurance',
    tuition: 'tuition',
  },

  errors: {
    title: 'Could not read the file',
    unknownFormat: 'We did not recognise this statement format.',
    chooseBank: 'Pick your bank manually:',
    chooseBankAction: 'Retry with this format',
    retry: 'Choose another file',
    unexpected: 'Something unexpected went wrong while analysing.',
    columnsFound: (headers: string) => `Columns found in your file: ${headers}`,
  },

  exportFile: {
    fileName: 'rasid-cancellation-list.txt',
    heading: 'Subscriptions worth cancelling',
    generatedBy: 'Generated by Rasid — locally, inside your browser',
    generatedOn: (date: string) => `Issued: ${date}`,
    totalsLine: (monthly: string, annual: string) =>
      `Total: ${monthly} per month, i.e. ${annual} per year`,
    columnsLine: 'Merchant | Amount | Cycle | First seen | Last charge | Monthly equivalent',
    itemNote: (notes: string) => `    Notes: ${notes}`,
    disclaimer:
      'Review every line yourself before cancelling. Rasid only reads patterns in your statement; it has no idea whether you actually use the service.',
  },
};

/** كل النصوص مفهرسة باللغة. */
export const MESSAGES: Readonly<Record<Locale, Strings>> = { ar, en };

/**
 * يعيد نصوص لغة بعينها.
 *
 * @param locale اللغة المطلوبة
 * @returns حزمة النصوص كاملة
 */
export function messagesFor(locale: Locale): Strings {
  return MESSAGES[locale];
}

/**
 * يستنتج اللغة الأنسب من تفضيلات المتصفح.
 *
 * قراءة `navigator.languages` **ليست طلب شبكة** ولا تتبّعاً — هي قيمة محلية
 * يعلنها المتصفح. العربية هي الافتراضي لأن هذا هو جمهور المشروع الأساسي.
 *
 * @param languages قائمة اللغات المفضّلة (تُحقن في الاختبارات)
 * @returns اللغة المختارة
 */
export function preferredLocale(languages: readonly string[] = []): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (base === 'ar') return 'ar';
    if (base === 'en') return 'en';
  }
  return 'ar';
}
