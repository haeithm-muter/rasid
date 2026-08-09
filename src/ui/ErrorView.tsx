/**
 * شاشة الخطأ — ومعها مخرج دائماً.
 *
 * حين يفشل الكشف التلقائي عن تنسيق البنك، لا نكتفي بالاعتذار: نعرض الأعمدة
 * التي وجدناها في ملفه (فيرى بعينه لماذا التبس علينا) ونعرض قائمة البنوك
 * ليختار بنكه يدوياً ونعيد المحاولة بتنسيقه. هذا هو الغرض الذي صُمِّم من أجله
 * حقل `candidates` في `AdapterDetectionError` منذ الجزء الأول.
 */

import { useState } from 'react';
import type { ReactElement } from 'react';
import { listAdapters } from '../adapters';
import type { WorkerErrorKind } from './workerProtocol';
import type { Strings } from './i18n';

/** خصائص شاشة الخطأ. */
export type ErrorViewProps = {
  errorKind: WorkerErrorKind;
  message: string;
  /** أسماء الأعمدة التي وجدها المحلّل في ملف المستخدم. */
  headers: readonly string[];
  strings: Strings;
  /** إعادة المحاولة بتنسيق مختار يدوياً. */
  onRetryWithAdapter: (adapterId: string) => void;
  /** العودة لاختيار ملف آخر. */
  onReset: () => void;
};

/**
 * شاشة الخطأ مع خيار الاختيار اليدوي.
 *
 * @param props نوع الخطأ ورسالته والإجراءات
 * @returns الشاشة
 */
export function ErrorView({
  errorKind,
  message,
  headers,
  strings,
  onRetryWithAdapter,
  onReset,
}: ErrorViewProps): ReactElement {
  const adapters = listAdapters();
  const [selected, setSelected] = useState<string>(adapters[0]?.id ?? '');

  return (
    <section className="error-view">
      <h1 className="error-view__title">{strings.errors.title}</h1>

      <p className="error-view__message">
        {errorKind === 'no-adapter' ? strings.errors.unknownFormat : message}
      </p>

      {errorKind === 'no-adapter' && (
        <>
          {headers.length > 0 && (
            <p className="error-view__headers">{strings.errors.columnsFound(headers.join('، '))}</p>
          )}

          <div className="error-view__picker">
            <label className="error-view__label" htmlFor="adapter-picker">
              {strings.errors.chooseBank}
            </label>
            <select
              id="adapter-picker"
              className="select"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              {adapters.map((adapter) => (
                <option key={adapter.id} value={adapter.id}>
                  {adapter.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button"
              onClick={() => onRetryWithAdapter(selected)}
              disabled={selected === ''}
            >
              {strings.errors.chooseBankAction}
            </button>
          </div>
        </>
      )}

      <button type="button" className="button button--ghost" onClick={onReset}>
        {strings.errors.retry}
      </button>
    </section>
  );
}
