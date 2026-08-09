import { describe, expect, it } from 'vitest';
import { DIRECTION, LOCALES, LOCALE_NAMES, MESSAGES, messagesFor, preferredLocale } from '../src/ui/i18n';
import type { Locale } from '../src/ui/i18n';
import { CYCLE_RANGES, IRREGULAR_LABEL } from '../src/core/periodicity';
import { NON_SUBSCRIPTION_KEYWORDS } from '../src/core/decision';

/**
 * يجمع كل المفاتيح في مسارات مسطّحة (`table.merchant`) مع نوع كل قيمة.
 *
 * المقارنة بالمسار لا بالمفتاح وحده: مفتاحان بنفس الاسم في فرعين مختلفين لا
 * يغني أحدهما عن الآخر، والتسطيح يجعل الفرق ظاهراً في رسالة الفشل مباشرة.
 */
function flatten(value: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();

  if (typeof value !== 'object' || value === null) {
    out.set(prefix, typeof value);
    return out;
  }

  for (const [key, child] of Object.entries(value)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof child === 'object' && child !== null) {
      for (const [innerPath, innerType] of flatten(child, path)) out.set(innerPath, innerType);
    } else {
      out.set(path, typeof child);
    }
  }

  return out;
}

describe('i18n — تطابق اللغات', () => {
  const reference = flatten(MESSAGES.ar);

  it('يعرّف كل اللغات المعلنة في القائمة', () => {
    for (const locale of LOCALES) {
      expect(MESSAGES[locale], locale).toBeDefined();
      expect(LOCALE_NAMES[locale], locale).toBeTruthy();
      expect(DIRECTION[locale], locale).toBeDefined();
    }
  });

  it('لكل لغة نفس مفاتيح العربية بلا زيادة ولا نقصان', () => {
    for (const locale of LOCALES) {
      const actual = flatten(MESSAGES[locale]);
      const missing = [...reference.keys()].filter((key) => !actual.has(key));
      const extra = [...actual.keys()].filter((key) => !reference.has(key));

      expect(missing, `${locale}: مفاتيح ناقصة`).toEqual([]);
      expect(extra, `${locale}: مفاتيح زائدة`).toEqual([]);
    }
  });

  it('نوع كل قيمة واحد في كل اللغات (نص مقابل نص، دالة مقابل دالة)', () => {
    for (const locale of LOCALES) {
      for (const [path, type] of flatten(MESSAGES[locale])) {
        expect(type, `${locale}.${path}`).toBe(reference.get(path));
      }
    }
  });

  it('لا نص فارغ في أي لغة', () => {
    for (const locale of LOCALES) {
      for (const [path, type] of flatten(MESSAGES[locale])) {
        if (type !== 'string') continue;
        const value = path
          .split('.')
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], MESSAGES[locale]);
        expect(String(value).trim(), `${locale}.${path}`).not.toBe('');
      }
    }
  });

  it('دوال الترجمة تعيد نصاً يحوي القيمة الممرَّرة', () => {
    for (const locale of LOCALES) {
      const strings = messagesFor(locale);
      expect(strings.upload.fileTooLarge(25)).toContain('25');
      expect(strings.results.skippedRows(7)).toContain('7');
      expect(strings.chart.others(3)).toContain('3');
      expect(strings.errors.columnsFound('التاريخ')).toContain('التاريخ');
    }
  });

  it('العربية من اليمين والإنجليزية من اليسار', () => {
    expect(DIRECTION.ar).toBe('rtl');
    expect(DIRECTION.en).toBe('ltr');
  });
});

describe('i18n — تغطية القيم القادمة من النواة', () => {
  it('لكل نوع دورة في `CYCLE_RANGES` ترجمة في كل اللغات', () => {
    for (const locale of LOCALES) {
      const strings = messagesFor(locale);
      for (const range of CYCLE_RANGES) {
        expect(strings.cycles[range.kind], `${locale}.${range.kind}`).toBeTruthy();
      }
      expect(strings.cycles.irregular).toBeTruthy();
    }
    // الاسم العربي في النواة موجود أصلاً؛ الواجهة لا تعتمد عليه بل تترجم بنفسها
    expect(IRREGULAR_LABEL).toBeTruthy();
  });

  it('لكل فئة غير اشتراكية ترجمة في كل اللغات', () => {
    for (const locale of LOCALES) {
      const strings = messagesFor(locale);
      for (const category of Object.keys(NON_SUBSCRIPTION_KEYWORDS)) {
        expect(
          strings.categories[category as keyof typeof strings.categories],
          `${locale}.${category}`,
        ).toBeTruthy();
      }
    }
  });

  it('لكل مستوى ثقة نصٌّ **وشكلٌ** — فالمعنى لا يُحمَل باللون وحده', () => {
    for (const locale of LOCALES) {
      const strings = messagesFor(locale);
      for (const band of ['high', 'medium', 'low'] as const) {
        expect(strings.confidence[band], `${locale}.${band}`).toBeTruthy();
        expect(strings.confidence.marks[band], `${locale}.marks.${band}`).toBeTruthy();
      }
      // الأشكال الثلاثة متمايزة، وإلا لم تغنِ عن اللون
      const marks = Object.values(strings.confidence.marks);
      expect(new Set(marks).size).toBe(marks.length);
    }
  });
});

describe('preferredLocale — استنتاج اللغة من تفضيلات المتصفح', () => {
  it('يختار العربية لأي لهجة عربية', () => {
    expect(preferredLocale(['ar-SA', 'en-US'])).toBe('ar');
    expect(preferredLocale(['AR'])).toBe('ar');
  });

  it('يختار الإنجليزية حين تسبق العربية', () => {
    expect(preferredLocale(['en-GB', 'ar'])).toBe('en');
  });

  it('يتخطّى اللغات غير المدعومة إلى أول مدعومة', () => {
    expect(preferredLocale(['fr-FR', 'de', 'en'])).toBe('en');
  });

  it('يعود إلى العربية حين لا تفضيل معروف', () => {
    expect(preferredLocale([])).toBe('ar');
    expect(preferredLocale(['fr', 'de'])).toBe('ar');
  });

  it('لا ينهار حين لا يُمرَّر شيء', () => {
    expect(LOCALES).toContain(preferredLocale() as Locale);
  });
});
