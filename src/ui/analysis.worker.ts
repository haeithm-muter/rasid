/**
 * العامل (Web Worker) الذي يجري كل التحليل خارج خيط الواجهة.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * لماذا عامل أصلاً
 * ═══════════════════════════════════════════════════════════════════════════
 * أثقل خطوة في المشروع هي توحيد أسماء التجّار: مقارنة ليفنشتاين بين كل وصف
 * فريد وقادة المجموعات القائمة، أي عمل تربيعي في أسوأ الحالات. على كشف من
 * ثلاثة آلاف عملية يستغرق ذلك مئات المللي ثانية **متصلة بلا انقطاع** — وهي
 * كافية لتجميد الصفحة تماماً: لا شريط تقدّم يتحرّك، ولا زرّ يستجيب، ولا حتى
 * مؤشّر نصّي يومض. المتصفح يعرض "الصفحة لا تستجيب" في الحالات الطويلة.
 *
 * تقسيم العمل إلى دفعات عبر `setTimeout` كان بديلاً ممكناً، لكنه يفرض تفكيك
 * `src/core` النقي إلى آلة حالة متقطّعة لخدمة الواجهة — والعامل يحقّق نفس
 * الغرض بلا لمس سطر واحد من المنطق: خيط ثانٍ يعمل بحرّية، وخيط الواجهة يبقى
 * حرّاً تماماً للرسم والاستجابة.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ملاحظة خصوصية
 * ═══════════════════════════════════════════════════════════════════════════
 * العامل يخضع لنفس شرط "صفر شبكة": لا `fetch` ولا `importScripts` من أي مصدر
 * خارجي هنا. كل ما يستورده وحدات محلّية تُحزَم معه وقت البناء.
 */

import { analyzeCsvBytes, analyzeCsvText } from '../core/analyze';
import { AdapterDetectionError, CsvParseError } from '../core/errors';
import { generateDemoStatement } from '../core/synthetic';
import type { WorkerErrorKind, WorkerRequest, WorkerResponse } from './workerProtocol';

/** يرسل رداً إلى خيط الواجهة. */
function respond(response: WorkerResponse): void {
  self.postMessage(response);
}

/** يحوّل خطأً إلى ردّ خطأ مفهوم للواجهة. */
function toErrorResponse(error: unknown): WorkerResponse {
  if (error instanceof AdapterDetectionError) {
    return {
      kind: 'error',
      errorKind: 'no-adapter',
      message: error.message,
      headers: [...error.headers],
      candidates: [...error.candidates],
    };
  }

  const errorKind: WorkerErrorKind = error instanceof CsvParseError ? 'csv' : 'unexpected';
  return {
    kind: 'error',
    errorKind,
    message: error instanceof Error ? error.message : String(error),
  };
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const started = performance.now();

  try {
    const result =
      request.kind === 'analyze-demo'
        ? analyzeCsvText(generateDemoStatement().csv, {
            onProgress: (stage, ratio) => respond({ kind: 'progress', stage, ratio }),
          })
        : analyzeCsvBytes(request.bytes, {
            adapterId: request.adapterId,
            onProgress: (stage, ratio) => respond({ kind: 'progress', stage, ratio }),
          });

    respond({ kind: 'done', result, elapsedMs: performance.now() - started });
  } catch (error) {
    respond(toErrorResponse(error));
  }
});
