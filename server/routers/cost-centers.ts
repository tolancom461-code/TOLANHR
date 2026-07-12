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

  // Cost Centers
export const costCentersRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // إذا كان admin، يرى جميع مراكز التكلفة
      if (true) { // All users are treated as admin
        return await db.getAllCostCenters();
      }
      
      // All users have access to all cost centers (no permission system)
      return await db.getAllCostCenters();
    }),
    
    create: protectedProcedure
      .input(z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
      }))
      .use(requirePermissionFlag('canManageCostCenters'))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createCostCenter(input);
        await db.logAudit({
          userId: ctx.user?.id,
          action: 'CREATE_COST_CENTER',
          tableName: 'cost_centers',
          newValues: { code: input.code, name: input.name },
        });
        return result;
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        code: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .use(requirePermissionFlag('canManageCostCenters'))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const allCC = await db.getAllCostCenters();
        const oldCC = allCC.find((c: any) => c.id === id);
        const result = await db.updateCostCenter(id, data);
        await db.logAudit({
          userId: ctx.user?.id,
          action: 'UPDATE_COST_CENTER',
          tableName: 'cost_centers',
          recordId: id,
          oldValues: oldCC ? { code: oldCC.code, name: oldCC.name } : null,
          newValues: data,
        });
        return result;
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .use(requirePermissionFlag('canManageCostCenters'))
      .mutation(async ({ input, ctx }) => {
        const allCCDel = await db.getAllCostCenters();
        const oldCC = allCCDel.find((c: any) => c.id === input.id);
        const result = await db.deleteCostCenter(input.id);
        await db.logAudit({
          userId: ctx.user?.id,
          action: 'DELETE_COST_CENTER',
          tableName: 'cost_centers',
          recordId: input.id,
          oldValues: oldCC ? { code: oldCC.code, name: oldCC.name } : null,
        });
        return result;
      }),
});
