import { getDb } from './db';
import { attendanceEvents, workers, workerDailyFinance, payrollBatches } from '../drizzle/schema';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';

/**
 * Analytics Helper Functions for AI-Powered Dashboard
 * Focus: Practical insights, not complex ML
 */

interface DailyStats {
  date: Date;
  present: number;
  absent: number;
  late: number;
  totalExpense: number;
}

interface HealthScore {
  score: 'normal' | 'attention' | 'critical';
  icon: '🟢' | '🟡' | '🔴';
  label: string;
}

interface PressurePoint {
  type: 'group' | 'cost_center' | 'general';
  name: string;
  reason: string;
}

interface Anomaly {
  detected: boolean;
  metric: string;
  deviation: number;
  explanation: string;
}

interface Forecast {
  metric: string;
  current: number;
  predicted: number;
  confidence: 'high' | 'medium' | 'low';
}

interface AIInsight {
  insight: string;
  action: string;
}

/**
 * Get daily statistics for a specific date
 */
export async function getDailyStats(date: Date): Promise<DailyStats> {
  const db = await getDb();
  if (!db) return { date, present: 0, absent: 0, late: 0, totalExpense: 0 };

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Get all active workers
  const allWorkers = await db.select().from(workers).where(eq(workers.status, 'active'));
  const totalWorkers = allWorkers.length;

  // Get attendance events for the day
  const events = await db
    .select()
    .from(attendanceEvents)
    .where(and(
      gte(attendanceEvents.eventTime, startOfDay),
      lte(attendanceEvents.eventTime, endOfDay)
    ));

  // Count unique workers who checked in
  const presentWorkerIds = new Set(events.filter(e => e.eventType === 'check_in').map(e => e.workerId));
  const present = presentWorkerIds.size;
  const absent = totalWorkers - present;

  // Count late arrivals (after 8:30 AM)
  const lateThreshold = new Date(date);
  lateThreshold.setHours(8, 30, 0, 0);
  const late = events.filter(e => 
    e.eventType === 'check_in' && e.eventTime > lateThreshold
  ).length;

  // Get total expense for the day
  const financeRecords = await db
    .select()
    .from(workerDailyFinance)
    .where(eq(workerDailyFinance.workDate, startOfDay));

  const totalExpense = financeRecords.reduce((sum, record) => 
    sum + parseFloat(record.netAmount || '0'), 0
  );

  return { date, present, absent, late, totalExpense };
}

/**
 * Get historical stats for comparison
 */
export async function getHistoricalStats(days: number): Promise<DailyStats[]> {
  const stats: DailyStats[] = [];
  const today = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dayStats = await getDailyStats(date);
    stats.push(dayStats);
  }
  
  return stats;
}

/**
 * Calculate Operational Health Score
 * Based on: attendance, absence, lateness, expense correlation
 */
export async function calculateHealthScore(todayStats: DailyStats, historicalStats: DailyStats[]): Promise<HealthScore> {
  const avgPresent = historicalStats.reduce((sum, s) => sum + s.present, 0) / historicalStats.length;
  const avgLate = historicalStats.reduce((sum, s) => sum + s.late, 0) / historicalStats.length;
  const avgExpense = historicalStats.reduce((sum, s) => sum + s.totalExpense, 0) / historicalStats.length;

  let issues = 0;

  // Check attendance deviation
  if (todayStats.present < avgPresent * 0.85) issues++;
  
  // Check late arrivals
  if (todayStats.late > avgLate * 1.5) issues++;
  
  // Check expense correlation (expense high but attendance low)
  if (todayStats.totalExpense > avgExpense * 1.2 && todayStats.present < avgPresent) issues++;

  if (issues === 0) {
    return { score: 'normal', icon: '🟢', label: 'طبيعي' };
  } else if (issues === 1) {
    return { score: 'attention', icon: '🟡', label: 'يحتاج انتباه' };
  } else {
    return { score: 'critical', icon: '🔴', label: 'غير طبيعي' };
  }
}

/**
 * Detect single pressure point
 */
export async function detectPressurePoint(date: Date): Promise<PressurePoint | null> {
  const db = await getDb();
  if (!db) return null;

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Get events for the day
  const events = await db
    .select()
    .from(attendanceEvents)
    .where(and(
      gte(attendanceEvents.eventTime, startOfDay),
      lte(attendanceEvents.eventTime, endOfDay)
    ));

  // Get all workers with their groups
  const allWorkers = await db.select().from(workers).where(eq(workers.status, 'active'));

  // Group by groupId and count absences
  const groupAbsences: Record<number, { count: number; name: string }> = {};
  
  for (const worker of allWorkers) {
    if (!worker.groupId) continue;
    
    const hasCheckedIn = events.some(e => e.workerId === worker.id && e.eventType === 'check_in');
    
    if (!hasCheckedIn) {
      if (!groupAbsences[worker.groupId]) {
        groupAbsences[worker.groupId] = { count: 0, name: `مجموعة ${worker.groupId}` };
      }
      groupAbsences[worker.groupId].count++;
    }
  }

  // Find group with highest absence rate
  let maxAbsences = 0;
  let pressureGroup: { id: number; name: string } | null = null;

  for (const [groupId, data] of Object.entries(groupAbsences)) {
    if (data.count > maxAbsences && data.count >= 3) { // At least 3 absences to be significant
      maxAbsences = data.count;
      pressureGroup = { id: parseInt(groupId), name: data.name };
    }
  }

  if (pressureGroup) {
    return {
      type: 'group',
      name: pressureGroup.name,
      reason: `${maxAbsences} عمال غائبين`
    };
  }

  return null;
}

/**
 * Detect anomalies using statistical comparison
 */
export async function detectAnomalies(todayStats: DailyStats, historicalStats: DailyStats[]): Promise<Anomaly | null> {
  const avgPresent = historicalStats.reduce((sum, s) => sum + s.present, 0) / historicalStats.length;
  const avgAbsent = historicalStats.reduce((sum, s) => sum + s.absent, 0) / historicalStats.length;
  const avgLate = historicalStats.reduce((sum, s) => sum + s.late, 0) / historicalStats.length;
  const avgExpense = historicalStats.reduce((sum, s) => sum + s.totalExpense, 0) / historicalStats.length;

  // Calculate standard deviation
  const stdPresent = Math.sqrt(
    historicalStats.reduce((sum, s) => sum + Math.pow(s.present - avgPresent, 2), 0) / historicalStats.length
  );

  // Check for significant deviation (> 2 standard deviations)
  const presentDeviation = Math.abs(todayStats.present - avgPresent) / (stdPresent || 1);

  if (presentDeviation > 2) {
    return {
      detected: true,
      metric: 'الحضور',
      deviation: presentDeviation,
      explanation: todayStats.present < avgPresent 
        ? `الحضور أقل من المعتاد بنسبة ${Math.round((1 - todayStats.present / avgPresent) * 100)}%`
        : `الحضور أعلى من المعتاد بنسبة ${Math.round((todayStats.present / avgPresent - 1) * 100)}%`
    };
  }

  // Check late arrivals
  if (todayStats.late > avgLate * 2 && todayStats.late >= 5) {
    return {
      detected: true,
      metric: 'التأخير',
      deviation: todayStats.late / avgLate,
      explanation: `التأخير أعلى من المعتاد: ${todayStats.late} متأخر مقابل ${Math.round(avgLate)} عادةً`
    };
  }

  return null;
}

/**
 * Forecast end-of-day metrics
 */
export async function forecastEndOfDay(todayStats: DailyStats, historicalStats: DailyStats[]): Promise<Forecast> {
  const currentHour = new Date().getHours();
  
  // If it's before 2 PM, forecast based on similar days
  if (currentHour < 14) {
    const avgPresent = historicalStats.reduce((sum, s) => sum + s.present, 0) / historicalStats.length;
    const predicted = Math.round(avgPresent);
    
    return {
      metric: 'الحضور المتوقع',
      current: todayStats.present,
      predicted,
      confidence: 'medium'
    };
  }
  
  // After 2 PM, we have enough data for expense forecast
  const avgExpense = historicalStats.reduce((sum, s) => sum + s.totalExpense, 0) / historicalStats.length;
  const expensePerWorker = avgExpense / (historicalStats[0]?.present || 1);
  const predicted = Math.round(todayStats.present * expensePerWorker);
  
  return {
    metric: 'المصروف المتوقع',
    current: todayStats.totalExpense,
    predicted,
    confidence: 'high'
  };
}

/**
 * Generate AI insight and suggested action
 */
export async function generateAIInsight(
  healthScore: HealthScore,
  pressurePoint: PressurePoint | null,
  anomaly: Anomaly | null,
  todayStats: DailyStats
): Promise<AIInsight> {
  // Critical situation
  if (healthScore.score === 'critical') {
    if (anomaly && anomaly.metric === 'الحضور') {
      return {
        insight: 'انخفاض كبير في الحضور اليوم مقارنة بالأسابيع الماضية',
        action: 'تواصل مع مشرفي المجموعات لمعرفة السبب'
      };
    }
    if (pressurePoint) {
      return {
        insight: `${pressurePoint.name} تواجه مشكلة: ${pressurePoint.reason}`,
        action: `راجع ${pressurePoint.name} وتحقق من أسباب الغياب`
      };
    }
    return {
      insight: 'اليوم يشهد أداءً غير طبيعي في عدة مؤشرات',
      action: 'راجع تقرير الحضور والمالية بشكل عاجل'
    };
  }

  // Attention needed
  if (healthScore.score === 'attention') {
    if (todayStats.late > 5) {
      return {
        insight: `${todayStats.late} عامل تأخروا اليوم`,
        action: 'راجع أسباب التأخير المتكررة'
      };
    }
    return {
      insight: 'الأداء العام جيد مع بعض الملاحظات البسيطة',
      action: 'تابع المؤشرات خلال اليوم'
    };
  }

  // Normal situation
  return {
    insight: 'الأداء طبيعي ومستقر',
    action: 'لا يوجد إجراء عاجل مطلوب'
  };
}

/**
 * Get pending payroll batches with priority
 */
export async function getPendingPayrollBatches() {
  const db = await getDb();
  if (!db) return [];

  const batches = await db
    .select()
    .from(payrollBatches)
    .where(eq(payrollBatches.status, 'under_accountant_review'))
    .orderBy(desc(payrollBatches.totalAmount));

  return batches.map(batch => ({
    id: batch.id,
    code: batch.batchCode,
    amount: parseFloat(batch.totalAmount?.toString() || '0'),
    daysWaiting: Math.floor((Date.now() - new Date(batch.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
    priority: parseFloat(batch.totalAmount?.toString() || '0') > 50000 ? 'high' : 'normal'
  }));
}
