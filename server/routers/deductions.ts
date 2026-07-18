import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router, requirePermissionFlag } from "../_core/trpc";
import * as db from "../db";

export const deductionsRouter = router({
  // قائمة الحسومات (يشوفها أي مستخدم عنده صلاحية دخول الشاشة، بدون فلترة صلاحية إضافية على القراءة)
  list: protectedProcedure
    .input(z.object({
      status: z.enum(['pending', 'approved', 'posted']).optional(),
      workerId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await db.listDeductions(input);
    }),

  create: protectedProcedure
    .use(requirePermissionFlag('canManageDeductions'))
    .input(z.object({
      workerId: z.number(),
      amount: z.string(),
      dueDate: z.string(), // YYYY-MM-DD
      reason: z.string().min(1, "يرجى كتابة سبب الحسم"),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const result = await db.createDeduction({
        ...input,
        createdBy: ctx.user.id,
      });
      await db.logAudit({
        userId: ctx.user.id,
        action: 'CREATE_DEDUCTION',
        tableName: 'deduction_entries',
        recordId: result.id,
        newValues: input,
      });
      return result;
    }),

  approve: protectedProcedure
    .use(requirePermissionFlag('canManageDeductions'))
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const result = await db.approveDeduction(input.id, ctx.user.id);
      await db.logAudit({
        userId: ctx.user.id,
        action: 'APPROVE_DEDUCTION',
        tableName: 'deduction_entries',
        recordId: input.id,
        newValues: { status: 'approved' },
      });
      return result;
    }),

  delete: protectedProcedure
    .use(requirePermissionFlag('canManageDeductions'))
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const result = await db.deleteDeduction(input.id);
      await db.logAudit({
        userId: ctx.user.id,
        action: 'DELETE_DEDUCTION',
        tableName: 'deduction_entries',
        recordId: input.id,
      });
      return result;
    }),
});
