/**
 * جذر التطبيق: آلة الحالات الثلاث (استقبال → معالجة → نتائج) وتبديل اللغة.
 *
 * المكوّن لا يعرف شيئاً عن العامل ولا عن محرك الكشف؛ كل ذلك خلف `useAnalysis`.
 * ما يفعله هنا ثلاثة أشياء فقط: يختار أي شاشة تُعرض، ويضبط اتجاه الصفحة حسب
 * اللغة، ويحتفظ بآخر ملف ليعيد المحاولة به عند اختيار البنك يدوياً.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { DIRECTION, LOCALES, LOCALE_NAMES, messagesFor, preferredLocale } from './i18n';
import type { Locale } from './i18n';
import { useAnalysis } from './useAnalysis';
import { UploadView } from './UploadView';
import { ProcessingView } from './ProcessingView';
import { ResultsView } from './ResultsView';
import { ErrorView } from './ErrorView';

/**
 * التطبيق كاملاً.
 *
 * @returns شجرة الواجهة
 */
export function App(): ReactElement {
  const [locale, setLocale] = useState<Locale>(() =>
    preferredLocale(typeof navigator === 'undefined' ? [] : navigator.languages),
  );
  const [lastFile, setLastFile] = useState<File | null>(null);

  const strings = messagesFor(locale);
  const { state, analyzeFile, analyzeDemo, reset } = useAnalysis();

  // اتجاه الصفحة ولغتها يعيشان على `<html>` لا داخل React: خصائص المستند
  // تؤثّر على التمرير والتحديد والخطوط الافتراضية خارج شجرة التطبيق.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = DIRECTION[locale];
    document.title = `${messagesFor(locale).app.name} — ${messagesFor(locale).app.tagline}`;
  }, [locale]);

  const onFile = useCallback(
    (file: File) => {
      setLastFile(file);
      void analyzeFile(file);
    },
    [analyzeFile],
  );

  const onDemo = useCallback(() => {
    setLastFile(null);
    analyzeDemo();
  }, [analyzeDemo]);

  const onRetryWithAdapter = useCallback(
    (adapterId: string) => {
      if (lastFile === null) return;
      void analyzeFile(lastFile, adapterId);
    },
    [analyzeFile, lastFile],
  );

  const onReset = useCallback(() => {
    setLastFile(null);
    reset();
  }, [reset]);

  /** اللغة التالية في الدورة — مع لغتين هي ببساطة الأخرى. */
  const nextLocale = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length] as Locale;

  return (
    <div className="app">
      <header className="topbar">
        <p className="topbar__brand">
          <span className="topbar__logo" aria-hidden="true">
            ⌾
          </span>
          {strings.app.name}
        </p>

        <button
          type="button"
          className="button button--quiet"
          onClick={() => setLocale(nextLocale)}
          lang={nextLocale}
        >
          {LOCALE_NAMES[nextLocale]}
        </button>
      </header>

      <main className="main">
        {state.phase === 'idle' && (
          <UploadView strings={strings} locale={locale} onFile={onFile} onDemo={onDemo} />
        )}

        {state.phase === 'processing' && (
          <ProcessingView
            stage={state.stage}
            ratio={state.ratio}
            strings={strings}
            locale={locale}
          />
        )}

        {state.phase === 'done' && (
          <ResultsView
            result={state.result}
            strings={strings}
            locale={locale}
            onReset={onReset}
          />
        )}

        {state.phase === 'error' && (
          <ErrorView
            errorKind={state.errorKind}
            message={state.message}
            headers={state.headers}
            strings={strings}
            onRetryWithAdapter={onRetryWithAdapter}
            onReset={onReset}
          />
        )}
      </main>

      <footer className="footer">
        <p>{strings.app.footer}</p>
      </footer>
    </div>
  );
}
