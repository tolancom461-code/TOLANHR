import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, requirePermissionFlag } from '../_core/trpc';
import { readBiometricSourceImportConfig } from '../biometric-source-importer/config';
import { createMysqlBiometricDirectoryStore } from './mysql-store';

type DirectoryContext = { streamId: string; store: ReturnType<typeof createMysqlBiometricDirectoryStore> };

async function applicationDirectory(): Promise<DirectoryContext> {
  if (process.env.BIOMETRIC_SOURCE_DIRECTORY_ENABLED !== 'true') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'مزامنة دليل مستخدمي البصمة غير مفعلة.' });
  }
  const config = readBiometricSourceImportConfig(process.env);
  if (!config) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'إعداد ربط برنامج البصمة غير مكتمل.' });
  const { getDb } = await import('../db/connection');
  const database = await getDb();
  const client = database?.$client;
  if (!client || typeof client.promise !== 'function') throw new Error('DIRECTORY_DATABASE_UNAVAILABLE');
  return { streamId: config.streamId, store: createMysqlBiometricDirectoryStore(client.promise(), config.expectedDatabase) };
}

function publicError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  const code = typeof (error as { code?: unknown })?.code === 'string' ? String((error as { code: string }).code) : '';
  if (/CONFLICT|STALE/.test(code)) return new TRPCError({ code: 'CONFLICT', message: 'الهوية مرتبطة بعامل آخر أو تغير الربط. حدّث القائمة ثم أعد المحاولة.' });
  if (/HISTORICAL/.test(code)) return new TRPCError({ code: 'BAD_REQUEST', message: 'يلزم تأكيد اختيار هوية المستخدم المؤرشفة.' });
  if (/NOT_FOUND/.test(code)) return new TRPCError({ code: 'NOT_FOUND', message: 'العامل أو هوية البصمة غير موجودة.' });
  if (/INVALID|INACTIVE/.test(code)) return new TRPCError({ code: 'BAD_REQUEST', message: 'تحقق من العامل وهوية البصمة المختارة.' });
  if (/SCHEMA|DATABASE_MISMATCH/.test(code)) return new TRPCError({ code: 'PRECONDITION_FAILED', message: 'جداول دليل البصمة أو قاعدة الاتصال تحتاج مراجعة قبل الربط.' });
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر قراءة دليل البصمة أو حفظ الربط. أعد المحاولة.' });
}

/** New procedures only. Legacy person-code links and attendance processing remain independent. */
export function createBiometricDirectoryWorkerProcedures(
  load: () => Promise<DirectoryContext> = applicationDirectory,
  enabled: () => boolean = () => process.env.BIOMETRIC_SOURCE_DIRECTORY_ENABLED === 'true',
) {
  const allowed = protectedProcedure.use(requirePermissionFlag('canManageWorkers'));
  const identityId = z.string().min(1).max(128);
  const workerId = z.number().int().positive();
  const guarded = async <T>(operation: (context: DirectoryContext) => Promise<T>): Promise<T> => {
    try { return await operation(await load()); } catch (error) { throw publicError(error); }
  };
  return {
    sourceBiometricMode: protectedProcedure.query(() => ({ enabled: enabled() })),
    sourceBiometricUsers: allowed.input(z.object({ search: z.string().max(100).optional(),
      roster: z.enum(['current', 'historical', 'all']).default('current'),
      sortBy: z.enum(['device_user_id', 'name']).default('device_user_id'), currentWorkerId: workerId.optional(),
      page: z.number().int().min(1).max(10000).default(1), limit: z.number().int().min(1).max(100).default(50) }).strict())
      .query(({ input }) => guarded(({ store, streamId }) => store.listUsers({ ...input, streamId }))),
    sourceBiometricWorkerLinks: allowed.input(z.object({ workerId }).strict())
      .query(({ input }) => guarded(({ store, streamId }) => store.listWorkerLinks({ workerId: input.workerId, streamId }))),
    setSourceBiometricLink: allowed.input(z.object({ workerId, identityId,
      expectedLinkId: z.string().uuid().nullable(), confirmHistorical: z.boolean().default(false) }).strict())
      .mutation(({ input, ctx }) => guarded(({ store, streamId }) => store.setLink({ ...input, streamId, actor: ctx.user.id }))),
    revokeSourceBiometricLink: allowed.input(z.object({ workerId, identityId, expectedLinkId: z.string().uuid() }).strict())
      .mutation(({ input, ctx }) => guarded(({ store, streamId }) => store.revokeLink({ ...input, streamId, actor: ctx.user.id }))),
  };
}

export const biometricDirectoryWorkerProcedures = createBiometricDirectoryWorkerProcedures();
