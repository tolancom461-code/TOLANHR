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

  // AI-Powered Analytics
export const analyticsRouter = router({
    executive: protectedProcedure.query(async () => {
      const today = new Date();
      const todayStats = await analytics.getDailyStats(today);
      const historicalStats = await analytics.getHistoricalStats(28); // Last 4 weeks
      
      const healthScore = await analytics.calculateHealthScore(todayStats, historicalStats);
      const pressurePoint = await analytics.detectPressurePoint(today);
      const anomaly = await analytics.detectAnomalies(todayStats, historicalStats);
      const forecast = await analytics.forecastEndOfDay(todayStats, historicalStats);
      const insight = await analytics.generateAIInsight(healthScore, pressurePoint, anomaly, todayStats);
      const pendingPayroll = await analytics.getPendingPayrollBatches();
      
      // Calculate trends
      const yesterdayStats = historicalStats[1] || todayStats;
      const weekAvg = historicalStats.slice(0, 7).reduce((sum, s) => sum + s.present, 0) / 7;
      
      return {
        todayStats,
        yesterdayStats,
        weekAvg: Math.round(weekAvg),
        healthScore,
        pressurePoint,
        anomaly,
        forecast,
        insight,
        pendingPayroll
      };
    }),
});
