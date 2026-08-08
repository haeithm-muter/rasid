/**
 * سجلّ المحوّلات والكشف التلقائي عن تنسيق البنك.
 *
 * التسجيل تلقائي: أي ملف `*.adapter.ts` في هذا المجلد يصدّر محوّلاً افتراضياً
 * يدخل السجلّ وحده. **إضافة بنك جديد = ملف واحد جديد فقط، بلا تعديل أي كود قائم.**
 */

import { AmbiguousAdapterError, NoMatchingAdapterError } from '../core/errors';
import type { BankAdapter } from './types';

/**
 * كل ملفات المحوّلات في هذا المجلد، محمّلة مسبقاً وقت البناء.
 * `import.meta.glob` من Vite هو ما يجعل التسجيل تلقائياً.
 */
const modules = import.meta.glob('./*.adapter.ts', { eager: true }) as Record<
  string,
  { default: BankAdapter }
>;

/**
 * كل المحوّلات المسجّلة، مرتّبة بمعرّفها لضمان ترتيب ثابت لا يعتمد على
 * ترتيب نظام الملفات (مهم لتكرار نتائج الاختبارات).
 */
export const adapters: readonly BankAdapter[] = Object.keys(modules)
  .map((path) => modules[path].default)
  .filter((adapter): adapter is BankAdapter => adapter !== undefined)
  .sort((a, b) => a.id.localeCompare(b.id));

/**
 * يبحث عن محوّل بمعرّفه — يستخدمه خيار "اختيار البنك يدوياً" في الواجهة.
 *
 * @param id معرّف المحوّل (مثل `'alrajhi'`)
 * @returns المحوّل أو `undefined` إن لم يوجد
 */
export function getAdapterById(id: string): BankAdapter | undefined {
  return adapters.find((adapter) => adapter.id === id);
}

/**
 * قائمة مختصرة للعرض في واجهة الاختيار اليدوي.
 *
 * @returns معرّف واسم كل محوّل مسجّل
 */
export function listAdapters(): readonly { id: string; label: string }[] {
  return adapters.map(({ id, label }) => ({ id, label }));
}

/**
 * يختار المحوّل المناسب لترويسة ملف.
 *
 * يفوز المحوّل الذي يتعرّف على أكبر عدد من الأعمدة. عند التعادل أو عند عدم
 * وجود أي مطابقة يُرمى خطأ يحمل قائمة المرشّحين، لتعرضها الواجهة في خيار
 * الاختيار اليدوي بدل الفشل الصامت.
 *
 * @param headers أسماء أعمدة الملف
 * @param registry سجلّ المحوّلات (يُحقن في الاختبارات)
 * @returns المحوّل الفائز
 * @throws {NoMatchingAdapterError} حين لا يطابق أي محوّل
 * @throws {AmbiguousAdapterError} حين يتعادل أكثر من محوّل
 */
export function detectAdapter(
  headers: readonly string[],
  registry: readonly BankAdapter[] = adapters,
): BankAdapter {
  const scored = registry
    .map((adapter) => ({ adapter, score: adapter.match(headers) }))
    .filter((entry) => entry.score > 0);

  if (scored.length === 0) {
    throw new NoMatchingAdapterError(
      headers,
      registry.map((adapter) => adapter.id),
    );
  }

  const best = Math.max(...scored.map((entry) => entry.score));
  const winners = scored.filter((entry) => entry.score === best);

  if (winners.length > 1) {
    throw new AmbiguousAdapterError(
      headers,
      winners.map((entry) => entry.adapter.id),
    );
  }

  return (winners[0] as { adapter: BankAdapter }).adapter;
}

export type { BankAdapter, BankAdapterSpec } from './types';
export { createBankAdapter } from './createBankAdapter';
