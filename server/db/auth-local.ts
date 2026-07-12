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
import type { Worker as DbWorker } from "../../drizzle/schema";
import { ENV } from '../_core/env';
import { getDb } from './connection';

// ============================================
// Password Functions
// ============================================


// ============================================
// Local Authentication (المصادقة المحلية)
// ============================================

import crypto from 'crypto';

/**
 * Simple password hashing (for development/testing only)
 * NOTE: This is simplified encryption. For/**
 * Hash a password for storage
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.default.hash(password, 10);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.default.compare(password, hash);
}

/**
 * Create a local user with username and password
 */
export async function createLocalUser(data: {
  username: string;
  password: string;
  fullName: string;
  email?: string;
  phone?: string;
  isActive?: boolean;
  role?: 'guard' | 'supervisor_tolan' | 'supervisor_malqa' | 'admin_affairs' | 'accountant' | 'auditor' | 'finance_manager' | 'executive' | 'super_admin' | 'restaurant_operations' | 'data_entry';
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const passwordHash = await hashPassword(data.password);
  
  const [result] = await db.insert(users).values([{
    username: data.username,
    passwordHash,
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    isActive: data.isActive ?? true,
    loginMethod: 'local',
    role: data.role ?? 'guard',
  }]);
  
  return { userId: result.insertId };
}

/**
 * Authenticate a local user with username and password
 */
export async function authenticateLocalUser(username: string, password: string) {
  const db = await getDb();
  if (!db) return null;
  
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  
  if (!user) {
    return null;
  }
  
  if (!user.passwordHash) {
    return null; // User doesn't have a local password
  }
  
  const isValid = await verifyPassword(password, user.passwordHash);
  
  if (!isValid) {
    return null;
  }
  
  // Update last signed in
  await db
    .update(users)
    .set({ lastSignedIn: new Date() })
    .where(eq(users.id, user.id));
  
  return user;
}


