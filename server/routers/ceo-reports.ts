import { z } from "zod";
import { protectedProcedure, requireRole, router } from "../_core/trpc";
import { CEO_REPORT_TITLE } from "../../shared/ceoReportsAggregation";

const shiftCategorySchema = z.enum(["morning", "evening"]);
const costCenterIdsSchema = z.array(z.number().int().positive()).min(1);
const reportAccess = requireRole("admin_affairs", "accountant", "auditor", "finance_manager");

export const ceoReportsRouter = router({
  getReport: protectedProcedure
    .use(reportAccess)
    .input(
      z.object({
        periodStart: z.string(),
        periodEnd: z.string(),
        costCenterIds: costCenterIdsSchema,
        groupIds: z.array(z.number()).optional(),
      })
    )
    .query(async ({ input }) => {
      const { getCeoReportsData } = await import("../ceoReports");
      return await getCeoReportsData(
        input.periodStart,
        input.periodEnd,
        input.costCenterIds,
        input.groupIds
      );
    }),

  getGroups: protectedProcedure
    .use(reportAccess)
    .input(
      z.object({
        costCenterIds: costCenterIdsSchema,
      })
    )
    .query(async ({ input }) => {
      const { getCeoReportsGroups } = await import("../ceoReports");
      return await getCeoReportsGroups(input.costCenterIds);
    }),

  exportPdf: protectedProcedure
    .use(reportAccess)
    .input(
      z.object({
        periodStart: z.string(),
        periodEnd: z.string(),
        costCenterIds: costCenterIdsSchema,
        morningGroupIds: z.array(z.number()).default([]),
        eveningGroupIds: z.array(z.number()).default([]),
        selectedShifts: z.array(shiftCategorySchema).min(1),
        mergeShifts: z.boolean(),
        reportTitle: z.string().trim().min(1).max(200).default(CEO_REPORT_TITLE),
      })
    )
    .mutation(async ({ input }) => {
      const { generateCeoReportsPdf } = await import("../ceoReportsPdf");
      const buffer = await generateCeoReportsPdf(input);

      return {
        data: buffer.toString("base64"),
        filename: `ceo-report_${input.periodStart}_${input.periodEnd}.pdf`,
      };
    }),
});
