import { z } from "zod";
import { protectedProcedure, requireRole, router } from "../_core/trpc";

const reportAccess = requireRole("admin_affairs", "accountant", "auditor", "finance_manager");

export const dailyAttendanceReportsRouter = router({
  getReport: protectedProcedure
    .use(reportAccess)
    .input(z.object({
      periodStart: z.string(),
      periodEnd: z.string(),
      costCenterId: z.number().optional(),
      groupIds: z.array(z.number()).optional(),
      workerIds: z.array(z.number()).optional(),
    }))
    .query(async ({ input }) => {
      const { getDailyAttendanceReportData } = await import('../dailyAttendanceReports');
      return await getDailyAttendanceReportData(
        input.periodStart,
        input.periodEnd,
        input.costCenterId ?? undefined,
        input.groupIds,
        input.workerIds
      );
    }),

  getGroups: protectedProcedure
    .use(reportAccess)
    .input(z.object({
      costCenterId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const { getDailyAttendanceReportGroups } = await import('../dailyAttendanceReports');
      return await getDailyAttendanceReportGroups(input.costCenterId);
    }),

  exportPdf: protectedProcedure
    .use(reportAccess)
    .input(z.object({
      periodStart: z.string(),
      periodEnd: z.string(),
      costCenterId: z.number().optional(),
      groupIds: z.array(z.number()).optional(),
      workerIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { generateDailyAttendanceReportPdf } = await import('../dailyAttendanceReportsPdf');
      const buffer = await generateDailyAttendanceReportPdf({
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        costCenterId: input.costCenterId ?? undefined,
        groupIds: input.groupIds,
        workerIds: input.workerIds,
        printedBy: ctx.user?.fullName || ctx.user?.username || 'غير معروف',
      });
      return {
        data: buffer.toString('base64'),
        filename: `daily-attendance-report_${input.periodStart}_${input.periodEnd}.pdf`,
      };
    }),
});
