import { describe, expect, it } from 'vitest';
import { STAGE_PROGRESS, analyzeCsvBytes, analyzeCsvText } from '../src/core/analyze';
import type { AnalysisStage } from '../src/core/analyze';
import { AdapterDetectionError, CsvParseError } from '../src/core/errors';
import { generateDemoStatement, generateStatement } from '../src/core/synthetic';

const demo = generateDemoStatement();

describe('analyzeCsvText — خط المعالجة الكامل', () => {
  const result = analyzeCsvText(demo.csv);

  it('يكشف تنسيق البنك ويسمّيه', () => {
    expect(result.adapterId).toBe(demo.adapterId);
    expect(result.adapterLabel.length).toBeGreaterThan(0);
  });

  it('يعيد عدد الصفوف والعمليات ومدى التواريخ', () => {
    expect(result.rowCount).toBe(demo.transactions.length);
    expect(result.transactionCount).toBeGreaterThan(0);
    expect(result.firstDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.lastDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.firstDate! <= result.lastDate!).toBe(true);
  });

  it('يجد اشتراكات الكشف التجريبي', () => {
    expect(result.summary.count).toBeGreaterThan(0);
    expect(result.summary.accepted.length).toBe(result.summary.count);
  });

  it('يستبعد الإيجار المزروع بفئته ويبقيه معروضاً', () => {
    expect(result.summary.flaggedCategories.length).toBeGreaterThan(0);
    expect(result.summary.flaggedCategories.some((item) => item.category === 'rent')).toBe(true);
  });

  it('يعرض وسمي زيادة السعر والتجربة المتحوّلة المزروعين', () => {
    const flags = result.summary.accepted.flatMap((item) => item.candidate.flags);
    expect(flags).toContain('price-increase');
    expect(flags).toContain('free-trial-converted');
  });

  it('يحتفظ بالعمليات الأصلية كاملةً داخل كل مرشّح — أساس التحقّق اليدوي', () => {
    for (const item of result.summary.accepted) {
      expect(item.candidate.transactions.length).toBe(item.candidate.occurrences);
      for (const transaction of item.candidate.transactions) {
        // الوصف الخام كما ورد في الملف، لا الاسم الموحّد
        expect(transaction.description.length).toBeGreaterThan(0);
      }
    }
  });

  it('يجمع الصفوف المتخطّاة مع أسبابها بدل إسقاط الملف', () => {
    expect(result.skippedRows.length).toBeGreaterThan(0);
    for (const skipped of result.skippedRows) {
      expect(skipped.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('analyzeCsvText — التقدّم', () => {
  it('يبلّغ كل المراحل بالترتيب وبنسب صاعدة تنتهي عند الواحد', () => {
    const seen: { stage: AnalysisStage; ratio: number }[] = [];
    analyzeCsvText(demo.csv, { onProgress: (stage, ratio) => seen.push({ stage, ratio }) });

    expect(seen.map((entry) => entry.stage)).toEqual([
      'parsing',
      'converting',
      'detecting',
      'summarizing',
      'done',
    ]);

    for (let i = 1; i < seen.length; i += 1) {
      expect((seen[i] as { ratio: number }).ratio).toBeGreaterThan(
        (seen[i - 1] as { ratio: number }).ratio,
      );
    }
    expect(seen[seen.length - 1]?.ratio).toBe(1);
  });

  it('كل نسبة معلنة تطابق جدول `STAGE_PROGRESS`', () => {
    analyzeCsvText(demo.csv, {
      onProgress: (stage, ratio) => expect(ratio).toBe(STAGE_PROGRESS[stage]),
    });
  });

  it('يعمل بلا مُبلِّغ تقدّم إطلاقاً', () => {
    expect(() => analyzeCsvText(demo.csv)).not.toThrow();
  });
});

describe('analyzeCsvBytes — القراءة من بايتات الملف', () => {
  it('يعطي نفس نتيجة النص حين يكون الترميز UTF-8', () => {
    const bytes = new TextEncoder().encode(demo.csv);
    const fromBytes = analyzeCsvBytes(bytes);
    const fromText = analyzeCsvText(demo.csv);

    expect(fromBytes.encoding).toBe('utf-8');
    expect(fromBytes.transactionCount).toBe(fromText.transactionCount);
    expect(fromBytes.summary.count).toBe(fromText.summary.count);
  });

  it('يبلّغ مرحلة فكّ الترميز قبل بقية المراحل', () => {
    const stages: AnalysisStage[] = [];
    analyzeCsvBytes(new TextEncoder().encode(demo.csv), {
      onProgress: (stage) => stages.push(stage),
    });
    expect(stages[0]).toBe('decoding');
  });
});

describe('analyzeCsvText — الأخطاء المتوقّعة', () => {
  it('يرمي `CsvParseError` للملف الفارغ', () => {
    expect(() => analyzeCsvText('')).toThrow(CsvParseError);
  });

  it('يرمي `AdapterDetectionError` لترويسة غير معروفة، حاملاً الأعمدة والمرشّحين', () => {
    try {
      analyzeCsvText('col_a,col_b\n1,2');
      expect.unreachable('كان يجب أن يرمي خطأ كشف التنسيق');
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterDetectionError);
      const detection = error as AdapterDetectionError;
      expect(detection.headers).toEqual(['col_a', 'col_b']);
      expect(detection.candidates.length).toBeGreaterThan(0);
    }
  });

  it('يقبل تنسيقاً مفروضاً يدوياً بدل الكشف التلقائي', () => {
    const statement = generateStatement({ seed: 3, adapterId: 'snb', months: 8 });
    const forced = analyzeCsvText(statement.csv, { adapterId: 'snb' });
    expect(forced.adapterId).toBe('snb');
  });

  it('يرمي خطأً واضحاً لمعرّف محوّل غير موجود', () => {
    expect(() => analyzeCsvText(demo.csv, { adapterId: 'not-a-bank' })).toThrow(
      AdapterDetectionError,
    );
  });
});

describe('analyzeCsvText — كل التنسيقات المسجّلة', () => {
  it('يعمل على كل تنسيق بنكي بلا تدخّل يدوي', () => {
    for (const adapterId of ['alrajhi', 'snb', 'chase', 'enbd']) {
      const statement = generateStatement({ seed: 11, adapterId, months: 10 });
      const analysis = analyzeCsvText(statement.csv);

      expect(analysis.adapterId, adapterId).toBe(adapterId);
      expect(analysis.summary.count, adapterId).toBeGreaterThan(3);
    }
  });
});
