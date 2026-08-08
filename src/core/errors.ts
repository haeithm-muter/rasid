/**
 * أخطاء المشروع. كلها ترث من `RasidError` حتى تستطيع الواجهة (الجزء 3)
 * التمييز بين خطأ متوقّع نعرضه للمستخدم وخطأ برمجي غير متوقّع.
 */

/** الأصل المشترك لكل أخطاء رصيد المتوقّعة. */
export class RasidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RasidError';
  }
}

/** فشل قراءة/تحليل ملف CSV نفسه (ملف فارغ، بلا ترويسة، ترميز غير مقروء...). */
export class CsvParseError extends RasidError {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

/** تعذّر تفسير نص كتاريخ صالح. */
export class DateParseError extends RasidError {
  /** النص الخام الذي فشل تحليله (مفيد لعرضه في رسالة الخطأ). */
  readonly raw: string;

  constructor(message: string, raw: string) {
    super(message);
    this.name = 'DateParseError';
    this.raw = raw;
  }
}

/** تعذّر تفسير نص كمبلغ رقمي صالح. */
export class AmountParseError extends RasidError {
  /** النص الخام الذي فشل تحليله. */
  readonly raw: string;

  constructor(message: string, raw: string) {
    super(message);
    this.name = 'AmountParseError';
    this.raw = raw;
  }
}

/**
 * فشل الكشف التلقائي عن تنسيق البنك.
 * `candidates` يحمل معرّفات المحوّلات المرشّحة حتى تعرضها الواجهة لاحقاً
 * في خيار "اختيار البنك يدوياً".
 */
export class AdapterDetectionError extends RasidError {
  readonly candidates: readonly string[];
  readonly headers: readonly string[];

  constructor(message: string, headers: readonly string[], candidates: readonly string[]) {
    super(message);
    this.name = 'AdapterDetectionError';
    this.headers = headers;
    this.candidates = candidates;
  }
}

/** لا يوجد أي محوّل يطابق ترويسة الملف. */
export class NoMatchingAdapterError extends AdapterDetectionError {
  constructor(headers: readonly string[], candidates: readonly string[]) {
    super(
      `تعذّر التعرّف على تنسيق كشف الحساب. الأعمدة الموجودة: [${headers.join(', ')}]. ` +
        `المحوّلات المتاحة للاختيار اليدوي: [${candidates.join(', ')}].`,
      headers,
      candidates,
    );
    this.name = 'NoMatchingAdapterError';
  }
}

/** أكثر من محوّل يطابق الترويسة بنفس الدرجة — يلزم اختيار يدوي. */
export class AmbiguousAdapterError extends AdapterDetectionError {
  constructor(headers: readonly string[], candidates: readonly string[]) {
    super(
      `أكثر من تنسيق يطابق هذا الملف بنفس الدرجة: [${candidates.join(', ')}]. ` +
        `يلزم اختيار البنك يدوياً.`,
      headers,
      candidates,
    );
    this.name = 'AmbiguousAdapterError';
  }
}
