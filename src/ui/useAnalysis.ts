/**
 * خُطّاف React يملك دورة حياة العامل ويحوّل رسائله إلى حالة معروضة.
 *
 * كل ما يخصّ العامل محبوس هنا: إنشاؤه، إنهاؤه، والإصغاء له. المكوّنات تتعامل
 * مع حالة واحدة (`AnalysisState`) ولا تعرف أن هناك خيطاً ثانياً أصلاً.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisResult, AnalysisStage } from '../core/analyze';
import type { WorkerErrorKind, WorkerRequest, WorkerResponse } from './workerProtocol';

/** حالة التحليل كما تراها الواجهة. */
export type AnalysisState =
  | { phase: 'idle' }
  | { phase: 'processing'; stage: AnalysisStage; ratio: number }
  | { phase: 'done'; result: AnalysisResult; elapsedMs: number }
  | {
      phase: 'error';
      errorKind: WorkerErrorKind;
      message: string;
      headers: string[];
      candidates: string[];
    };

/** ما يعيده الخُطّاف للواجهة. */
export type AnalysisApi = {
  state: AnalysisState;
  /** يحلّل ملفاً اختاره المستخدم. */
  analyzeFile: (file: File, adapterId?: string) => Promise<void>;
  /** يحلّل الكشف التجريبي المولَّد محلياً. */
  analyzeDemo: () => void;
  /** يعيد الحالة إلى شاشة الاستقبال. */
  reset: () => void;
};

/**
 * ينشئ العامل.
 *
 * `new URL(..., import.meta.url)` هو الشكل الذي يتعرّف عليه Vite فيحزم العامل
 * ملفاً منفصلاً محلياً — لا رابط خارجي ولا CDN.
 */
function createWorker(): Worker {
  return new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
}

/**
 * خُطّاف التحليل.
 *
 * العامل يُنشأ مرّة واحدة عند التركيب ويُنهى عند التفكيك. لا نُنشئ عاملاً لكل
 * ملف: إنشاؤه ليس مجانياً، وإبقاؤه حيّاً يجعل الملف الثاني أسرع من الأول.
 *
 * @returns الحالة والإجراءات
 */
export function useAnalysis(): AnalysisApi {
  const [state, setState] = useState<AnalysisState>({ phase: 'idle' });
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = createWorker();
    workerRef.current = worker;

    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;

      if (response.kind === 'progress') {
        setState({ phase: 'processing', stage: response.stage, ratio: response.ratio });
        return;
      }

      if (response.kind === 'done') {
        setState({ phase: 'done', result: response.result, elapsedMs: response.elapsedMs });
        return;
      }

      setState({
        phase: 'error',
        errorKind: response.errorKind,
        message: response.message,
        headers: response.headers ?? [],
        candidates: response.candidates ?? [],
      });
    });

    // خطأ في العامل نفسه (فشل تحميل الوحدة مثلاً) لا يمرّ عبر بروتوكول الرسائل
    worker.addEventListener('error', (event) => {
      setState({
        phase: 'error',
        errorKind: 'unexpected',
        message: event.message,
        headers: [],
        candidates: [],
      });
    });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const send = useCallback((request: WorkerRequest, transfer: Transferable[] = []) => {
    const worker = workerRef.current;
    if (worker === null) return;

    setState({ phase: 'processing', stage: 'decoding', ratio: 0 });
    worker.postMessage(request, transfer);
  }, []);

  const analyzeFile = useCallback(
    async (file: File, adapterId?: string) => {
      // القراءة تتم في خيط الواجهة لأن `File.arrayBuffer` غير محجوبة، ثم
      // **يُنقل** المخزن المؤقت للعامل بدل نسخه — فلا تُضاعَف ذاكرة الملف.
      const bytes = await file.arrayBuffer();
      send(
        adapterId === undefined
          ? { kind: 'analyze-file', bytes }
          : { kind: 'analyze-file', bytes, adapterId },
        [bytes],
      );
    },
    [send],
  );

  const analyzeDemo = useCallback(() => {
    send({ kind: 'analyze-demo' });
  }, [send]);

  const reset = useCallback(() => setState({ phase: 'idle' }), []);

  return { state, analyzeFile, analyzeDemo, reset };
}
