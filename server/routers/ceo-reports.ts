import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

const shiftCategorySchema = z.enum(["morning", "evening"]);
const costCenterIdsSchema = z.array(z.number().int().positive()).min(1);

export const ceoReportsRouter = router({
  getReport: protectedProcedure
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
    .input(
      z.object({
        periodStart: z.string(),
        periodEnd: z.string(),
        costCenterIds: costCenterIdsSchema,
        morningGroupIds: z.array(z.number()).default([]),
        eveningGroupIds: z.array(z.number()).default([]),
        selectedShifts: z.array(shiftCategorySchema).min(1),
        mergeShifts: z.boolean(),
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
