/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // كل المنطق في src/core و src/adapters دوال نقية — لا حاجة لبيئة متصفح
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
