// ============================================
// tRPC Routers — Barrel File
// قُسِّم هذا الملف إلى راوترات domain داخل server/routers/
// appRouter يُجمَّع في server/routers/index.ts — لا تغيير على أي مستورد
// ============================================

export { appRouter } from './routers/index';
export type { AppRouter } from './routers/index';
