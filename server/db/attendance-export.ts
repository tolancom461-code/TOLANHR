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
import { getDb, groupEventsByWorkDate } from './connection';


// ============================================
// Attendance Export Functions (Excel Reports)
// ============================================

export async function getAttendanceReportData(
  startDate: string,
  endDate: string,
  groupId?: number,
  costCenterId?: number
) {
  const db = await getDb();
  if (!db) return [];

  const { attendanceEvents, workers, groups, costCenters } = await import('../../drizzle/schema');
  
  // Use work_date instead of eventTime for proper administrative day handling
  // This ensures that punches from 00:00-04:59 of the next day are included
  // in the previous day's report (5 AM boundary)
  
  // Build query
  let query = db
    .select({
      workerId: workers.id,
      workerName: workers.fullName,
      workerCode: workers.code,
      groupId: workers.groupId,
      groupName: groups.name,
      costCenterId: groups.costCenterId,
      costCenterName: costCenters.name,
      eventType: attendanceEvents.eventType,
      eventTime: attendanceEvents.eventTime,
      workDate: attendanceEvents.workDate,
      method: attendanceEvents.method,
    })
    .from(attendanceEvents)
    .innerJoin(workers, eq(attendanceEvents.workerId, workers.id))
    .innerJoin(groups, eq(workers.groupId, groups.id))
    .leftJoin(costCenters, eq(groups.costCenterId, costCenters.id))
    .where(and(
      gte(attendanceEvents.workDate, startDate),
      lte(attendanceEvents.workDate, endDate)
    ));
  
  // Apply filters
  if (groupId) {
    query = (query as any).where(eq(workers.groupId, groupId));
  }
  if (costCenterId) {
    query = (query as any).where(eq(groups.costCenterId, costCenterId));
  }
  
  const results = await (query as any).orderBy(
    workers.fullName,
    attendanceEvents.eventTime
  );
  
  return results;
}

export async function getAttendanceSummaryByWorker(
  startDate: string,
  endDate: string,
  groupId?: number,
  costCenterId?: number
) {
  const db = await getDb();
  if (!db) return [];

  const { attendanceEvents, workers, groups, costCenters } = await import('../../drizzle/schema');
  
  // Use work_date for proper administrative day handling (5 AM boundary)
  
  // Get all workers
  let workersQuery = db.select().from(workers) as any;
  if (groupId) {
    workersQuery = workersQuery.where(eq(workers.groupId, groupId));
  }
  const allWorkers = await workersQuery;
  
  // Get attendance events using work_date
  const events = await db
    .select()
    .from(attendanceEvents)
    .where(and(
      gte(attendanceEvents.workDate, startDate),
      lte(attendanceEvents.workDate, endDate)
    ));
  
  // Get groups and cost centers for joining
  const groupsData = await db.select().from(groups);
  const costCentersData = await db.select().from(costCenters);
  
  // Use groupEventsByWorkDate for correct night shift handling
  const grouped = groupEventsByWorkDate(events);
  
  // Calculate summary for each worker
  const summary = allWorkers.map((worker: any) => {
    const workerGroup = groupsData.find(g => g.id === worker.groupId);
    const costCenter = workerGroup ? costCentersData.find(c => c.id === workerGroup.costCenterId) : null;
    
    if (costCenterId && workerGroup?.costCenterId !== costCenterId) {
      return null;
    }
    
    let daysPresent = 0;
    let totalCheckIns = 0;
    let totalCheckOuts = 0;
    let totalHours = 0;
    
    for (const [workDate, workerData] of Object.entries(grouped)) {
      if (workDate < startDate || workDate > endDate) continue;
      const wd = workerData[worker.id];
      if (!wd) continue;
      
      daysPresent++;
      if (wd.checkIn) totalCheckIns++;
      if (wd.checkOut) totalCheckOuts++;
      
      if (wd.checkIn && wd.checkOut) {
        const hours = (new Date(wd.checkOut.eventTime).getTime() - new Date(wd.checkIn.eventTime).getTime()) / (1000 * 60 * 60);
        totalHours += hours;
      }
    }
    
    return {
      workerId: worker.id,
      workerName: worker.fullName,
      workerCode: worker.code,
      groupId: worker.groupId,
      groupName: workerGroup?.name || 'N/A',
      costCenterId: workerGroup?.costCenterId,
      costCenterName: costCenter?.name || 'N/A',
      daysPresent,
      totalCheckIns,
      totalCheckOuts,
      totalHours: Math.round(totalHours * 100) / 100,
      avgHoursPerDay: daysPresent > 0 ? Math.round((totalHours / daysPresent) * 100) / 100 : 0,
    };
  }).filter((item: any) => item !== null);
  
  return summary;
}

export async function getAttendanceSummaryByGroup(
  startDate: string,
  endDate: string,
  costCenterId?: number
) {
  const db = await getDb();
  if (!db) return [];

  const { attendanceEvents, workers, groups, costCenters } = await import('../../drizzle/schema');
  
  // Use work_date for proper administrative day handling (5 AM boundary)
  
  // Get all groups
  let groupsQuery = db.select().from(groups) as any;
  if (costCenterId) {
    groupsQuery = groupsQuery.where(eq(groups.costCenterId, costCenterId));
  }
  const allGroups = await groupsQuery;
  
  // Get all workers
  const allWorkers = await db.select().from(workers);
  
  // Get attendance events using work_date
  const events = await db
    .select()
    .from(attendanceEvents)
    .where(and(
      gte(attendanceEvents.workDate, startDate),
      lte(attendanceEvents.workDate, endDate)
    ));
  
  // Get cost centers
  const costCentersData = await db.select().from(costCenters);
  
  // Use groupEventsByWorkDate for correct night shift handling
  const grouped = groupEventsByWorkDate(events);
  
  // Calculate summary for each group
  const summary = allGroups.map((group: any) => {
    const groupWorkers = allWorkers.filter(w => w.groupId === group.id);
    const groupWorkerIds = new Set(groupWorkers.map(w => w.id));
    
    const costCenter = costCentersData.find(c => c.id === group.costCenterId);
    
    let totalCheckIns = 0;
    let totalCheckOuts = 0;
    let totalHours = 0;
    const daysSet = new Set<string>();
    
    for (const [workDate, workerData] of Object.entries(grouped)) {
      if (workDate < startDate || workDate > endDate) continue;
      
      for (const [workerIdStr, wd] of Object.entries(workerData)) {
        if (!groupWorkerIds.has(Number(workerIdStr))) continue;
        
        daysSet.add(workDate);
        if (wd.checkIn) totalCheckIns++;
        if (wd.checkOut) totalCheckOuts++;
        
        if (wd.checkIn && wd.checkOut) {
          const hours = (new Date(wd.checkOut.eventTime).getTime() - new Date(wd.checkIn.eventTime).getTime()) / (1000 * 60 * 60);
          totalHours += hours;
        }
      }
    }
    
    const daysWithAttendance = daysSet.size;
    
    return {
      groupId: group.id,
      groupName: group.name,
      costCenterId: group.costCenterId,
      costCenterName: costCenter?.name || 'N/A',
      totalWorkers: groupWorkers.length,
      totalCheckIns,
      totalCheckOuts,
      daysWithAttendance,
      totalHours: Math.round(totalHours * 100) / 100,
      avgHoursPerDay: daysWithAttendance > 0 ? Math.round((totalHours / daysWithAttendance) * 100) / 100 : 0,
    };
  });
  
  return summary;
}

export async function getAttendanceSummaryByCostCenter(
  startDate: string,
  endDate: string
) {
  const db = await getDb();
  if (!db) return [];

  const { attendanceEvents, workers, groups, costCenters } = await import('../../drizzle/schema');
  
  // Use work_date for proper administrative day handling (5 AM boundary)
  
  // Get all cost centers
  const allCostCenters = await db.select().from(costCenters);
  
  // Get all groups
  const allGroups = await db.select().from(groups);
  
  // Get all workers
  const allWorkers = await db.select().from(workers);
  
  // Get attendance events using work_date
  const events = await db
    .select()
    .from(attendanceEvents)
    .where(and(
      gte(attendanceEvents.workDate, startDate),
      lte(attendanceEvents.workDate, endDate)
    ));
  
  // Use groupEventsByWorkDate for correct night shift handling
  const grouped = groupEventsByWorkDate(events);
  
  // Calculate summary for each cost center
  const summary = allCostCenters.map((costCenter: any) => {
    const costCenterGroups = allGroups.filter(g => g.costCenterId === costCenter.id);
    const costCenterWorkerIds = new Set(
      allWorkers.filter(w => costCenterGroups.some(g => g.id === w.groupId)).map(w => w.id)
    );
    
    let totalCheckIns = 0;
    let totalCheckOuts = 0;
    let totalHours = 0;
    const daysSet = new Set<string>();
    
    for (const [workDate, workerData] of Object.entries(grouped)) {
      if (workDate < startDate || workDate > endDate) continue;
      
      for (const [workerIdStr, wd] of Object.entries(workerData)) {
        if (!costCenterWorkerIds.has(Number(workerIdStr))) continue;
        
        daysSet.add(workDate);
        if (wd.checkIn) totalCheckIns++;
        if (wd.checkOut) totalCheckOuts++;
        
        if (wd.checkIn && wd.checkOut) {
          const hours = (new Date(wd.checkOut.eventTime).getTime() - new Date(wd.checkIn.eventTime).getTime()) / (1000 * 60 * 60);
          totalHours += hours;
        }
      }
    }
    
    const daysWithAttendance = daysSet.size;
    
    return {
      costCenterId: costCenter.id,
      costCenterName: costCenter.name,
      totalGroups: costCenterGroups.length,
      totalWorkers: costCenterWorkerIds.size,
      totalCheckIns,
      totalCheckOuts,
      daysWithAttendance,
      totalHours: Math.round(totalHours * 100) / 100,
      avgHoursPerDay: daysWithAttendance > 0 ? Math.round((totalHours / daysWithAttendance) * 100) / 100 : 0,
    };
  });
  
  return summary;
}


