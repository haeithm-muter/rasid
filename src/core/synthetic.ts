/**
 * مولّد كشوف حسابات اصطناعية بحقيقة أرضية معروفة.
 *
 * يخدم هذا الملف غرضين لا ثالث لهما، وكلاهما يمنع تسرّب بيانات حقيقية:
 *
 * 1. **زر "جرّب ببيانات تجريبية"** في الواجهة — يولّد كشفاً كاملاً في الذاكرة
 *    ويمرّره على **نفس** خط الاستيراد والكشف الذي يمرّ عليه ملف المستخدم. لا
 *    رفع ملف، ولا نتائج محفوظة مسبقاً: ما تراه في العرض التجريبي كشفٌ حقيقي.
 * 2. **مرحلة التقييم** (`eval/`) — كل عملية هنا تحمل `seedId` يقول أي بذرة
 *    ولّدتها، وكل بذرة تعلن هل هي اشتراك فعلاً وما دورته وسعره. هذه هي الحقيقة
 *    الأرضية التي تُقاس بها recall وprecision.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * حتمية كاملة
 * ═══════════════════════════════════════════════════════════════════════════
 * لا `Math.random` ولا `Date.now` في هذا الملف. كل عشوائية تأتي من مولّد
 * `mulberry32` ببذرة رقمية، فنفس البذرة تعطي نفس الكشف حرفياً إلى الأبد. بدون
 * هذا يصير رقم التقييم غير قابل للتكرار، وأي رقم لا يُعاد إنتاجه ليس قياساً.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ما الذي يجعل هذه البيانات صعبة عمداً
 * ═══════════════════════════════════════════════════════════════════════════
 * توليد اشتراكات نظيفة فقط يعطي 100% بلا معنى. لذلك يزرع المولّد في كل كشف
 * الحالات التي يُفترض أن تُسقط محرّكاً ساذجاً:
 * - **اشتراك بدورة 28 يوماً** ينزلق عبر الشهور فلا يقع في يوم ثابت
 * - **إيجار شهري ثابت** — يشبه الاشتراك رياضياً تماماً، وهو الفخّ الأصعب
 * - **بقالة أسبوعية** منتظمة الإيقاع فوضوية المبلغ — الفخّ المعاكس
 * - **اشتراك أُلغي في المنتصف**، و**آخر ارتفع سعره**، و**ثالث بدأ بتجربة**
 * - **أخطاء واقعية**: صفوف مكرّرة، أوصاف فارغة، مبالغ مستردة
 * وكل تاجر يظهر بأشكال وصف مختلفة (أرقام مرجعية، مدن، رموز نقاط بيع) حتى
 * يُختبر توحيد أسماء التجّار لا التطابق الحرفي.
 */

import type { CycleKind } from './periodicity';
import type { Direction, Transaction } from './types';

// ─── مولّد عشوائي حتمي ─────────────────────────────────────────────────────

/** دالة تعطي رقماً في `[0, 1)` — الواجهة الوحيدة للعشوائية في هذا الملف. */
export type Rng = () => number;

/**
 * مولّد `mulberry32`: مولّد أعداد شبه عشوائية بحالة 32-بت.
 *
 * اخترناه لأنه سطران، بلا اعتماديات، وحتمي تماماً عبر المنصّات — وهذه الصفات
 * الثلاث هي كل ما يلزم لبيانات اختبار قابلة للتكرار.
 *
 * @param seed البذرة الرقمية
 * @returns دالة عشوائية حتمية
 */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** عدد صحيح في `[min, max]` شامل الطرفين. */
function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** يختار عنصراً واحداً من قائمة غير فارغة. */
function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

/** نسخة مخلوطة من القائمة (خلط فيشر-ييتس) بلا تعديل الأصل. */
function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** يقرّب مبلغاً إلى هللتين. */
function money(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─── أدوات التاريخ ─────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** يحوّل `YYYY-MM-DD` إلى طابع زمني UTC. */
function toUtc(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day);
}

/** يحوّل طابعاً زمنياً إلى `YYYY-MM-DD`. */
function toIso(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** يضيف أياماً إلى تاريخ ISO. */
function addDays(isoDate: string, days: number): string {
  return toIso(toUtc(isoDate) + days * MS_PER_DAY);
}

/**
 * يضيف شهوراً تقويمية إلى تاريخ ISO.
 * يُستدعى دائماً بيوم ≤ 28 فلا يقع في مشكلة "31 فبراير".
 */
function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return toIso(Date.UTC(year, month - 1 + months, day));
}

// ─── كتالوج التجّار ────────────────────────────────────────────────────────

/** تاجر في الكتالوج: اسمه التجاري كما يظهر داخل الوصف، وسعره بالريال. */
type Brand = {
  /** الاسم التجاري الخام الذي يُحقن في قوالب الوصف. */
  name: string;
  /** السعر بالريال السعودي؛ العملات الأخرى تُشتق منه. */
  sar: number;
};

/** تجّار الاشتراكات الشهرية. */
const MONTHLY_BRANDS: readonly Brand[] = [
  { name: 'NETFLIX.COM', sar: 56 },
  { name: 'SPOTIFY AB', sar: 21.99 },
  { name: 'APPLE.COM/BILL', sar: 11.99 },
  { name: 'SHAHID VIP', sar: 34.5 },
  { name: 'ANGHAMI', sar: 19.99 },
  { name: 'STARZPLAY', sar: 30 },
  { name: 'YOUTUBE PREMIUM', sar: 23 },
  { name: 'MICROSOFT 365', sar: 28.5 },
  { name: 'ADOBE CREATIVE CLOUD', sar: 89 },
  { name: 'CANVA', sar: 45 },
  { name: 'DROPBOX', sar: 44 },
  { name: 'FITNESS TIME', sar: 199 },
  { name: 'ICLOUD STORAGE', sar: 9.99 },
];

/** تجّار يصلحون لحالة "تجربة مجانية تحوّلت" — سعرهم كبير بما يكفي ليتضح الفرق. */
const TRIAL_BRANDS: readonly Brand[] = [
  { name: 'DISNEYPLUS', sar: 29.99 },
  { name: 'CHATGPT PLUS', sar: 75 },
  { name: 'AUDIBLE', sar: 39 },
  { name: 'COURSERA', sar: 59 },
];

/** تجّار يصلحون لحالة "اشتراك أُلغي في المنتصف". */
const CANCELLED_BRANDS: readonly Brand[] = [
  { name: 'OSN PLUS', sar: 39 },
  { name: 'DEEZER', sar: 21 },
  { name: 'HULU', sar: 27 },
  { name: 'CRUNCHYROLL', sar: 25 },
];

/** تجّار الاشتراكات السنوية. */
const ANNUAL_BRANDS: readonly Brand[] = [
  { name: 'GODADDY.COM', sar: 649 },
  { name: 'NAMECHEAP', sar: 420 },
  { name: 'LINKEDIN PREMIUM', sar: 899 },
  { name: 'JETBRAINS', sar: 720 },
];

/** متاجر البقالة — إيقاع أسبوعي منتظم بمبالغ فوضوية. */
const GROCERY_BRANDS: readonly Brand[] = [
  { name: 'PANDA HYPERMARKET', sar: 180 },
  { name: 'TAMIMI MARKETS', sar: 210 },
  { name: 'CARREFOUR', sar: 165 },
  { name: 'LULU HYPERMARKET', sar: 195 },
  { name: 'OTHAIM MARKETS', sar: 150 },
];

/** مشتريات متفرّقة — أغلبها يظهر مرّة أو مرّتين فلا يبلغ حدّ التكرار. */
const RANDOM_BRANDS: readonly Brand[] = [
  { name: 'JARIR BOOKSTORE', sar: 320 },
  { name: 'IKEA', sar: 450 },
  { name: 'STARBUCKS', sar: 27 },
  { name: 'ALBAIK', sar: 38 },
  { name: 'HERFY', sar: 32 },
  { name: 'UBER TRIP', sar: 41 },
  { name: 'CAREEM', sar: 36 },
  { name: 'NOON.COM', sar: 230 },
  { name: 'ARAMEX', sar: 55 },
  { name: 'DUNKIN', sar: 24 },
  { name: 'KUDU', sar: 34 },
  { name: 'TALABAT', sar: 68 },
  { name: 'HUNGERSTATION', sar: 74 },
  { name: 'EXTRA STORES', sar: 380 },
  { name: 'NAHDI PHARMACY', sar: 95 },
  { name: 'BOOKING.COM', sar: 640 },
  { name: 'FLYNAS', sar: 520 },
  { name: 'SHEIN', sar: 175 },
  { name: 'NAMSHI', sar: 240 },
  { name: 'CENTREPOINT', sar: 290 },
  { name: 'VIRGIN MEGASTORE', sar: 130 },
];

/**
 * محطة الوقود — ضجيج متكرّر بمبلغ شبه ثابت ودورة عشرة أيام.
 * مفصولة عن `RANDOM_BRANDS` حتى لا تُستعمل مرّتين في كشف واحد فيلتبس نسب
 * العملية إلى بذرتها في الحقيقة الأرضية.
 */
const FUEL_BRAND: Brand = { name: 'SHELL STATION', sar: 110 };

/** أسماء الإيجار — الفخّ المتعمَّد: رسم دوري ثابت ليس اشتراكاً. */
const RENT_NAMES: Readonly<Record<'ar' | 'en', string>> = {
  ar: 'تحويل إيجار شقة',
  en: 'RENT PAYMENT AL NAKHEEL',
};

// ─── تنسيقات البنوك ────────────────────────────────────────────────────────

/** لغة أوصاف البنك — تحدّد قوالب الوصف وأسماء المدن المحقونة. */
type StatementLanguage = 'ar' | 'en';

/** وصف تنسيق بنك واحد كما يحتاجه المولّد. */
type FormatSpec = {
  /** معرّف المحوّل المقابل في `src/adapters` — يجب أن يتعرّف عليه `detectAdapter`. */
  adapterId: string;
  language: StatementLanguage;
  currency: string;
  /** صف الترويسة كما يكتبه هذا البنك. */
  headers: readonly string[];
  /** يبني صف بيانات واحداً. */
  row(transaction: Transaction, balance: number): readonly string[];
};

/** يحوّل تاريخ ISO إلى `DD/MM/YYYY`. */
function toDmy(isoDate: string): string {
  const [year, month, day] = isoDate.split('-') as [string, string, string];
  return `${day}/${month}/${year}`;
}

/** يحوّل تاريخ ISO إلى `MM/DD/YYYY`. */
function toMdy(isoDate: string): string {
  const [year, month, day] = isoDate.split('-') as [string, string, string];
  return `${month}/${day}/${year}`;
}

/** يكتب رقماً بفواصل آلاف وخانتين عشريتين — كما تُصدّره أنظمة البنوك. */
function grouped(value: number): string {
  const [whole, fraction = '00'] = value.toFixed(2).split('.') as [string, string];
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

/**
 * ▲ تنسيقات البنوك المستخدَمة في التوليد ▲
 *
 * تقابل واحداً بواحد محوّلات الجزء الأول الأربعة، وتكتب الملف بالشكل الذي
 * يوثّقه رأس كل محوّل بالضبط — بما في ذلك ما يفسده: فواصل الآلاف، رموز العملة
 * داخل خلية المبلغ، والأقواس أو الإشارة للسالب.
 */
const FORMATS: readonly FormatSpec[] = [
  {
    adapterId: 'alrajhi',
    language: 'ar',
    currency: 'SAR',
    headers: ['التاريخ', 'البيان', 'مدين', 'دائن', 'العملة', 'الرصيد'],
    row: (transaction, balance) => [
      toDmy(transaction.date),
      transaction.description,
      transaction.direction === 'debit' ? grouped(transaction.amount) : '',
      transaction.direction === 'credit' ? grouped(transaction.amount) : '',
      'ر.س',
      grouped(balance),
    ],
  },
  {
    adapterId: 'snb',
    language: 'ar',
    currency: 'SAR',
    headers: ['تاريخ العملية', 'تفاصيل العملية', 'المبلغ', 'نوع العملية'],
    row: (transaction) => [
      transaction.date,
      transaction.description,
      `${grouped(transaction.amount)} ر.س`,
      transaction.direction === 'debit' ? 'مدين' : 'دائن',
    ],
  },
  {
    adapterId: 'chase',
    language: 'en',
    currency: 'USD',
    headers: ['Transaction Date', 'Description', 'Amount', 'Type'],
    row: (transaction) => [
      toMdy(transaction.date),
      transaction.description,
      transaction.direction === 'debit'
        ? `-$${grouped(transaction.amount)}`
        : `$${grouped(transaction.amount)}`,
      transaction.direction === 'debit' ? 'DEBIT' : 'CREDIT',
    ],
  },
  {
    adapterId: 'enbd',
    language: 'en',
    currency: 'AED',
    headers: ['Date', 'Narrative', 'Debit Amount', 'Credit Amount', 'Currency'],
    row: (transaction) => [
      toDmy(transaction.date),
      transaction.description,
      transaction.direction === 'debit' ? grouped(transaction.amount) : '',
      transaction.direction === 'credit' ? grouped(transaction.amount) : '',
      'AED',
    ],
  },
];

/** معرّفات التنسيقات المتاحة للتوليد. */
export const SYNTHETIC_FORMAT_IDS: readonly string[] = FORMATS.map((format) => format.adapterId);

/**
 * ▲ جدول معايرة ▲ معاملات تحويل السعر من الريال إلى عملات التنسيقات الأخرى.
 * تقريبية عمداً — الغرض مبالغ **تبدو واقعية** في كل عملة، لا دقة صرف.
 */
const CURRENCY_SCALE: Readonly<Record<string, number>> = { SAR: 1, AED: 0.98, USD: 0.2667 };

/**
 * يحوّل سعراً بالريال إلى عملة التنسيق، مع تقريب إلى `X.99` كما تسعّر الشركات.
 *
 * @param sar السعر بالريال
 * @param currency عملة الهدف
 * @returns السعر بعملة الهدف
 */
function priceIn(sar: number, currency: string): number {
  if (currency === 'SAR') return money(sar);
  const scaled = sar * (CURRENCY_SCALE[currency] ?? 1);
  return money(Math.max(1, Math.round(scaled)) - 0.01);
}

// ─── قوالب الأوصاف ─────────────────────────────────────────────────────────

/** مدن تُلحق بالوصف كموقع الفرع — كلها ضمن ضجيج المواقع المعروف للمنظّف. */
const CITIES: Readonly<Record<StatementLanguage, readonly string[]>> = {
  ar: ['الرياض', 'جدة', 'الدمام', 'الخبر'],
  en: ['DUBAI', 'SHARJAH', 'SEATTLE', 'CA'],
};

/** رقم مرجعي من `digits` خانة — يُفترض أن يحذفه `cleanDescription` بالكامل. */
function reference(rng: Rng, digits: number): string {
  let out = '';
  for (let i = 0; i < digits; i += 1) out += String(randInt(rng, 0, 9));
  return out;
}

/**
 * يكتب وصف عملية خاماً بأسلوب البنك المطلوب.
 *
 * القوالب تُحاكي ما تكتبه البنوك فعلاً، وكلها تُغلّف الاسم التجاري بضجيج
 * **يعرف المنظّف كيف يحذفه** (رموز نقاط البيع، المدن، الأرقام المرجعية). هذا
 * مقصود: الهدف اختبار أن `merchantNormalizer` يجمع الأشكال المختلفة لتاجر
 * واحد، لا اختراع ضجيج يستحيل حذفه.
 *
 * @param rng المولّد الحتمي
 * @param brandName الاسم التجاري
 * @param format تنسيق البنك
 * @returns وصف خام واحد
 */
function describe(rng: Rng, brandName: string, format: FormatSpec): string {
  const city = pick(rng, CITIES[format.language]);

  if (format.language === 'ar') {
    switch (randInt(rng, 0, 2)) {
      case 0:
        return `شراء نقاط بيع - ${brandName}`;
      case 1:
        return `مدى-شراء-${brandName}-${city}-${reference(rng, 4)}`;
      default:
        return `${brandName}*${reference(rng, 6)}`;
    }
  }

  switch (randInt(rng, 0, 2)) {
    case 0:
      return `POS ${brandName} ${city}`;
    case 1:
      return `${brandName} ${reference(rng, 3)}-${reference(rng, 3)}-${reference(rng, 4)} ${city}`;
    default:
      return `PURCHASE ${brandName}*${reference(rng, 4)}`;
  }
}

// ─── الحقيقة الأرضية ───────────────────────────────────────────────────────

/** نوع البذرة التي ولّدت مجموعة عمليات. */
export type SeedKind =
  | 'subscription-monthly'
  | 'subscription-drifting-28d'
  | 'subscription-annual'
  | 'subscription-price-increase'
  | 'subscription-free-trial'
  | 'subscription-cancelled'
  | 'subscription-fx-wobble'
  | 'subscription-skipped-month'
  | 'noise-rent'
  | 'noise-groceries'
  | 'noise-recurring'
  | 'noise-random'
  | 'noise-refund'
  | 'noise-malformed';

/**
 * بذرة واحدة: مصدر مجموعة عمليات، وهي **وحدة الحقيقة الأرضية**.
 *
 * كل عملية مولَّدة تحمل `seedId` يعود إلى بذرة هنا، فيستطيع سكربت القياس أن
 * ينسب أي مجموعة كشفها المحرك إلى بذرتها ويحكم: أصاب أم أخطأ.
 */
export type SyntheticSeed = {
  /** معرّف فريد داخل الكشف الواحد. */
  id: string;
  kind: SeedKind;
  /** الاسم التجاري الخام. */
  brand: string;
  /** هل هذه اشتراك فعلاً؟ هذا هو السؤال الذي تقيسه recall وprecision. */
  isSubscription: boolean;
  /** الدورة الحقيقية للاشتراكات، و`null` للضوضاء. */
  cycle: CycleKind | null;
  /** السعر الحقيقي بعد أي زيادة (بعملة الكشف). */
  amount: number;
  /** هل زُرع فيها ارتفاع سعر؟ */
  hasPriceIncrease: boolean;
  /** هل بدأت بتجربة مجانية ثم تحوّلت؟ */
  isFreeTrialConverted: boolean;
  /** هل توقّفت في منتصف الكشف؟ */
  cancelled: boolean;
  /** عدد العمليات التي ولّدتها فعلاً داخل نافذة الكشف. */
  occurrences: number;
};

/** عملية اصطناعية = عملية عادية + معرّف بذرتها. */
export type SyntheticTransaction = Transaction & { seedId: string };

/** كشف حساب اصطناعي كامل. */
export type SyntheticStatement = {
  /** معرّف الكشف (مثل `stmt-03`). */
  id: string;
  /** البذرة الرقمية — بها يُعاد توليد الكشف حرفياً. */
  seed: number;
  /** معرّف المحوّل الذي يُفترض أن يكشفه `detectAdapter` تلقائياً. */
  adapterId: string;
  currency: string;
  /** عدد الشهور التي يغطّيها. */
  months: number;
  firstDate: string;
  lastDate: string;
  /** العمليات مرتّبة زمنياً، كل واحدة موسومة ببذرتها. */
  transactions: SyntheticTransaction[];
  /** الحقيقة الأرضية. */
  seeds: SyntheticSeed[];
  /** الملف كما سيراه المستخدم — هذا ما يُمرَّر على `importCsvText`. */
  csv: string;
};

// ─── التوليد ───────────────────────────────────────────────────────────────

/** حالة التوليد الداخلية أثناء بناء كشف واحد. */
type Builder = {
  rng: Rng;
  format: FormatSpec;
  transactions: SyntheticTransaction[];
  seeds: SyntheticSeed[];
};

/** خيارات إضافة سلسلة عمليات لتاجر واحد. */
type SeriesOptions = {
  id: string;
  kind: SeedKind;
  brand: string;
  /** المبلغ عند كل تاريخ — طوله يساوي طول `dates`. */
  amounts: readonly number[];
  dates: readonly string[];
  isSubscription: boolean;
  cycle: CycleKind | null;
  hasPriceIncrease?: boolean;
  isFreeTrialConverted?: boolean;
  cancelled?: boolean;
  direction?: Direction;
};

/**
 * يضيف سلسلة عمليات تاجر واحد إلى الكشف ويسجّل بذرتها في الحقيقة الأرضية.
 *
 * @param builder حالة التوليد
 * @param options وصف السلسلة
 */
function addSeries(builder: Builder, options: SeriesOptions): void {
  const direction = options.direction ?? 'debit';

  options.dates.forEach((date, index) => {
    builder.transactions.push({
      seedId: options.id,
      date,
      description: describe(builder.rng, options.brand, builder.format),
      amount: money(options.amounts[index] as number),
      currency: builder.format.currency,
      direction,
    });
  });

  builder.seeds.push({
    id: options.id,
    kind: options.kind,
    brand: options.brand,
    isSubscription: options.isSubscription,
    cycle: options.cycle,
    amount: money(options.amounts[options.amounts.length - 1] ?? 0),
    hasPriceIncrease: options.hasPriceIncrease ?? false,
    isFreeTrialConverted: options.isFreeTrialConverted ?? false,
    cancelled: options.cancelled ?? false,
    occurrences: options.dates.length,
  });
}

/**
 * تواريخ فوترة شهرية: نفس اليوم من كل شهر مع تزحزح يوم أحياناً.
 *
 * التزحزح مقصود: البنوك تؤجّل الخصم أحياناً يوماً بسبب عطلة، فتصير الفروق
 * `[30, 31, 29, 30, ...]` بدل `[30, 30, ...]`. هذا يبقى داخل مدى "شهري"
 * (27–32 يوماً) لكنه يهبط بدرجة الانتظام قليلاً — وهو ما يحدث فعلاً.
 *
 * @param rng المولّد
 * @param start أول تاريخ (يومه ≤ 28)
 * @param count عدد الخصوم
 * @returns التواريخ بترتيبها الزمني
 */
function monthlyDates(rng: Rng, start: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const base = addMonths(start, index);
    // تزحزح بيوم واحد في نحو خُمس الخصوم فقط
    return index > 0 && rng() < 0.2 ? addDays(base, rng() < 0.5 ? -1 : 1) : base;
  });
}

/** تواريخ بفاصل ثابت بالأيام — الدورة المنزلقة التي لا تقع في يوم شهر ثابت. */
function fixedGapDates(start: string, count: number, gapDays: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(start, index * gapDays));
}

/** يضيف الاشتراكات الشهرية الثابتة (الحالة الأساسية). */
function addFixedMonthlySubscriptions(
  builder: Builder,
  brands: readonly Brand[],
  start: string,
  months: number,
): void {
  brands.forEach((brand, index) => {
    const first = addDays(start, randInt(builder.rng, 0, 27));
    const count = months;
    const price = priceIn(brand.sar, builder.format.currency);

    addSeries(builder, {
      id: `sub-monthly-${index + 1}`,
      kind: 'subscription-monthly',
      brand: brand.name,
      dates: monthlyDates(builder.rng, first, count),
      amounts: Array.from({ length: count }, () => price),
      isSubscription: true,
      cycle: 'monthly',
    });
  });
}

/**
 * يضيف الاشتراك ذا الدورة الثابتة 28 يوماً — الحالة الحرجة من الجزء الثاني.
 *
 * تاريخه ينزلق عبر الشهور (1 يناير → 29 يناير → 26 فبراير → 25 مارس)، فأي
 * منطق يبحث عن "خصم في اليوم س من كل شهر" يفشل معه فشلاً كاملاً، بينما قياس
 * فروق الأيام يراه أنظف نمط ممكن: `[28, 28, 28, ...]`.
 */
function addDriftingSubscription(
  builder: Builder,
  brand: Brand,
  start: string,
  months: number,
): void {
  const first = addDays(start, randInt(builder.rng, 0, 20));
  const count = Math.max(3, Math.floor((months * 30.4) / 28));
  const price = priceIn(brand.sar, builder.format.currency);

  addSeries(builder, {
    id: 'sub-drifting-28d',
    kind: 'subscription-drifting-28d',
    brand: brand.name,
    dates: fixedGapDates(first, count, 28),
    amounts: Array.from({ length: count }, () => price),
    isSubscription: true,
    cycle: 'monthly',
  });
}

/**
 * يضيف الاشتراك السنوي.
 *
 * ⚠ حالة معروفة سلفاً: في نافذة 6–12 شهراً لا يظهر الاشتراك السنوي إلا مرة أو
 * مرّتين، وهو **دون حدّ `MIN_TRANSACTIONS_FOR_PERIODICITY` البالغ ثلاثاً**.
 * يبقى في الحقيقة الأرضية بلا تجميل: سكربت القياس يعدّه فائتاً ويشرح سببه في
 * جدول الحالات الفائتة. إخراجه من الحساب تجميلٌ للرقم، وهذا ما نتجنّبه.
 */
function addAnnualSubscription(builder: Builder, brand: Brand, start: string, months: number): void {
  const first = addDays(start, randInt(builder.rng, 0, 40));
  const count = months >= 12 ? 2 : 1;
  const price = priceIn(brand.sar, builder.format.currency);

  addSeries(builder, {
    id: 'sub-annual',
    kind: 'subscription-annual',
    brand: brand.name,
    dates: fixedGapDates(first, count, 365),
    amounts: Array.from({ length: count }, () => price),
    isSubscription: true,
    cycle: 'annual',
  });
}

/** يضيف اشتراكاً شهرياً ارتفع سعره في منتصف الكشف بلا إشعار. */
function addPriceIncreaseSubscription(
  builder: Builder,
  brand: Brand,
  start: string,
  months: number,
): void {
  const first = addDays(start, randInt(builder.rng, 0, 27));
  const count = months;
  const before = priceIn(brand.sar, builder.format.currency);
  // زيادة بين 18% و32% — فوق `PRICE_LEVEL_TOLERANCE` بوضوح فتُقرأ مستوىً جديداً
  const after = money(before * (1 + randInt(builder.rng, 18, 32) / 100));
  const switchAt = Math.floor(count / 2);

  addSeries(builder, {
    id: 'sub-price-increase',
    kind: 'subscription-price-increase',
    brand: brand.name,
    dates: monthlyDates(builder.rng, first, count),
    amounts: Array.from({ length: count }, (_, index) => (index < switchAt ? before : after)),
    isSubscription: true,
    cycle: 'monthly',
    hasPriceIncrease: true,
  });
}

/**
 * يضيف اشتراكاً بدأ برسم تجربة رمزي ثم تحوّل إلى السعر الكامل.
 *
 * الرسم الأول رمزي (وحدة واحدة من العملة) لا صفر: البنوك تسجّل عادةً رسم تحقّق
 * صغيراً، **وعمود المبلغ الصفري يُتخطّى أصلاً** في تنسيقات المدين/الدائن لأن
 * `0.00` فيها تعني "لا مبلغ هنا". الرسم الرمزي يعبر التنسيقات الأربعة كلها
 * ويظلّ تحت `FREE_TRIAL_MAX_RATIO` بفارق كبير.
 */
function addFreeTrialSubscription(
  builder: Builder,
  brand: Brand,
  start: string,
  months: number,
): void {
  const first = addDays(start, randInt(builder.rng, 0, 27));
  const count = months;
  const price = priceIn(brand.sar, builder.format.currency);

  addSeries(builder, {
    id: 'sub-free-trial',
    kind: 'subscription-free-trial',
    brand: brand.name,
    dates: monthlyDates(builder.rng, first, count),
    amounts: Array.from({ length: count }, (_, index) => (index === 0 ? 1 : price)),
    isSubscription: true,
    cycle: 'monthly',
    isFreeTrialConverted: true,
  });
}

/** يضيف اشتراكاً توقّف خصمه في منتصف الكشف (أُلغي فعلاً). */
function addCancelledSubscription(
  builder: Builder,
  brand: Brand,
  start: string,
  months: number,
): void {
  const first = addDays(start, randInt(builder.rng, 0, 27));
  const count = Math.max(3, Math.floor(months * 0.55));
  const price = priceIn(brand.sar, builder.format.currency);

  addSeries(builder, {
    id: 'sub-cancelled',
    kind: 'subscription-cancelled',
    brand: brand.name,
    dates: monthlyDates(builder.rng, first, count),
    amounts: Array.from({ length: count }, () => price),
    isSubscription: true,
    cycle: 'monthly',
    cancelled: true,
  });
}

/**
 * ▲ ثابت معايرة ▲ أقصى تذبذب في سعر الاشتراك المفوتر بعملة أجنبية.
 *
 * ±7% تحاكي فرق سعر الصرف بين شهر وآخر في اشتراك مسعّر بالدولار ومخصوم
 * بالريال. يبقى داخل حدّ "شبه ثابت" (`NEAR_FIXED_MAX_SPREAD`) فيُكشف، لكنه
 * يكفي لكسر أي منطق يشترط تطابقاً تاماً في المبلغ.
 */
const FX_WOBBLE = 0.07;

/**
 * يضيف اشتراكاً شهرياً يتذبذب مبلغه قليلاً بسبب صرف العملة.
 *
 * حالة شائعة جداً ومتعمَّدة الصعوبة: اشتراك مسعّر بالدولار يُخصم بالريال فيختلف
 * مبلغه هللات في كل شهر. أي كاشف يبحث عن مبلغ متطابق سيفوّته، بينما مقياس
 * الثبات النسبي هنا يقبله "شبه ثابت" ويبقيه في القائمة.
 */
function addFxWobbleSubscription(
  builder: Builder,
  brand: Brand,
  start: string,
  months: number,
): void {
  const first = addDays(start, randInt(builder.rng, 0, 27));
  const count = months;
  const price = priceIn(brand.sar, builder.format.currency);

  addSeries(builder, {
    id: 'sub-fx-wobble',
    kind: 'subscription-fx-wobble',
    brand: brand.name,
    dates: monthlyDates(builder.rng, first, count),
    amounts: Array.from({ length: count }, () =>
      money(price * (1 + (builder.rng() * 2 - 1) * FX_WOBBLE)),
    ),
    isSubscription: true,
    cycle: 'monthly',
  });
}

/**
 * يضيف اشتراكاً شهرياً فُقد منه شهر ثم عاد (فشل بطاقة، ثم تجديد).
 *
 * ينتج فارقاً واحداً بستين يوماً وسط فروق ثلاثينية. هذه هي الحالة التي كُتب
 * من أجلها اختيار **الوسيط لا المتوسط** في `stats.ts`: المتوسط ينجرف نحو 34
 * يوماً فيبقى شهرياً بالكاد، لكن الفروق `[30,30,30,30,60,30]` وسيطها 30 بلا
 * تردّد. درجة الانتظام وحدها هي التي تهبط، وهذا هو الفصل المقصود.
 */
function addSkippedMonthSubscription(
  builder: Builder,
  brand: Brand,
  start: string,
  months: number,
): void {
  const first = addDays(start, randInt(builder.rng, 0, 27));
  const count = months;
  const skipAt = Math.max(2, Math.floor(count / 2));
  const price = priceIn(brand.sar, builder.format.currency);

  const dates = monthlyDates(builder.rng, first, count).filter((_, index) => index !== skipAt);

  addSeries(builder, {
    id: 'sub-skipped-month',
    kind: 'subscription-skipped-month',
    brand: brand.name,
    dates,
    amounts: dates.map(() => price),
    isSubscription: true,
    cycle: 'monthly',
  });
}

/**
 * يضيف "ضجيجاً متكرّراً": محطة وقود يُملأ فيها الخزّان بمبلغ متقارب كل عشرة أيام.
 *
 * أصعب ضجيج في هذه البيانات: مبلغه **ثابت تقريباً** ودورته **منتظمة**، أي
 * أنه يجتاز اختبار ثبات المبلغ الذي أسقط البقالة. ما يستبعده شيء واحد فقط:
 * دورة العشرة أيام لا تقع في أي مدى من `CYCLE_RANGES` (الفجوة بين 9 و12 يوماً
 * رفضٌ صريح للتصنيف)، فتُضرب ثقته في `UNCLASSIFIED_CYCLE_FACTOR` وتهبط تحت
 * العتبة. هذا اختبار مباشر لبوابة الدورة.
 */
function addRecurringNoise(builder: Builder, brand: Brand, start: string, months: number): void {
  const first = addDays(start, randInt(builder.rng, 0, 9));
  const count = Math.floor((months * 30.4) / 10);
  const base = priceIn(brand.sar, builder.format.currency);

  addSeries(builder, {
    id: 'noise-recurring',
    kind: 'noise-recurring',
    brand: brand.name,
    dates: Array.from({ length: count }, (_, index) =>
      addDays(first, index * 10 + randInt(builder.rng, -1, 1)),
    ),
    amounts: Array.from({ length: count }, () => money(base * (1 + (builder.rng() * 2 - 1) * 0.05))),
    isSubscription: false,
    cycle: null,
  });
}

/**
 * يضيف الإيجار الشهري — **الفخّ الأصعب في هذه البيانات**.
 *
 * رياضياً هو اشتراك مثالي: دورة شهرية منتظمة ومبلغ ثابت تماماً، فيحصل على درجة
 * ثقة عالية جداً من المحرك عن حقّ. ما يمنعه من تلويث النتيجة ليس المحرك بل
 * `nonSubscriptionCategory` في `decision.ts` — ولذلك هو موجود هنا: ليقيس هل
 * ذلك القرار يعمل فعلاً.
 */
function addRent(builder: Builder, start: string, months: number): void {
  const first = addDays(start, randInt(builder.rng, 0, 5));
  const amount = priceIn(randInt(builder.rng, 2800, 4500), builder.format.currency);
  const name = RENT_NAMES[builder.format.language];
  const dates = monthlyDates(builder.rng, first, months);

  // الإيجار يُكتب باسمه دائماً بلا رموز نقاط بيع — فهو تحويل لا شراء
  dates.forEach((date) => {
    builder.transactions.push({
      seedId: 'noise-rent',
      date,
      description: name,
      amount,
      currency: builder.format.currency,
      direction: 'debit',
    });
  });

  builder.seeds.push({
    id: 'noise-rent',
    kind: 'noise-rent',
    brand: name,
    isSubscription: false,
    cycle: null,
    amount,
    hasPriceIncrease: false,
    isFreeTrialConverted: false,
    cancelled: false,
    occurrences: dates.length,
  });
}

/**
 * يضيف البقالة الأسبوعية — الفخّ المعاكس للإيجار.
 *
 * إيقاعها منتظم تماماً (كل سبعة أيام) لكن مبلغها يتراوح بين نصف السعر
 * التمثيلي وضعفه. المحرك يستبعدها بلا قاعدة خاصة: بوابة ثبات المبلغ في
 * `computeConfidence` تُسقط ثقتها إلى الصفر.
 */
function addGroceries(builder: Builder, brand: Brand, start: string, months: number): void {
  const first = addDays(start, randInt(builder.rng, 0, 6));
  const count = Math.floor((months * 30.4) / 7);
  const base = priceIn(brand.sar, builder.format.currency);

  addSeries(builder, {
    id: 'noise-groceries',
    kind: 'noise-groceries',
    brand: brand.name,
    dates: Array.from({ length: count }, (_, index) =>
      addDays(first, index * 7 + randInt(builder.rng, -1, 1)),
    ),
    amounts: Array.from({ length: count }, () => money(base * (0.5 + builder.rng() * 1.5))),
    isSubscription: false,
    cycle: null,
  });
}

/** يضيف المشتريات المتفرّقة: تجّار كثيرون بعمليات قليلة وتواريخ ومبالغ عشوائية. */
function addRandomPurchases(
  builder: Builder,
  brands: readonly Brand[],
  start: string,
  months: number,
): void {
  const windowDays = Math.round(months * 30.4);

  brands.forEach((brand, index) => {
    const count = randInt(builder.rng, 1, 4);
    const base = priceIn(brand.sar, builder.format.currency);

    addSeries(builder, {
      id: `noise-random-${index + 1}`,
      kind: 'noise-random',
      brand: brand.name,
      dates: Array.from({ length: count }, () => addDays(start, randInt(builder.rng, 0, windowDays))),
      amounts: Array.from({ length: count }, () => money(base * (0.6 + builder.rng() * 0.8))),
      isSubscription: false,
      cycle: null,
    });
  });
}

/**
 * يضيف الأخطاء الواقعية الثلاثة التي تحتويها كشوف الحسابات فعلاً:
 * مبالغ مستردة (إيداعات)، وصفوف مكرّرة (خصم مضاعف)، وأوصاف فارغة.
 *
 * لكلٍّ منها أثر مقصود على خط المعالجة:
 * - **الاستردادات** إيداعات، و`groupByMerchant` يستبعد الإيداعات افتراضياً.
 * - **الصفوف المكرّرة** تُنتج فارقاً بصفر أيام داخل مجموعة اشتراك، فتخفض
 *   درجة انتظامها قليلاً بلا أن تُسقطها — سلوك مطلوب لا خطأ.
 * - **الأوصاف الفارغة** يتخطّاها المحوّل بسبب مقروء ولا توقف الملف.
 */
function addRealisticErrors(
  builder: Builder,
  start: string,
  months: number,
  usedBrands: ReadonlySet<string>,
): void {
  const windowDays = Math.round(months * 30.4);

  // 1) مبالغ مستردة — من تاجر لم يستعمله أي بذرة أخرى، حتى يبقى ربط العملية
  //    ببذرتها في الحقيقة الأرضية أحادياً بلا التباس
  const available = RANDOM_BRANDS.filter((brand) => !usedBrands.has(brand.name));
  const refundCount = randInt(builder.rng, 2, 4);
  const refundBrand = pick(builder.rng, available.length > 0 ? available : RANDOM_BRANDS);
  addSeries(builder, {
    id: 'noise-refund',
    kind: 'noise-refund',
    brand: refundBrand.name,
    dates: Array.from({ length: refundCount }, () =>
      addDays(start, randInt(builder.rng, 0, windowDays)),
    ),
    amounts: Array.from({ length: refundCount }, () =>
      money(priceIn(refundBrand.sar, builder.format.currency) * (0.5 + builder.rng())),
    ),
    isSubscription: false,
    cycle: null,
    direction: 'credit',
  });

  // 2) صفوف مكرّرة: نسخة طبق الأصل من خصوم اشتراك قائمة
  const subscriptionRows = builder.transactions.filter((transaction) =>
    transaction.seedId.startsWith('sub-'),
  );
  const duplicateCount = Math.min(randInt(builder.rng, 1, 3), subscriptionRows.length);
  for (let i = 0; i < duplicateCount; i += 1) {
    const source = pick(builder.rng, subscriptionRows);
    builder.transactions.push({ ...source });
  }

  // 3) أوصاف فارغة
  const malformedCount = randInt(builder.rng, 1, 3);
  for (let i = 0; i < malformedCount; i += 1) {
    builder.transactions.push({
      seedId: 'noise-malformed',
      date: addDays(start, randInt(builder.rng, 0, windowDays)),
      description: '',
      amount: money(20 + builder.rng() * 200),
      currency: builder.format.currency,
      direction: 'debit',
    });
  }
  builder.seeds.push({
    id: 'noise-malformed',
    kind: 'noise-malformed',
    brand: '',
    isSubscription: false,
    cycle: null,
    amount: 0,
    hasPriceIncrease: false,
    isFreeTrialConverted: false,
    cancelled: false,
    occurrences: malformedCount,
  });
}

// ─── كتابة الملف ───────────────────────────────────────────────────────────

/** يغلّف خلية CSV بعلامات اقتباس عند الحاجة (فاصلة، اقتباس، سطر جديد). */
function escapeCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * يكتب العمليات كملف CSV بتنسيق البنك المطلوب.
 *
 * @param format تنسيق البنك
 * @param transactions العمليات مرتّبة زمنياً
 * @returns نص الملف كاملاً بما فيه صف الترويسة
 */
function renderCsv(format: FormatSpec, transactions: readonly Transaction[]): string {
  let balance = 25_000;
  const lines = [format.headers.map(escapeCell).join(',')];

  for (const transaction of transactions) {
    balance += transaction.direction === 'debit' ? -transaction.amount : transaction.amount;
    lines.push(format.row(transaction, money(balance)).map(escapeCell).join(','));
  }

  return `${lines.join('\n')}\n`;
}

// ─── نقطة الدخول ───────────────────────────────────────────────────────────

/** خيارات توليد كشف واحد. */
export type GenerateOptions = {
  /** البذرة الرقمية — نفس البذرة تعطي نفس الكشف حرفياً. */
  seed: number;
  /** معرّف تنسيق البنك؛ الافتراضي يُشتق من البذرة. */
  adapterId?: string;
  /** عدد الشهور 6–12؛ الافتراضي يُشتق من البذرة. */
  months?: number;
  /** معرّف الكشف للعرض في التقارير. */
  id?: string;
};

/**
 * يولّد كشف حساب اصطناعياً كاملاً بحقيقته الأرضية.
 *
 * تركيبة كل كشف ثابتة في **أنواع** بذوره ومتغيّرة في تفاصيلها: ثلاثة اشتراكات
 * شهرية ثابتة، واحد بدورة 28 يوماً، واحد سنوي، واحد ارتفع سعره، واحد بدأ
 * بتجربة، واحد أُلغي — ثم الإيجار والبقالة والمشتريات المتفرّقة والأخطاء.
 *
 * @param options البذرة والتنسيق وعدد الشهور
 * @returns الكشف كاملاً: عمليات موسومة + حقيقة أرضية + ملف CSV
 *
 * @example
 * const statement = generateStatement({ seed: 7 });
 * importCsvText(statement.csv); // يمرّ على نفس خط الاستيراد الحقيقي
 */
export function generateStatement(options: GenerateOptions): SyntheticStatement {
  const rng = mulberry32(options.seed);

  const format =
    FORMATS.find((entry) => entry.adapterId === options.adapterId) ??
    (FORMATS[options.seed % FORMATS.length] as FormatSpec);

  const months = options.months ?? 6 + (options.seed % 7);

  // نبدأ من أول شهر ثابت لا من "اليوم": الحتمية تمنع أن يتغيّر الكشف كل يوم
  const startYear = 2023 + (options.seed % 2);
  const start = `${startYear}-0${1 + (options.seed % 3)}-0${1 + (options.seed % 5)}`;

  const builder: Builder = { rng, format, transactions: [], seeds: [] };

  // نخلط الكتالوجات مرة واحدة حتى لا يتكرّر تاجر في بذرتين داخل كشف واحد
  const monthlyPool = shuffle(rng, MONTHLY_BRANDS);
  const randomPool = shuffle(rng, RANDOM_BRANDS).slice(0, randInt(rng, 10, 18));

  addFixedMonthlySubscriptions(builder, monthlyPool.slice(0, 3), start, months);
  addDriftingSubscription(builder, monthlyPool[3] as Brand, start, months);
  addAnnualSubscription(builder, pick(rng, ANNUAL_BRANDS), start, months);
  addPriceIncreaseSubscription(builder, monthlyPool[4] as Brand, start, months);
  addFreeTrialSubscription(builder, pick(rng, TRIAL_BRANDS), start, months);
  addCancelledSubscription(builder, pick(rng, CANCELLED_BRANDS), start, months);
  addFxWobbleSubscription(builder, monthlyPool[5] as Brand, start, months);
  addSkippedMonthSubscription(builder, monthlyPool[6] as Brand, start, months);

  addRent(builder, start, months);
  addGroceries(builder, pick(rng, GROCERY_BRANDS), start, months);
  addRecurringNoise(builder, FUEL_BRAND, start, months);
  addRandomPurchases(builder, randomPool, start, months);
  addRealisticErrors(
    builder,
    start,
    months,
    new Set(builder.seeds.map((seed) => seed.brand)),
  );

  const transactions = builder.transactions.sort(
    (left, right) => left.date.localeCompare(right.date) || left.amount - right.amount,
  );

  return {
    id: options.id ?? `stmt-${String(options.seed).padStart(2, '0')}`,
    seed: options.seed,
    adapterId: format.adapterId,
    currency: format.currency,
    months,
    firstDate: transactions[0]?.date ?? start,
    lastDate: transactions[transactions.length - 1]?.date ?? start,
    transactions,
    seeds: builder.seeds,
    csv: renderCsv(format, transactions),
  };
}

/** ▲ ثابت ▲ عدد الكشوف في مجموعة التقييم — تطابق ما تطلبه مواصفة الجزء 3. */
export const CORPUS_SIZE = 12;

/**
 * يولّد مجموعة التقييم كاملة: 12 كشفاً موزّعة بالتساوي على تنسيقات البنوك.
 *
 * التوزيع بالتناوب لا بالعشوائية، حتى يأخذ كل تنسيق نصيباً متساوياً بالضبط
 * ولا يعتمد الرقم النهائي على حظّ البذرة.
 *
 * @param size عدد الكشوف؛ الافتراضي `CORPUS_SIZE`
 * @returns الكشوف بترتيب ثابت
 */
export function generateCorpus(size: number = CORPUS_SIZE): SyntheticStatement[] {
  return Array.from({ length: size }, (_, index) =>
    generateStatement({
      seed: 1000 + index * 37,
      adapterId: SYNTHETIC_FORMAT_IDS[index % SYNTHETIC_FORMAT_IDS.length] as string,
      months: 6 + (index % 7),
      id: `stmt-${String(index + 1).padStart(2, '0')}`,
    }),
  );
}

/** ▲ ثابت ▲ بذرة العرض التجريبي في الواجهة — كشف ثري يُظهر كل الحالات. */
export const DEMO_SEED = 20_240_301;

/**
 * يولّد الكشف التجريبي الذي يعرضه زر "جرّب ببيانات تجريبية".
 *
 * اثنا عشر شهراً بتنسيق الراجحي: مدة كافية لظهور كل الحالات (زيادة السعر،
 * التجربة المتحوّلة، الإلغاء) في شاشة واحدة.
 *
 * @returns الكشف التجريبي
 */
export function generateDemoStatement(): SyntheticStatement {
  return generateStatement({ seed: DEMO_SEED, adapterId: 'alrajhi', months: 12, id: 'demo' });
}
