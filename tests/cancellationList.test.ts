import { describe, expect, it } from 'vitest';
import { summarizeDecision } from '../src/core/decision';
import { analyzeGroup } from '../src/core/detectionEngine';
import type { SubscriptionCandidate } from '../src/core/detectionEngine';
import { buildCancellationList } from '../src/ui/cancellationList';
import { LOCALES, messagesFor } from '../src/ui/i18n';

/** يبني مرشّحاً حقيقياً عبر المحرك نفسه. */
function candidate(
  description: string,
  amount: number,
  count = 10,
  stepDays = 30,
): SubscriptionCandidate {
  return analyzeGroup({
    merchant: description,
    currency: 'SAR',
    transactions: Array.from({ length: count }, (_, index) => ({
      date: new Date(Date.UTC(2024, 0, 5 + index * stepDays)).toISOString().slice(0, 10),
      description,
      amount,
      currency: 'SAR',
      direction: 'debit' as const,
    })),
  });
}

const netflix = candidate('NETFLIX', 56);
const spotify = candidate('SPOTIFY', 21);
const rent = candidate('ايجار شقه', 3500);

const summary = summarizeDecision([netflix, spotify, rent]);

describe('buildCancellationList — ملف قائمة الإلغاء', () => {
  const strings = messagesFor('ar');
  const text = buildCancellationList({ strings, locale: 'ar', summary, today: '2024-12-31' });

  it('يبدأ بعنوان القائمة', () => {
    expect(text.startsWith(strings.exportFile.heading)).toBe(true);
  });

  it('يذكر تاريخ الإصدار الممرَّر لا تاريخ اليوم', () => {
    expect(text).toContain('2024');
    expect(text).toContain(strings.exportFile.generatedBy);
  });

  it('يدرج كل اشتراك مقبول مرقّماً', () => {
    expect(text).toContain('1. NETFLIX');
    expect(text).toContain('2. SPOTIFY');
  });

  it('يستبعد الرسوم غير الاشتراكية من القائمة', () => {
    expect(text).not.toContain('ايجار');
    expect(text).not.toContain('3500');
  });

  it('يذكر المبلغ والدورة والتاريخين لكل بند', () => {
    const line = text.split('\n').find((row) => row.includes('56')) ?? '';
    expect(line).toContain(strings.cycles.monthly);
    expect(line).toContain('2024');
  });

  it('يعرض مجموع الكلفة الشهرية والسنوية', () => {
    expect(text).toContain(strings.results.perMonth);
    const monthly = summary.totals[0]?.monthly ?? 0;
    // الرقم يظهر منسّقاً؛ يكفي التحقق من جزئه الصحيح
    expect(text).toContain(String(Math.trunc(monthly)));
  });

  it('ينتهي بتنبيه المراجعة اليدوية', () => {
    expect(text).toContain(strings.exportFile.disclaimer);
  });

  it('يذكر وسوم البند حين توجد', () => {
    const withIncrease = analyzeGroup({
      merchant: 'ADOBE',
      currency: 'SAR',
      transactions: [56, 56, 56, 56, 70, 70, 70, 70].map((amount, index) => ({
        date: new Date(Date.UTC(2024, 0, 5 + index * 30)).toISOString().slice(0, 10),
        description: 'ADOBE',
        amount,
        currency: 'SAR',
        direction: 'debit' as const,
      })),
    });

    expect(withIncrease.flags).toContain('price-increase');
    const listed = buildCancellationList({
      strings,
      locale: 'ar',
      summary: summarizeDecision([withIncrease]),
      today: '2024-12-31',
    });
    expect(listed).toContain(strings.flags['price-increase']);
  });

  it('يبني الملف بكل لغة مدعومة بلا مفتاح مفقود', () => {
    for (const locale of LOCALES) {
      const output = buildCancellationList({
        strings: messagesFor(locale),
        locale,
        summary,
        today: '2024-12-31',
      });

      expect(output).toContain(messagesFor(locale).exportFile.heading);
      expect(output).toContain('NETFLIX');
      expect(output).not.toContain('undefined');
      expect(output).not.toContain('[object Object]');
    }
  });

  it('ينتج ملفاً صالحاً بلا أي اشتراك مقبول', () => {
    const empty = buildCancellationList({
      strings,
      locale: 'ar',
      summary: summarizeDecision([rent]),
      today: '2024-12-31',
    });

    expect(empty).toContain(strings.exportFile.heading);
    expect(empty).toContain(strings.exportFile.disclaimer);
  });
});
