/**
 * نقطة دخول التطبيق: تركيب React على عنصر الجذر.
 *
 * لا منطق هنا إطلاقاً — الواجهة في `src/ui/`، والمنطق في `src/core/`
 * و`src/adapters/` كدوال نقية بلا أي اعتماد على React أو المتصفح.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

const container = document.getElementById('root');

if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
