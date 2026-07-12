import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import { getSessionCookieOptions } from "../_core/cookies";
import { systemRouter } from "../_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router, requireRole, requirePermissionFlag } from "../_core/trpc";
import * as db from "../db";
import { sql, and, eq, gte, desc } from "drizzle-orm";
import { attendanceEvents, type UserRole } from "../../drizzle/schema";
import { ROLE_PERMISSIONS, hasPageAccess, canApproveBatchAtStage, cannotSelfReview } from "../permissions";
import { generateAttendanceExcel, generatePayrollExcel, type AttendanceReportRow, type PayrollReportRow } from "../excelExport";
import { parseGroupsFromExcel, parseWorkersFromExcel, generateGroupsExcelTemplate, generateWorkersExcelTemplate, generateGroupsExcelExport, generateWorkersExcelExport } from "../excelImportExport";
import * as analytics from "../analytics";
import { sendNotification } from "../notifications";
import * as QRCode from "qrcode";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

export const operationalFlagsRouter = router({
    // Create a new operational flag (simplified)
    create: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        groupId: z.number().optional(),
        flagDate: z.date(),
        description: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const flagId = await db.createSimplifiedOperationalFlag({
          ...input,
          createdBy: ctx.user.id,
        });
        await db.logAudit({
          userId: ctx.user.id,
          action: 'CREATE_FLAG',
          tableName: 'operational_flags',
          recordId: flagId,
          newValues: { workerId: input.workerId, description: input.description },
        });
        return { success: true, flagId };
      }),

    // Get pending flags
    getPending: protectedProcedure
      .query(async () => {
        return await db.getPendingOperationalFlags();
      }),

    // List all flags
    list: protectedProcedure
      .query(async () => {
        return await db.listAllOperationalFlags();
      }),

    // Check for unresolved flags
    checkUnresolved: protectedProcedure
      .input(z.object({
        groupId: z.number().optional(),
        dateRange: z.object({
          start: z.date().optional(),
          end: z.date().optional(),
        }).optional(),
      }).optional())
      .query(async () => {
        // Return empty array for now - simplified implementation
        return { hasUnresolved: false, count: 0 };
      }),

    // Approve a flag
    approve: protectedProcedure
      .input(z.object({
        flagId: z.number(),
        notes: z.string().optional(),
      }))
      .use(requirePermissionFlag('canProcessNotes'))
      .mutation(async ({ input, ctx }) => {
        const approveResult = await db.approveOperationalFlag(input.flagId, ctx.user.id, input.notes);
        await db.logAudit({
          userId: ctx.user.id,
          action: 'APPROVE_FLAG',
          tableName: 'operational_flags',
          recordId: input.flagId,
          newValues: { notes: input.notes },
        });
        return approveResult;
      }),
    // Reject a flag
    reject: protectedProcedure
      .input(z.object({
        flagId: z.number(),
        notes: z.string().optional(),
      }))
      .use(requirePermissionFlag('canProcessNotes'))
      .mutation(async ({ input, ctx }) => {
        const rejectFlagResult = await db.rejectOperationalFlag(input.flagId, ctx.user.id, input.notes);
        await db.logAudit({
          userId: ctx.user.id,
          action: 'REJECT_FLAG',
          tableName: 'operational_flags',
          recordId: input.flagId,
          newValues: { notes: input.notes },
        });
        return rejectFlagResult;
      }),
});
