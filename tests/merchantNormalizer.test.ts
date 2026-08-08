import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  areSimilar,
  buildMerchantIndex,
  cleanDescription,
  clusterDescriptions,
  levenshtein,
  similarity,
} from '../src/core/merchantNormalizer';
import type { Transaction } from '../src/core/types';

/** هل اجتمع كل هؤلاء في مجموعة واحدة؟ */
function inSameCluster(descriptions: readonly string[], threshold?: number): boolean {
  const clusters = clusterDescriptions(descriptions, threshold === undefined ? {} : { threshold });
  return clusters.length === 1;
}

/** كم مجموعة نتجت عن هذه الأوصاف؟ */
function clusterCount(descriptions: readonly string[], threshold?: number): number {
  return clusterDescriptions(descriptions, threshold === undefined ? {} : { threshold }).length;
}

describe('cleanDescription — تنظيف الوصف الخام', () => {
  it('يحذف رقم الهاتف ورمز الدولة ولاحقة النطاق', () => {
    expect(cleanDescription('NETFLIX.COM 866-579-7172 CA')).toBe('NETFLIX');
  });

  it('يحذف بادئة نقاط البيع والنجمة ورقم المرجع', () => {
    expect(cleanDescription('POS NETFLIX.COM*4423')).toBe('NETFLIX');
  });

  it('يحذف اسم المدينة الأجنبية', () => {
    expect(cleanDescription('NETFLIX.COM AMSTERDAM NL')).toBe('NETFLIX');
  });

  it('يحذف اللاحقة القانونية ورمز المرجع الحرفي-الرقمي', () => {
    expect(cleanDescription('SPOTIFY AB STOCKHOLM')).toBe('SPOTIFY');
    expect(cleanDescription('SPOTIFY P123456789')).toBe('SPOTIFY');
    expect(cleanDescription('Spotify*ABC123')).toBe('SPOTIFY');
  });

  it('ينظّف الوصف العربي: مدى، شراء، المدينة، رقم المرجع', () => {
    expect(cleanDescription('مدى-شراء-جرير-الرياض-1234')).toBe('جرير');
    expect(cleanDescription('شراء نقاط بيع - نتفلكس')).toBe('نتفلكس');
  });

  it('يوحّد الحالة والمسافات الزائدة', () => {
    expect(cleanDescription('  netflix  ')).toBe('NETFLIX');
    expect(cleanDescription('UBER   *TRIP')).toBe('UBER TRIP');
  });

  it('يحذف تكرار الكلمة نفسها داخل الوصف', () => {
    expect(cleanDescription('UBER *TRIP HELP.UBER.COM')).toBe('UBER TRIP');
  });

  it('يحذف جملة الدفع الكاملة ويبقي التاجر وحده', () => {
    expect(cleanDescription('CARD PAYMENT TO STC REF 123456')).toBe('STC');
  });

  it('يُبقي الأرقام المفردة لأنها قد تكون جزءاً من الاسم', () => {
    expect(cleanDescription('7-ELEVEN 123')).toBe('7 ELEVEN');
  });

  it('لا يبتلع الحروف المفردة في أسماء مثل AT&T', () => {
    expect(cleanDescription('AT&T WIRELESS')).toBe('AT T WIRELESS');
  });

  it('يحذف قناع رقم البطاقة', () => {
    expect(cleanDescription('AMAZON XXXX1234')).toBe('AMAZON');
    expect(cleanDescription('AMAZON XXXX')).toBe('AMAZON');
  });

  it('يعيد النص المطبَّع بدل الفراغ حين يكون كل الوصف ضجيجاً', () => {
    expect(cleanDescription('POS PURCHASE 123456')).toBe('POS PURCHASE 123456');
  });

  it('يتعامل مع الوصف الفارغ', () => {
    expect(cleanDescription('')).toBe('');
    expect(cleanDescription('   ')).toBe('');
  });
});

describe('levenshtein — مطوّرة من الصفر', () => {
  it('يعطي صفراً للنصين المتطابقين', () => {
    expect(levenshtein('NETFLIX', 'NETFLIX')).toBe(0);
    expect(levenshtein('', '')).toBe(0);
  });

  it('يعطي طول النص حين يكون الآخر فارغاً', () => {
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('', 'abcd')).toBe(4);
  });

  it('يطابق النتائج المرجعية المعروفة', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('saturday', 'sunday')).toBe(3);
    expect(levenshtein('flaw', 'lawn')).toBe(2);
  });

  it('متماثل في الاتجاهين', () => {
    expect(levenshtein('STARBUCKS', 'STARBUCK')).toBe(levenshtein('STARBUCK', 'STARBUCKS'));
  });

  it('يعمل على النص العربي', () => {
    expect(levenshtein('نتفلكس', 'نتفليكس')).toBe(1);
  });

  it('يتوقّف مبكراً عند تجاوز الحد الأقصى', () => {
    expect(levenshtein('kitten', 'sitting', 1)).toBe(2);
    expect(levenshtein('kitten', 'sitting', 5)).toBe(3);
  });
});

describe('similarity و areSimilar', () => {
  it('يعطي 1 للمتطابقين و0 للمتباعدين تماماً', () => {
    expect(similarity('NETFLIX', 'NETFLIX')).toBe(1);
    expect(similarity('', '')).toBe(1);
    expect(similarity('AAAA', 'BBBB')).toBe(0);
  });

  it('يحسب النسبة على طول أطول النصين', () => {
    expect(similarity('STARBUCKS', 'STARBUCK')).toBeCloseTo(0.889, 3);
  });

  it('areSimilar يوافق similarity على نفس العتبة', () => {
    expect(areSimilar('STARBUCKS', 'STARBUCK', 0.82)).toBe(true);
    expect(areSimilar('SHELL', 'SHEIN', 0.82)).toBe(false);
    expect(areSimilar('SHELL', 'SHEIN', 0.5)).toBe(true);
  });
});

describe('التجميع — أوصاف يجب أن تتجمّع', () => {
  it('1. أشكال نتفلكس الثلاثة تتجمّع في تاجر واحد', () => {
    expect(
      inSameCluster([
        'NETFLIX.COM 866-579-7172 CA',
        'NETFLIX.COM AMSTERDAM NL',
        'POS NETFLIX.COM*4423',
      ]),
    ).toBe(true);
  });

  it('2. أشكال سبوتيفاي تتجمّع رغم اختلاف الأرقام المرجعية', () => {
    expect(inSameCluster(['SPOTIFY P123456789', 'SPOTIFY AB STOCKHOLM', 'Spotify*ABC123'])).toBe(
      true,
    );
  });

  it('3. الوصف العربي بمدى ومدينة ورقم يتجمّع مع الاسم المجرّد', () => {
    expect(inSameCluster(['مدى-شراء-جرير-الرياض-1234', 'شراء جرير الرياض', 'جرير'])).toBe(true);
  });

  it('4. أشكال أمازون ماركت بليس تتجمّع', () => {
    expect(inSameCluster(['AMZN Mktp SA*1A2B3C', 'AMZN MKTP SA'])).toBe(true);
  });

  it('5. خطأ إملائي بحرف واحد يتجمّع', () => {
    expect(inSameCluster(['STARBUCKS RIYADH', 'STARBUCK RIYADH'])).toBe(true);
  });

  it('6. تكرار اسم التاجر داخل الوصف لا يمنع التجمّع', () => {
    expect(inSameCluster(['UBER   *TRIP', 'UBER *TRIP HELP.UBER.COM'])).toBe(true);
  });

  it('7. الوصف العربي مع جملة نقاط البيع يتجمّع مع الاسم المجرّد', () => {
    expect(inSameCluster(['شراء نقاط بيع - نتفلكس', 'نتفلكس'])).toBe(true);
  });

  it('8. جملة الدفع الإنجليزية الكاملة تتجمّع مع الاسم المجرّد', () => {
    expect(inSameCluster(['CARD PAYMENT TO STC REF 123456', 'STC'])).toBe(true);
  });

  it('9. اختلاف الحالة والمسافات وحده لا ينشئ مجموعة ثانية', () => {
    expect(inSameCluster(['netflix', 'NETFLIX', '  Netflix  '])).toBe(true);
  });

  it('10. اختلاف موضع المسافة داخل الاسم لا يفرّق المجموعة', () => {
    expect(inSameCluster(['GOOGLE *YOUTUBEPREMIUM', 'GOOGLE*YOUTUBE PREMIUM'])).toBe(true);
  });
});

describe('التجميع — أوصاف يجب ألا تتجمّع', () => {
  it('11. STC و STC PAY خدمتان مختلفتان', () => {
    expect(clusterCount(['STC', 'STC PAY'])).toBe(2);
  });

  it('12. كارفور وكريم تاجران مختلفان رغم تشابه البداية', () => {
    expect(clusterCount(['CARREFOUR', 'CAREEM'])).toBe(2);
  });

  it('13. SHELL و SHEIN لا يتجمّعان على العتبة الافتراضية', () => {
    expect(clusterCount(['SHELL', 'SHEIN'])).toBe(2);
  });

  it('14. منتجا جوجل المختلفان يبقيان منفصلين', () => {
    expect(clusterCount(['GOOGLE *YOUTUBEPREMIUM', 'GOOGLE *GOOGLE STORAGE'])).toBe(2);
  });

  it('15. فاتورة أبل ومتجر أبل يبقيان منفصلين', () => {
    expect(clusterCount(['APPLE.COM/BILL', 'APPLE STORE JEDDAH'])).toBe(2);
  });

  it('16. أمازون وأمازون برايم يبقيان منفصلين (اشتراك مستقل)', () => {
    expect(clusterCount(['AMAZON', 'AMAZON PRIME'])).toBe(2);
  });

  it('17. تاجران عربيان مختلفان تماماً', () => {
    expect(clusterCount(['مكتبة جرير', 'مطعم البيك'])).toBe(2);
  });

  it('18. لا يحدث تسلسل يبتلع تجّاراً متباعدين في مجموعة واحدة', () => {
    // كل جار يشبه الذي يليه، لكن الطرفين متباعدان — التجميع بالقائد يمنع الابتلاع
    expect(clusterCount(['SHELL', 'SHEIN', 'SHEEN'])).toBeGreaterThan(1);
  });
});

describe('التجميع — البنية والمخرجات', () => {
  it('يحتفظ بكل الأوصاف الأصلية داخل المجموعة للتحقق اليدوي', () => {
    const raws = ['NETFLIX.COM 866-579-7172 CA', 'NETFLIX.COM AMSTERDAM NL', 'POS NETFLIX.COM*4423'];
    const [cluster] = clusterDescriptions(raws);

    expect(cluster?.variants.map((variant) => variant.raw).sort()).toEqual([...raws].sort());
  });

  it('يعدّ تكرار كل شكل ومجموع المجموعة', () => {
    const [cluster] = clusterDescriptions([
      'POS NETFLIX.COM*4423',
      'POS NETFLIX.COM*4423',
      'NETFLIX.COM AMSTERDAM NL',
    ]);

    expect(cluster?.count).toBe(3);
    expect(cluster?.variants.find((v) => v.raw === 'POS NETFLIX.COM*4423')?.count).toBe(2);
  });

  it('يختار الاسم الموحّد من أكثر الأشكال تكراراً', () => {
    const [cluster] = clusterDescriptions([
      'STARBUCK RIYADH',
      'STARBUCKS RIYADH',
      'STARBUCKS RIYADH',
      'STARBUCKS RIYADH',
    ]);

    expect(cluster?.canonical).toBe('STARBUCKS');
  });

  it('يرتّب المجموعات بالأكثر ظهوراً', () => {
    const clusters = clusterDescriptions(['SHEIN', 'NETFLIX', 'NETFLIX', 'NETFLIX']);

    expect(clusters[0]?.canonical).toBe('NETFLIX');
    expect(clusters[0]?.count).toBe(3);
  });

  it('يعطي نتيجة حتمية لا تتأثّر بترتيب المدخلات', () => {
    const first = clusterDescriptions(['NETFLIX', 'SHEIN', 'NETFLIX']);
    const second = clusterDescriptions(['SHEIN', 'NETFLIX', 'NETFLIX']);

    expect(first.map((c) => c.canonical)).toEqual(second.map((c) => c.canonical));
  });

  it('يعيد قائمة فارغة لمدخلات فارغة', () => {
    expect(clusterDescriptions([])).toEqual([]);
  });

  it('يتعامل مع الأوصاف الفارغة بلا انهيار', () => {
    const clusters = clusterDescriptions(['', '   ', 'NETFLIX']);

    expect(clusters.some((cluster) => cluster.canonical === 'NETFLIX')).toBe(true);
  });
});

describe('التجميع — معايرة العتبة', () => {
  it('العتبة الافتراضية معلنة وقابلة للتجاوز', () => {
    expect(DEFAULT_SIMILARITY_THRESHOLD).toBe(0.82);
  });

  it('خفض العتبة يدمج ما كان منفصلاً', () => {
    expect(clusterCount(['SHELL', 'SHEIN'], 0.82)).toBe(2);
    expect(clusterCount(['SHELL', 'SHEIN'], 0.5)).toBe(1);
  });

  it('رفع العتبة يفصل ما كان مدموجاً', () => {
    expect(clusterCount(['STARBUCKS RIYADH', 'STARBUCK RIYADH'], 0.82)).toBe(1);
    expect(clusterCount(['STARBUCKS RIYADH', 'STARBUCK RIYADH'], 0.95)).toBe(2);
  });

  it('العتبة 1 تعني التطابق التام بعد التنظيف فقط', () => {
    expect(clusterCount(['STARBUCKS', 'STARBUCK'], 1)).toBe(2);
    expect(clusterCount(['POS NETFLIX.COM*4423', 'NETFLIX.COM AMSTERDAM NL'], 1)).toBe(1);
  });
});

describe('buildMerchantIndex — المدخل الجاهز للجزء 2', () => {
  /** يبني عملية اختبارية بوصف محدّد. */
  function transaction(description: string, date: string): Transaction {
    return { date, description, amount: 56, currency: 'SAR', direction: 'debit' };
  }

  it('يربط كل وصف خام باسم تاجره الموحّد', () => {
    const { clusters, byDescription } = buildMerchantIndex([
      transaction('POS NETFLIX.COM*4423', '2024-01-03'),
      transaction('NETFLIX.COM AMSTERDAM NL', '2024-02-03'),
      transaction('STC PAY', '2024-02-05'),
    ]);

    expect(clusters).toHaveLength(2);
    expect(byDescription.get('POS NETFLIX.COM*4423')).toBe('NETFLIX');
    expect(byDescription.get('NETFLIX.COM AMSTERDAM NL')).toBe('NETFLIX');
    expect(byDescription.get('STC PAY')).toBe('STC PAY');
  });

  it('يعيد فهرساً فارغاً بلا عمليات', () => {
    const { clusters, byDescription } = buildMerchantIndex([]);

    expect(clusters).toEqual([]);
    expect(byDescription.size).toBe(0);
  });
});
