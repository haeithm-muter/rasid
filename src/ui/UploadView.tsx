/**
 * شاشة الاستقبال: منطقة السحب والإفلات، وزرّ البيانات التجريبية.
 *
 * سطر الخصوصية هنا **أبرز عنصر بعد العنوان** عن قصد: من يُطلب منه رفع كشف
 * حسابه البنكي سؤاله الأول ليس "ما هذا التطبيق؟" بل "إلى أين يذهب ملفي؟"،
 * وتأجيل الجواب إلى تذييل الصفحة يجعله بلا قيمة.
 */

import { useRef, useState } from 'react';
import type { DragEvent, ReactElement } from 'react';
import { listAdapters } from '../adapters';
import type { Locale, Strings } from './i18n';

/** ▲ ثابت ▲ أقصى حجم ملف مقبول بالميجابايت. */
const MAX_FILE_MB = 25;

/** خصائص شاشة الاستقبال. */
export type UploadViewProps = {
  strings: Strings;
  locale: Locale;
  /** يُستدعى بالملف المختار. */
  onFile: (file: File) => void;
  /** يُستدعى عند طلب البيانات التجريبية. */
  onDemo: () => void;
};

/**
 * شاشة رفع الملف.
 *
 * @param props النصوص والإجراءات
 * @returns الشاشة
 */
export function UploadView({ strings, onFile, onDemo }: UploadViewProps): ReactElement {
  const [isDragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** يفحص الملف محلياً قبل إشغال العامل به. */
  function accept(file: File | undefined): void {
    if (file === undefined) return;

    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setLocalError(strings.upload.fileTooLarge(MAX_FILE_MB));
      return;
    }

    // نفحص الامتداد لا نوع MIME: ويندوز يعطي ملفات CSV أحياناً نوع
    // `application/vnd.ms-excel`، ورفضها بسبب ذلك يمنع ملفاً سليماً تماماً.
    if (!/\.csv$/i.test(file.name)) {
      setLocalError(strings.upload.wrongType);
      return;
    }

    setLocalError(null);
    onFile(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files[0]);
  }

  return (
    <section className="upload">
      <h1 className="upload__title">{strings.app.tagline}</h1>
      <p className="upload__description">{strings.app.description}</p>

      <p className="privacy">
        <span className="privacy__mark" aria-hidden="true">
          ⛨
        </span>
        <span>
          <strong className="privacy__headline">{strings.app.privacyHeadline}</strong>
          <span className="privacy__detail">{strings.app.privacyDetail}</span>
        </span>
      </p>

      <div
        className={`dropzone${isDragging ? ' dropzone--active' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p className="dropzone__title">{strings.upload.dropTitle}</p>
        <p className="dropzone__hint">{strings.upload.dropHint}</p>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="visually-hidden"
          onChange={(event) => {
            accept(event.target.files?.[0]);
            // تفريغ القيمة يسمح باختيار **نفس** الملف مرّة أخرى بعد إعادة الضبط
            event.target.value = '';
          }}
        />

        <div className="dropzone__actions">
          <button type="button" className="button" onClick={() => inputRef.current?.click()}>
            {strings.upload.browse}
          </button>
          <button type="button" className="button button--ghost" onClick={onDemo}>
            {strings.upload.demo}
          </button>
        </div>

        <p className="dropzone__note">{strings.upload.demoHint}</p>
      </div>

      {localError !== null && (
        <p className="inline-error" role="alert">
          {localError}
        </p>
      )}

      <div className="supported">
        <h2 className="supported__title">{strings.upload.supported}</h2>
        <ul className="supported__list">
          {listAdapters().map((adapter) => (
            <li key={adapter.id}>{adapter.label}</li>
          ))}
        </ul>
        <p className="supported__note">{strings.upload.howToExport}</p>
      </div>
    </section>
  );
}
