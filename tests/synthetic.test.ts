import { describe, expect, it } from 'vitest';
import { detectAdapter } from '../src/adapters';
import { parseCsv } from '../src/core/csv';
import { importCsvText } from '../src/core/importCsv';
import { MIN_TRANSACTIONS_FOR_PERIODICITY } from '../src/core/periodicity';
import {
  CORPUS_SIZE,
  SYNTHETIC_FORMAT_IDS,
  generateCorpus,
  generateDemoStatement,
  generateStatement,
  mulberry32,
} from '../src/core/synthetic';
import type { SeedKind, SyntheticStatement } from '../src/core/synthetic';

/** أنواع البذور التي تفرض المواصفة وجودها في كل كشف. */
const REQUIRED_KINDS: readonly SeedKind[] = [
  'subscription-monthly',
  'subscription-drifting-28d',
  'subscription-annual',
  'subscription-price-increase',
  'subscription-free-trial',
  'subscription-cancelled',
  'noise-rent',
  'noise-groceries',
  'noise-random',
  'noise-refund',
  'noise-malformed',
];

const corpus = generateCorpus();

// ─── الحتمية ──────────────────────────────────────────────────────────────

describe('mulberry32 — العشوائية الحتمية', () => {
  it('يعطي نفس التسلسل لنفس البذرة', () => {
    const first = Array.from({ length: 5 }, mulberry32(42));
    const second = Array.from({ length: 5 }, mulberry32(42));
    expect(first).toEqual(second);
  });

  it('يعطي تسلسلاً مختلفاً لبذرة مختلفة', () => {
    expect(Array.from({ length: 5 }, mulberry32(1))).not.toEqual(
      Array.from({ length: 5 }, mulberry32(2)),
    );
  });

  it('يبقى داخل المجال [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('generateStatement — الحتمية الكاملة', () => {
  it('ينتج نفس الملف حرفياً لنفس البذرة', () => {
    const a = generateStatement({ seed: 99 });
    const b = generateStatement({ seed: 99 });
    expect(a.csv).toBe(b.csv);
    expect(a.transactions).toEqual(b.transactions);
    expect(a.seeds).toEqual(b.seeds);
  });

  it('ينتج ملفاً مختلفاً لبذرة مختلفة', () => {
    expect(generateStatement({ seed: 1 }).csv).not.toBe(generateStatement({ seed: 2 }).csv);
  });

  it('لا يعتمد على الزمن الحاضر — تواريخه ثابتة عبر التشغيلات', () => {
    expect(generateStatement({ seed: 5 }).firstDate).toBe(generateStatement({ seed: 5 }).firstDate);
  });
});

// ─── بنية المجموعة ────────────────────────────────────────────────────────

describe('generateCorpus — مجموعة التقييم', () => {
  it('يولّد اثني عشر كشفاً كما تنصّ المواصفة', () => {
    expect(corpus).toHaveLength(CORPUS_SIZE);
    expect(corpus).toHaveLength(12);
  });

  it('يوزّعها بالتساوي على كل تنسيقات البنوك المسجّلة', () => {
    const perFormat = new Map<string, number>();
    for (const statement of corpus) {
      perFormat.set(statement.adapterId, (perFormat.get(statement.adapterId) ?? 0) + 1);
    }

    expect([...perFormat.keys()].sort()).toEqual([...SYNTHETIC_FORMAT_IDS].sort());
    expect([...new Set(perFormat.values())]).toEqual([CORPUS_SIZE / SYNTHETIC_FORMAT_IDS.length]);
  });

  it('كل كشف يغطي بين ستة واثني عشر شهراً', () => {
    for (const statement of corpus) {
      expect(statement.months).toBeGreaterThanOrEqual(6);
      expect(statement.months).toBeLessThanOrEqual(12);
    }
  });

  it('كل كشف يحوي بين 80 و300 عملية', () => {
    for (const statement of corpus) {
      expect(statement.transactions.length).toBeGreaterThanOrEqual(80);
      expect(statement.transactions.length).toBeLessThanOrEqual(300);
    }
  });

  it('كل كشف يحوي كل الحالات التي تفرضها المواصفة', () => {
    for (const statement of corpus) {
      const kinds = new Set(statement.seeds.map((seed) => seed.kind));
      for (const required of REQUIRED_KINDS) {
        expect(kinds, `${statement.id} تنقصه ${required}`).toContain(required);
      }
    }
  });

  it('كل كشف يحوي أكثر من اشتراك شهري ثابت واحد', () => {
    for (const statement of corpus) {
      const monthly = statement.seeds.filter((seed) => seed.kind === 'subscription-monthly');
      expect(monthly.length).toBeGreaterThan(1);
    }
  });
});

// ─── سلامة الحقيقة الأرضية ────────────────────────────────────────────────

describe('الحقيقة الأرضية — قابلة للنسبة بلا التباس', () => {
  /** يبني خريطة الوصف الخام → البذور التي استعملته. */
  function descriptionOwners(statement: SyntheticStatement): Map<string, Set<string>> {
    const owners = new Map<string, Set<string>>();
    for (const transaction of statement.transactions) {
      if (transaction.description === '') continue;
      const set = owners.get(transaction.description) ?? new Set<string>();
      set.add(transaction.seedId);
      owners.set(transaction.description, set);
    }
    return owners;
  }

  it('لا يتقاسم وصفٌ خام بذرتين — وإلا استحال نسب المجموعة لأصلها', () => {
    for (const statement of corpus) {
      for (const [description, owners] of descriptionOwners(statement)) {
        expect(owners.size, `${statement.id}: "${description}" تتقاسمه بذور`).toBe(1);
      }
    }
  });

  it('لا يتقاسم تاجران اسماً تجارياً داخل الكشف الواحد', () => {
    for (const statement of corpus) {
      const brands = statement.seeds
        .filter((seed) => seed.brand !== '')
        .map((seed) => seed.brand);
      expect(new Set(brands).size, statement.id).toBe(brands.length);
    }
  });

  it('عدد العمليات المعلن في كل بذرة يطابق ما وُلّد فعلاً', () => {
    for (const statement of corpus) {
      const counted = new Map<string, number>();
      for (const transaction of statement.transactions) {
        counted.set(transaction.seedId, (counted.get(transaction.seedId) ?? 0) + 1);
      }

      for (const seed of statement.seeds) {
        // الصفوف المكرّرة تُضاف بعد تسجيل البذرة عمداً، فيزيد المعدود عن المعلن
        expect(counted.get(seed.id) ?? 0).toBeGreaterThanOrEqual(seed.occurrences);
      }
    }
  });

  it('كل عملية تنتمي إلى بذرة معلنة', () => {
    for (const statement of corpus) {
      const known = new Set(statement.seeds.map((seed) => seed.id));
      for (const transaction of statement.transactions) {
        expect(known, statement.id).toContain(transaction.seedId);
      }
    }
  });

  it('الاشتراك السنوي دون الحد الأدنى للتكرار — حالة معروفة لا مخفية', () => {
    for (const statement of corpus) {
      const annual = statement.seeds.find((seed) => seed.kind === 'subscription-annual');
      expect(annual?.isSubscription).toBe(true);
      expect(annual?.occurrences).toBeLessThan(MIN_TRANSACTIONS_FOR_PERIODICITY);
    }
  });
});

// ─── الملف الناتج ─────────────────────────────────────────────────────────

describe('ملف CSV المولَّد — يمرّ على خط الاستيراد الحقيقي', () => {
  it('يتعرّف الكاشف التلقائي على تنسيق كل كشف بلا تدخّل', () => {
    for (const statement of corpus) {
      const table = parseCsv(statement.csv);
      expect(detectAdapter(table.headers).id, statement.id).toBe(statement.adapterId);
    }
  });

  it('يقرأ الاستيراد كل الصفوف عدا الأوصاف الفارغة المزروعة عمداً', () => {
    for (const statement of corpus) {
      const imported = importCsvText(statement.csv);
      const malformed =
        statement.seeds.find((seed) => seed.kind === 'noise-malformed')?.occurrences ?? 0;

      expect(imported.skipped.length, statement.id).toBe(malformed);
      expect(imported.transactions.length).toBe(statement.transactions.length - malformed);
    }
  });

  it('يعيد كل صف متخطّى سبباً مقروءاً', () => {
    for (const statement of corpus) {
      for (const skipped of importCsvText(statement.csv).skipped) {
        expect(skipped.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('يحافظ على المبالغ والتواريخ عبر الكتابة ثم القراءة', () => {
    const statement = corpus[0] as SyntheticStatement;
    const imported = importCsvText(statement.csv);
    const expected = statement.transactions.filter((transaction) => transaction.description !== '');

    expect(imported.transactions).toHaveLength(expected.length);
    expect(imported.transactions[0]?.date).toBe(expected[0]?.date);
    expect(imported.transactions[0]?.amount).toBeCloseTo(expected[0]?.amount ?? 0, 2);
  });

  it('يضع الاستردادات في اتجاه الإيداع لا الخصم', () => {
    for (const statement of corpus) {
      const refunds = statement.transactions.filter(
        (transaction) => transaction.seedId === 'noise-refund',
      );
      expect(refunds.length).toBeGreaterThan(0);
      for (const refund of refunds) expect(refund.direction).toBe('credit');
    }
  });
});

// ─── الكشف التجريبي ───────────────────────────────────────────────────────

describe('generateDemoStatement — بيانات زر التجربة', () => {
  const demo = generateDemoStatement();

  it('يغطي اثني عشر شهراً بتنسيق معروف', () => {
    expect(demo.months).toBe(12);
    expect(SYNTHETIC_FORMAT_IDS).toContain(demo.adapterId);
  });

  it('يمرّ على الاستيراد الحقيقي بلا خطأ', () => {
    const imported = importCsvText(demo.csv);
    expect(imported.adapter.id).toBe(demo.adapterId);
    expect(imported.transactions.length).toBeGreaterThan(100);
  });

  it('ثابت عبر التشغيلات — نفس العرض التجريبي لكل زائر', () => {
    expect(generateDemoStatement().csv).toBe(demo.csv);
  });

  it('يحوي زيادة سعر وتجربة متحوّلة ليظهر الوسمان في الشاشة', () => {
    expect(demo.seeds.some((seed) => seed.hasPriceIncrease)).toBe(true);
    expect(demo.seeds.some((seed) => seed.isFreeTrialConverted)).toBe(true);
  });
});
