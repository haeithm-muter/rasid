/**
 * نقطة دخول التطبيق — مؤقتة ومتعمَّدة الفراغ.
 *
 * الواجهة (UI) تُبنى في الجزء 3 داخل `src/ui/`. هذا الملف موجود فقط
 * ليعمل `npm run build` و`npm run dev` في الجزء 1، ولا يحتوي أي منطق.
 * كل المنطق يعيش في `src/core/` و`src/adapters/` كدوال نقية.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const container = document.getElementById('root');

if (container) {
  createRoot(container).render(<StrictMode />);
}
