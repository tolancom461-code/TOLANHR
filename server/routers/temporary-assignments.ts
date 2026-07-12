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

  // ============================================
  // Temporary Assignments (الانتدابات المؤقتة)
  // ============================================
export const temporaryAssignmentsRouter = router({
    // List all temporary assignments with filters
    list: protectedProcedure
      .input(z.object({
        workerId: z.number().optional(),
        costCenterId: z.number().optional(),
        status: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await db.getTemporaryAssignments(input || {});
      }),

    // Create a new temporary assignment
    create: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        toCostCenterId: z.number(),
        toGroupId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const result = await db.createTemporaryAssignment({
          ...input,
          createdBy: ctx.user.id,
        });

        // Audit log
        await db.logAudit({
          userId: ctx.user.id,
          action: 'CREATE_TEMP_ASSIGNMENT',
          tableName: 'temporary_assignments',
          recordId: result.id,
          newValues: input,
        });

        return result;
      }),

    // Cancel a temporary assignment
    cancel: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const result = await db.cancelTemporaryAssignment(input.id);

        // Audit log
        await db.logAudit({
          userId: ctx.user.id,
          action: 'CANCEL_TEMP_ASSIGNMENT',
          tableName: 'temporary_assignments',
          recordId: input.id,
        });

        return result;
      }),

    // Update a temporary assignment
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        toCostCenterId: z.number().optional(),
        toGroupId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const result = await db.updateTemporaryAssignment(input.id, {
          toCostCenterId: input.toCostCenterId,
          toGroupId: input.toGroupId,
          startDate: input.startDate,
          endDate: input.endDate,
          notes: input.notes,
        });

        // Audit log
        await db.logAudit({
          userId: ctx.user.id,
          action: 'UPDATE_TEMP_ASSIGNMENT',
          tableName: 'temporary_assignments',
          recordId: input.id,
          newValues: input,
        });

        return result;
      }),

    // Delete a temporary assignment
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const result = await db.deleteTemporaryAssignment(input.id);

        // Audit log
        await db.logAudit({
          userId: ctx.user.id,
          action: 'DELETE_TEMP_ASSIGNMENT',
          tableName: 'temporary_assignments',
          recordId: input.id,
        });

        return result;
      }),

    // Get assignments for a specific cost center in a period (for payroll preview)
    getForCostCenter: protectedProcedure
      .input(z.object({
        costCenterId: z.number(),
        periodStart: z.string(),
        periodEnd: z.string(),
      }))
      .query(async ({ input }) => {
        const incoming = await db.getAssignmentsToCostCenter(
          input.costCenterId, input.periodStart, input.periodEnd
        );
        const outgoing = await db.getAssignmentsFromCostCenter(
          input.costCenterId, input.periodStart, input.periodEnd
        );
        return { incoming, outgoing };
      }),
});
