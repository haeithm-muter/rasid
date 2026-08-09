/**
 * سكربت القياس الكمّي: كم من الاشتراكات يجدها رصيد فعلاً، وكم يخترع؟
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * لماذا يوجد هذا الملف
 * ═══════════════════════════════════════════════════════════════════════════
 * بدونه يبقى المشروع ادّعاءً. أي كاشف اشتراكات يمكنه أن يبدو ممتازاً على مثال
 * مختار بعناية؛ الرقم الوحيد ذو المعنى هو الذي يخرج من بيانات لم تُختَر لتُرضي
 * المحرك، بحقيقة أرضية معروفة سلفاً، بأمر واحد يعيد إنتاج نفسه.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * كيف يُنسب ما كشفه المحرك إلى الحقيقة الأرضية
 * ═══════════════════════════════════════════════════════════════════════════
 * لا نقارن الأسماء نصّياً — أسماء التجّار تمرّ على `merchantNormalizer` فتتغيّر.
 * بدل ذلك كل عملية اصطناعية تحمل `seedId` يقول أي بذرة ولّدتها، فنبني خريطة
 * `الوصف الخام → البذرة`، ثم ننسب كل مجموعة كشفها المحرك إلى **البذرة صاحبة
 * أغلب عملياتها**. هذا يقيس ما نريد قياسه فعلاً: هل جمع المحرك عمليات التاجر
 * الصحيح معاً، لا هل صادف أن سمّاه بنفس الاسم.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * قواعد الحساب
 * ═══════════════════════════════════════════════════════════════════════════
 * - **صحيح موجب (TP):** مجموعة مقبولة أغلب عملياتها من بذرة اشتراك حقيقي، ولم
 *   تُنسب تلك البذرة لمجموعة أخرى قبلها.
 * - **خاطئ موجب (FP):** مجموعة مقبولة أغلب عملياتها من بذرة ليست اشتراكاً —
 *   **أو** بذرة اشتراك حُسبت مرّتين، أي انقسم تاجر واحد إلى مجموعتين. الانقسام
 *   خطأ حقيقي يراه المستخدم قائمتين لاشتراك واحد، فيُحسب عليه لا له.
 * - **خاطئ سالب (FN):** بذرة اشتراك لم تُنسب إليها أي مجموعة مقبولة.
 *
 * كل الدوال هنا نقية ما عدا `runEvaluation` التي تقيس الزمن. تاريخ التشغيل
 * يُمرَّر من الخارج ولا يُقرأ هنا، حتى تبقى النتيجة قابلة للمقارنة بين تشغيلين.
 */

import { SUBSCRIPTION_CONFIDENCE_THRESHOLD, decide } from '../src/core/decision';
import { detectSubscriptions } from '../src/core/detectionEngine';
import type { SubscriptionCandidate } from '../src/core/detectionEngine';
import { importCsvText } from '../src/core/importCsv';
import { MIN_TRANSACTIONS_FOR_PERIODICITY } from '../src/core/periodicity';
import type { CycleKind } from '../src/core/periodicity';
import { CORPUS_SIZE, generateCorpus } from '../src/core/synthetic';
import type { SeedKind, SyntheticSeed, SyntheticStatement } from '../src/core/synthetic';

// ─── الأنواع ───────────────────────────────────────────────────────────────

/** مجموعة كشفها المحرك، منسوبةً إلى بذرتها. */
export type CandidateMatch = {
  candidate: SubscriptionCandidate;
  /** البذرة صاحبة أغلب عمليات المجموعة، و`null` إذا تعذّرت النسبة. */
  seed: SyntheticSeed | null;
  /** نسبة عمليات المجموعة العائدة لتلك البذرة (1 = مجموعة نقيّة). */
  purity: number;
  /** هل قبلها `decide` عند العتبة المستخدمة؟ */
  accepted: boolean;
};

/** مصفوفة الالتباس عند عتبة واحدة. */
export type Confusion = {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  recall: number;
  precision: number;
  f1: number;
};

/** حالة اشتراك حقيقي لم يُكشف، مع سببها التقريبي. */
export type MissedCase = {
  statementId: string;
  seedId: string;
  brand: string;
  kind: SeedKind;
  occurrences: number;
  /** أعلى درجة ثقة بلغتها أي مجموعة نُسبت لهذه البذرة، و`null` إن لم توجد. */
  bestConfidence: number | null;
  cause: string;
};

/** مجموعة كُشفت وليست اشتراكاً. */
export type FalsePositiveCase = {
  statementId: string;
  merchant: string;
  seedKind: SeedKind | 'غير منسوب';
  confidence: number;
  occurrences: number;
};

/** دقة وسم واحد (زيادة سعر / تجربة متحوّلة) على الاشتراكات المكتشفة. */
export type FlagAccuracy = {
  /** كم حالة زُرعت فعلاً بين المكتشفات. */
  expected: number;
  /** كم منها حمل الوسم. */
  correctlyFlagged: number;
  /** كم مجموعة حملت الوسم بلا أن تُزرع فيها الحالة. */
  falselyFlagged: number;
  /** النسبة: المصاب ÷ المزروع. */
  recall: number;
  /** النسبة: المصاب ÷ (المصاب + الخاطئ). */
  precision: number;
};

/** دقة تصنيف نوع الدورة على الاشتراكات المكتشفة. */
export type CycleAccuracy = {
  total: number;
  correct: number;
  ratio: number;
  /** تفصيل: الدورة الحقيقية → { صحيح، خطأ، وأشهر تصنيف خاطئ }. */
  byCycle: { cycle: CycleKind; total: number; correct: number; confusedWith: string[] }[];
};

/** نقطة واحدة في مسح العتبات. */
export type SweepPoint = { threshold: number } & Confusion;

/**
 * recall مفصولاً حسب نوع الحالة المزروعة.
 *
 * الرقم المجمّع وحده يخفي أين تقع الأخطاء بالضبط: recall بنسبة 88% قد يعني
 * "يخطئ قليلاً في كل شيء" أو "مثالي في كل شيء عدا نوع واحد يسقط كاملاً"، وهما
 * حالتان مختلفتان تماماً في ما ينبغي فعله بعدهما. هذا الجدول يفصلهما.
 */
export type RecallByKind = {
  kind: SeedKind;
  total: number;
  found: number;
  ratio: number;
};

/** ملخّص كشف واحد داخل التقرير. */
export type StatementSummary = {
  id: string;
  adapterId: string;
  /** هل تعرّف `detectAdapter` على التنسيق الصحيح تلقائياً؟ */
  adapterDetected: boolean;
  months: number;
  rows: number;
  transactions: number;
  skippedRows: number;
  groundTruthSubscriptions: number;
  detected: number;
};

/** التقرير الكامل. */
export type EvaluationReport = {
  generatedAt: string;
  threshold: number;
  statements: StatementSummary[];
  totalTransactions: number;
  totalRows: number;
  confusion: Confusion;
  /** recall لكل نوع حالة على حدة — يكشف أين تتركّز الأخطاء بالضبط. */
  recallByKind: RecallByKind[];
  cycle: CycleAccuracy;
  priceIncrease: FlagAccuracy;
  freeTrial: FlagAccuracy;
  /** زمن خط المعالجة الكامل (استيراد + كشف) لكل 1000 عملية — وسيط التكرارات. */
  msPer1000: number;
  /** أسرع وأبطأ تكرار — يُعرض حتى لا يُقرأ الوسيط كأنه رقم قاطع. */
  msPer1000Range: { fastest: number; slowest: number };
  /** عدد مرات إعادة القياس. */
  timingRepeats: number;
  missed: MissedCase[];
  falsePositives: FalsePositiveCase[];
  sweep: SweepPoint[];
  /** كم كشفاً تعرّف عليه الكاشف التلقائي بلا تدخّل. */
  adapterDetectionRatio: number;
};

// ─── أدوات ─────────────────────────────────────────────────────────────────

/** قسمة آمنة تعيد 0 بدل `NaN` عند صفر المقام. */
function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** نسبة مئوية بخانة عشرية واحدة. */
export function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * ينسب مجموعة مكتشفة إلى البذرة صاحبة أغلب عملياتها.
 *
 * @param candidate المجموعة كما خرجت من المحرك
 * @param seedByDescription خريطة الوصف الخام → معرّف البذرة
 * @param seedsById الحقيقة الأرضية مفهرسة بالمعرّف
 * @returns البذرة الغالبة ونقاء المجموعة
 */
function attribute(
  candidate: SubscriptionCandidate,
  seedByDescription: ReadonlyMap<string, string>,
  seedsById: ReadonlyMap<string, SyntheticSeed>,
): { seed: SyntheticSeed | null; purity: number } {
  const counts = new Map<string, number>();
  for (const transaction of candidate.transactions) {
    const seedId = seedByDescription.get(transaction.description);
    if (seedId === undefined) continue;
    counts.set(seedId, (counts.get(seedId) ?? 0) + 1);
  }

  let bestId: string | null = null;
  let bestCount = 0;
  for (const [seedId, count] of counts) {
    if (count > bestCount) {
      bestId = seedId;
      bestCount = count;
    }
  }

  if (bestId === null) return { seed: null, purity: 0 };
  return {
    seed: seedsById.get(bestId) ?? null,
    purity: ratio(bestCount, candidate.transactions.length),
  };
}

/** نتيجة تحليل كشف واحد قبل تطبيق أي عتبة. */
type AnalyzedStatement = {
  statement: SyntheticStatement;
  summary: StatementSummary;
  matches: CandidateMatch[];
  /** بذور الاشتراك الحقيقية في هذا الكشف. */
  truth: SyntheticSeed[];
};

/**
 * يمرّر كشفاً اصطناعياً على خط المعالجة الحقيقي كاملاً وينسب مخرجاته لبذوره.
 *
 * **نفس الخط الذي تستعمله الواجهة بالضبط**: `importCsvText` ثم
 * `detectSubscriptions`. لا اختصار ولا حقن عمليات جاهزة — لو كان تنسيق البنك
 * نفسه معطوباً لظهر ذلك هنا رقماً منخفضاً، وهذا مقصود.
 *
 * @param statement الكشف الاصطناعي
 * @returns المجموعات منسوبةً + ملخّص الكشف
 */
function analyzeStatement(statement: SyntheticStatement): AnalyzedStatement {
  const imported = importCsvText(statement.csv);
  const { candidates } = detectSubscriptions(imported.transactions);

  const seedByDescription = new Map<string, string>();
  for (const transaction of statement.transactions) {
    if (transaction.description !== '') {
      seedByDescription.set(transaction.description, transaction.seedId);
    }
  }
  const seedsById = new Map(statement.seeds.map((seed) => [seed.id, seed] as const));

  const matches: CandidateMatch[] = candidates.map((candidate) => {
    const { seed, purity } = attribute(candidate, seedByDescription, seedsById);
    return { candidate, seed, purity, accepted: false };
  });

  const truth = statement.seeds.filter((seed) => seed.isSubscription);

  return {
    statement,
    matches,
    truth,
    summary: {
      id: statement.id,
      adapterId: statement.adapterId,
      adapterDetected: imported.adapter.id === statement.adapterId,
      months: statement.months,
      rows: statement.transactions.length,
      transactions: imported.transactions.length,
      skippedRows: imported.skipped.length,
      groundTruthSubscriptions: truth.length,
      detected: 0,
    },
  };
}

/** ناتج تطبيق عتبة على كشف محلَّل. */
type Scored = {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  matchedSeedIds: Set<string>;
  acceptedMatches: CandidateMatch[];
  falsePositiveCases: FalsePositiveCase[];
};

/**
 * يطبّق عتبة ثقة على كشف محلَّل ويحسب مصفوفة الالتباس الخاصة به.
 *
 * الترتيب مهم: نمرّ على المجموعات **بترتيب الثقة تنازلياً** حتى إذا انقسم تاجر
 * إلى مجموعتين نُسبت البذرة إلى أقواهما، وحُسبت الأخرى خطأً موجباً.
 *
 * @param analyzed الكشف بعد التحليل
 * @param threshold عتبة الثقة
 * @returns الأعداد الخام + تفاصيل الأخطاء الموجبة
 */
function score(analyzed: AnalyzedStatement, threshold: number): Scored {
  const ordered = [...analyzed.matches].sort(
    (left, right) => right.candidate.confidence - left.candidate.confidence,
  );

  const matchedSeedIds = new Set<string>();
  const acceptedMatches: CandidateMatch[] = [];
  const falsePositiveCases: FalsePositiveCase[] = [];
  let truePositives = 0;
  let falsePositives = 0;

  for (const match of ordered) {
    const decision = decide(match.candidate, threshold);
    if (!decision.accepted) continue;

    const accepted: CandidateMatch = { ...match, accepted: true };
    acceptedMatches.push(accepted);

    const isRealSubscription = match.seed?.isSubscription === true;
    const alreadyCounted = match.seed !== null && matchedSeedIds.has(match.seed.id);

    if (isRealSubscription && !alreadyCounted) {
      truePositives += 1;
      matchedSeedIds.add((match.seed as SyntheticSeed).id);
    } else {
      falsePositives += 1;
      falsePositiveCases.push({
        statementId: analyzed.statement.id,
        merchant: match.candidate.merchant,
        seedKind: match.seed?.kind ?? 'غير منسوب',
        confidence: match.candidate.confidence,
        occurrences: match.candidate.occurrences,
      });
    }
  }

  return {
    truePositives,
    falsePositives,
    falseNegatives: analyzed.truth.length - truePositives,
    matchedSeedIds,
    acceptedMatches,
    falsePositiveCases,
  };
}

/** يجمع أعداداً خاماً في مصفوفة التباس كاملة بنسبها. */
function toConfusion(
  truePositives: number,
  falsePositives: number,
  falseNegatives: number,
): Confusion {
  const recall = ratio(truePositives, truePositives + falseNegatives);
  const precision = ratio(truePositives, truePositives + falsePositives);
  return {
    truePositives,
    falsePositives,
    falseNegatives,
    recall,
    precision,
    f1: ratio(2 * recall * precision, recall + precision),
  };
}

/**
 * يستنتج السبب التقريبي لفوات اشتراك حقيقي.
 *
 * الأسباب مرتّبة بالأسبقية: نقص العمليات أولاً (سبب بنيوي لا علاج له عند هذه
 * النافذة الزمنية)، ثم الاستبعاد بالفئة، ثم العتبة، ثم فشل التجميع.
 *
 * @param seed البذرة الفائتة
 * @param seedMatches المجموعات المنسوبة إليها
 * @param threshold العتبة المستخدمة
 * @returns سبب مقروء بالعربية
 */
function diagnose(
  seed: SyntheticSeed,
  seedMatches: readonly CandidateMatch[],
  threshold: number,
): string {
  if (seed.occurrences < MIN_TRANSACTIONS_FOR_PERIODICITY) {
    return `ظهر ${seed.occurrences} مرة فقط داخل النافذة — دون الحد الأدنى (${MIN_TRANSACTIONS_FOR_PERIODICITY}) للحديث عن تكرار`;
  }

  if (seedMatches.length === 0) {
    return 'لم تتجمّع أوصافه في مجموعة بلغت الحد الأدنى — تشتّت التوحيد';
  }

  const best = seedMatches.reduce((top, match) =>
    match.candidate.confidence > top.candidate.confidence ? match : top,
  );

  if (decide(best.candidate, threshold).exclusion === 'non-subscription-category') {
    return 'استُبعد لمطابقته كلمة فئة غير اشتراكية';
  }

  return `أعلى درجة ثقة ${best.candidate.confidence.toFixed(2)} دون العتبة ${threshold.toFixed(2)} (انتظام ${best.candidate.periodicity.regularity.toFixed(2)}، ثبات ${best.candidate.effectiveStability.score.toFixed(2)})`;
}

/** يحسب دقة وسم واحد على المجموعات المقبولة المنسوبة لاشتراكات حقيقية. */
function flagAccuracy(
  matches: readonly CandidateMatch[],
  expectedOf: (seed: SyntheticSeed) => boolean,
  flagged: (candidate: SubscriptionCandidate) => boolean,
): FlagAccuracy {
  let expected = 0;
  let correctlyFlagged = 0;
  let falselyFlagged = 0;

  for (const match of matches) {
    if (match.seed === null || !match.seed.isSubscription) continue;
    const shouldFlag = expectedOf(match.seed);
    const didFlag = flagged(match.candidate);

    if (shouldFlag) expected += 1;
    if (shouldFlag && didFlag) correctlyFlagged += 1;
    if (!shouldFlag && didFlag) falselyFlagged += 1;
  }

  return {
    expected,
    correctlyFlagged,
    falselyFlagged,
    recall: ratio(correctlyFlagged, expected),
    precision: ratio(correctlyFlagged, correctlyFlagged + falselyFlagged),
  };
}

/** يحسب دقة تصنيف نوع الدورة على المجموعات المقبولة. */
function cycleAccuracy(matches: readonly CandidateMatch[]): CycleAccuracy {
  const buckets = new Map<CycleKind, { total: number; correct: number; confusedWith: string[] }>();
  let total = 0;
  let correct = 0;

  for (const match of matches) {
    if (match.seed === null || !match.seed.isSubscription || match.seed.cycle === null) continue;

    const expected = match.seed.cycle;
    const actual = match.candidate.periodicity.cycle;
    const bucket = buckets.get(expected) ?? { total: 0, correct: 0, confusedWith: [] };

    bucket.total += 1;
    total += 1;
    if (expected === actual) {
      bucket.correct += 1;
      correct += 1;
    } else if (!bucket.confusedWith.includes(actual)) {
      bucket.confusedWith.push(actual);
    }
    buckets.set(expected, bucket);
  }

  return {
    total,
    correct,
    ratio: ratio(correct, total),
    byCycle: [...buckets.entries()]
      .map(([cycle, bucket]) => ({ cycle, ...bucket }))
      .sort((left, right) => right.total - left.total),
  };
}

/**
 * ▲ ثابت ▲ عدد مرات إعادة قياس الزمن.
 *
 * قياس واحد لا يكفي: التشغيلة الأولى تدفع ثمن تسخين مترجم JIT وتخصيص الذاكرة،
 * وأي نشاط آخر على الجهاز يلوّثها. لوحظ فرق يبلغ ثلاثة أضعاف بين تشغيلتين
 * متتاليتين على نفس الجهاز ونفس البيانات — وهو ما يجعل الرقم المفرد بلا معنى.
 */
export const TIMING_REPEATS = 5;

/** ▲ ثابت ▲ العتبات التي يمسحها التقرير — منها تُعايَر عتبة `decision.ts`. */
export const SWEEP_THRESHOLDS: readonly number[] = [
  0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9,
];

/** خيارات التشغيل. */
export type EvaluationOptions = {
  /** تاريخ التشغيل — يُمرَّر من الخارج حتى تبقى الدالة قابلة للاختبار. */
  generatedAt: string;
  /** عدد الكشوف؛ الافتراضي `CORPUS_SIZE`. */
  size?: number;
  /** العتبة المعروضة في العناوين؛ الافتراضي عتبة `decision.ts`. */
  threshold?: number;
};

/**
 * يشغّل التقييم الكامل على مجموعة الكشوف الاصطناعية.
 *
 * @param options تاريخ التشغيل وحجم المجموعة والعتبة
 * @returns التقرير بكل أرقامه
 */
export function runEvaluation(options: EvaluationOptions): EvaluationReport {
  const threshold = options.threshold ?? SUBSCRIPTION_CONFIDENCE_THRESHOLD;
  const corpus = generateCorpus(options.size ?? CORPUS_SIZE);

  const analyzed = corpus.map((statement) => analyzeStatement(statement));

  const totalTransactions = analyzed.reduce((sum, item) => sum + item.summary.transactions, 0);
  const totalRows = analyzed.reduce((sum, item) => sum + item.summary.rows, 0);

  // ─── قياس الزمن: تكرارات ثم **وسيطها** لا متوسطها ───────────────────────
  // نفس المبدأ الذي يقوم عليه المحرك كلّه (`stats.ts`): تشغيلة واحدة بطيئة
  // بسبب نشاط عابر على الجهاز تجرّ المتوسط خلفها، ولا تحرّك الوسيط.
  const samples: number[] = [];
  for (let repeat = 0; repeat < TIMING_REPEATS; repeat += 1) {
    const started = performance.now();
    for (const statement of corpus) analyzeStatement(statement);
    samples.push(((performance.now() - started) / totalTransactions) * 1000);
  }
  samples.sort((left, right) => left - right);

  // العتبة المعتمدة: الأرقام الرئيسية وجداول الأخطاء
  const missed: MissedCase[] = [];
  const falsePositives: FalsePositiveCase[] = [];
  const acceptedMatches: CandidateMatch[] = [];
  let truePositives = 0;
  let falsePositives_ = 0;
  let falseNegatives = 0;

  const byKind = new Map<SeedKind, { total: number; found: number }>();

  for (const item of analyzed) {
    const scored = score(item, threshold);
    truePositives += scored.truePositives;
    falsePositives_ += scored.falsePositives;
    falseNegatives += scored.falseNegatives;
    acceptedMatches.push(...scored.acceptedMatches);
    falsePositives.push(...scored.falsePositiveCases);
    item.summary.detected = scored.truePositives;

    for (const seed of item.truth) {
      const bucket = byKind.get(seed.kind) ?? { total: 0, found: 0 };
      bucket.total += 1;
      if (scored.matchedSeedIds.has(seed.id)) bucket.found += 1;
      byKind.set(seed.kind, bucket);

      if (scored.matchedSeedIds.has(seed.id)) continue;
      const seedMatches = item.matches.filter((match) => match.seed?.id === seed.id);
      missed.push({
        statementId: item.statement.id,
        seedId: seed.id,
        brand: seed.brand,
        kind: seed.kind,
        occurrences: seed.occurrences,
        bestConfidence:
          seedMatches.length === 0
            ? null
            : Math.max(...seedMatches.map((match) => match.candidate.confidence)),
        cause: diagnose(seed, seedMatches, threshold),
      });
    }
  }

  // مسح العتبات: يعيد استخدام نفس التحليل، فالتكلفة الإضافية شبه معدومة
  const sweep: SweepPoint[] = SWEEP_THRESHOLDS.map((sweepThreshold) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const item of analyzed) {
      const scored = score(item, sweepThreshold);
      tp += scored.truePositives;
      fp += scored.falsePositives;
      fn += scored.falseNegatives;
    }
    return { threshold: sweepThreshold, ...toConfusion(tp, fp, fn) };
  });

  return {
    generatedAt: options.generatedAt,
    threshold,
    statements: analyzed.map((item) => item.summary),
    totalTransactions,
    totalRows,
    confusion: toConfusion(truePositives, falsePositives_, falseNegatives),
    recallByKind: [...byKind.entries()]
      .map(([kind, bucket]) => ({ kind, ...bucket, ratio: ratio(bucket.found, bucket.total) }))
      .sort((left, right) => right.total - left.total || left.kind.localeCompare(right.kind)),
    cycle: cycleAccuracy(acceptedMatches),
    priceIncrease: flagAccuracy(
      acceptedMatches,
      (seed) => seed.hasPriceIncrease,
      (candidate) => candidate.flags.includes('price-increase'),
    ),
    freeTrial: flagAccuracy(
      acceptedMatches,
      (seed) => seed.isFreeTrialConverted,
      (candidate) => candidate.flags.includes('free-trial-converted'),
    ),
    msPer1000: samples[Math.floor(samples.length / 2)] ?? 0,
    msPer1000Range: {
      fastest: samples[0] ?? 0,
      slowest: samples[samples.length - 1] ?? 0,
    },
    timingRepeats: TIMING_REPEATS,
    missed,
    falsePositives,
    sweep,
    adapterDetectionRatio: ratio(
      analyzed.filter((item) => item.summary.adapterDetected).length,
      analyzed.length,
    ),
  };
}
