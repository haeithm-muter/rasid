/**
 * عقد الرسائل بين الواجهة والعامل (Web Worker).
 *
 * ملف مستقل عن العامل نفسه عمداً: لو عُرِّفت الأنواع داخل `analysis.worker.ts`
 * لاضطرّت الواجهة إلى استيراد وحدة العامل لتقرأها، فيدخل كود العامل في حزمة
 * الصفحة الرئيسية ويضيع نصف الفائدة. هنا أنواع خالصة تُمحى وقت البناء.
 *
 * **كل ما يعبر هذه الحدود يجب أن يكون قابلاً للنسخ البنيوي** (structured clone):
 * كائنات ومصفوفات وأرقام ونصوص فقط. لا دوال، ولا أصناف، ولا `Map`. مخرجات
 * `analyzeCsvBytes` كلها كذلك بحكم أن `src/core` بيانات نقية.
 */

import type { AnalysisResult, AnalysisStage } from '../core/analyze';

/** طلب موجَّه إلى العامل. */
export type WorkerRequest =
  | {
      kind: 'analyze-file';
      /** محتوى الملف الخام؛ يُنقل ملكيته للعامل بدل نسخه. */
      bytes: ArrayBuffer;
      /** معرّف محوّل يُفرض يدوياً بعد فشل الكشف التلقائي. */
      adapterId?: string;
    }
  | {
      kind: 'analyze-demo';
    };

/** أصناف الأخطاء التي تحتاج الواجهة أن تميّزها لتعرض إجراءً مختلفاً. */
export type WorkerErrorKind = 'no-adapter' | 'csv' | 'unexpected';

/** ردّ قادم من العامل. */
export type WorkerResponse =
  | {
      kind: 'progress';
      stage: AnalysisStage;
      ratio: number;
    }
  | {
      kind: 'done';
      result: AnalysisResult;
      /** زمن التحليل داخل العامل بالمللي ثانية. */
      elapsedMs: number;
    }
  | {
      kind: 'error';
      errorKind: WorkerErrorKind;
      message: string;
      /** أسماء الأعمدة التي وجدها — تُعرض حين يفشل كشف التنسيق. */
      headers?: string[];
      /** معرّفات المحوّلات المرشّحة للاختيار اليدوي. */
      candidates?: string[];
    };
