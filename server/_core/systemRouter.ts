import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  dataStats: adminProcedure
    .query(async () => {
      const { getDb } = await import('../db.js') as any;
      const { attendanceEvents, workerDailyFinance, workers } = await import('../../drizzle/schema.js');
      const { eq, sql } = await import('drizzle-orm');
      
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Count attendance events
      const attendanceCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(attendanceEvents);
      
      const checkInCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(attendanceEvents)
        .where(eq(attendanceEvents.eventType, 'check_in'));
      
      const checkOutCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(attendanceEvents)
        .where(eq(attendanceEvents.eventType, 'check_out'));

      // Count finance records
      const financeCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(workerDailyFinance);

      // Count workers
      const workersCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(workers);

      return {
        attendance: {
          total: Number(attendanceCount[0]?.count || 0),
          checkIns: Number(checkInCount[0]?.count || 0),
          checkOuts: Number(checkOutCount[0]?.count || 0),
        },
        finance: {
          total: Number(financeCount[0]?.count || 0),
        },
        workers: {
          total: Number(workersCount[0]?.count || 0),
        },
      } as const;
    }),

  backfillDailyFinance: adminProcedure
    .mutation(async () => {
      const { getDb, calculateAndSaveDailyFinance } = await import('../db.js') as any;
      const { attendanceEvents } = await import('../../drizzle/schema.js');
      const { eq } = await import('drizzle-orm');
      
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get all check_out events
      const checkOutEvents = await db
        .select()
        .from(attendanceEvents)
        .where(eq(attendanceEvents.eventType, 'check_out'))
        .orderBy(attendanceEvents.eventTime);

      let processed = 0;
      let errors = 0;

      for (const event of checkOutEvents) {
        try {
          await calculateAndSaveDailyFinance(event.workerId, new Date(event.eventTime));
          processed++;
        } catch (error) {
          console.error(`Error processing event ${event.id}:`, error);
          errors++;
        }
      }

      return {
        success: true,
        processed,
        errors,
        total: checkOutEvents.length
      } as const;
    }),

  cleanupOrphanFinance: adminProcedure
    .mutation(async () => {
      const { cleanupOrphanFinanceRecords } = await import('../db.js') as any;
      
      const result = await cleanupOrphanFinanceRecords();

      return {
        success: true,
        deletedCount: result.deletedCount,
        totalAmount: result.totalAmount,
        records: result.records,
      } as const;
    }),
});
