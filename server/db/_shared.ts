import { eq, desc, and, or, like, gte, lt, lte, ne, sql, count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { getAdministrativeWorkDate } from '../attendance-logic';
import { 
  users, InsertUser, User,
  costCenters,
  groups, Group, InsertGroup,
  groupSchedules,
  workers, InsertWorker,
  attendanceEvents,
  workDays,
  workerDailyFinance,
  payOverrides,
  payrollBatches,
  payrollBatchItems,
  payrollBatchNotes,
  payrollBatchCorrections,
  operationalFlags,
  userCostCenters,
  temporaryAssignments,
  assignmentSettlements,
  deductionRules,
  auditLog,
  notifications,
  pushSubscriptions,
  restaurants,
  dailyWorkAssignments
} from "../../drizzle/schema";
import { sendNotification, sendNotificationToRoles, notifyStageAndAdmins, ADMIN_OWNER_ROLES } from '../notifications';
import { getRoleLabel } from '../permissions';
import { inArray, isNull, isNotNull, between } from "drizzle-orm";

/**
 * جلب الاسم الكامل ومسمى الدور العربي لمستخدم معين
 * يُستخدم في نصوص الإشعارات لإظهار من قام بكل إجراء
 */

/**
 * جلب الاسم الكامل ومسمى الدور العربي لمستخدم معين
 * يُستخدم في نصوص الإشعارات لإظهار من قام بكل إجراء
 */
export async function getActorLabel(db: any, userId: number): Promise<string> {
  try {
    const [user] = await db.select({ fullName: users.fullName, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return 'مستخدم غير معروف';
    const roleAr = getRoleLabel(user.role, 'ar');
    return `${user.fullName} (${roleAr})`;
  } catch {
    return 'مستخدم';
  }
}
