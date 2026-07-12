import { getDb } from "./db";
import { payrollBatchNotes } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

/**
 * Add a note to a payroll batch
 */
export async function addBatchNote(params: {
  batchId: number;
  userId: number;
  userRole: string;
  noteType: "critical" | "warning" | "info";
  note: string;
  errorLocation?: string;
  workerId?: number;
  fieldName?: string;
  attachmentUrl?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(payrollBatchNotes).values({
    batchId: params.batchId,
    reviewerId: params.userId,
    reviewerRole: params.userRole,
    noteType: params.noteType,
    note: params.note,
    errorLocation: params.errorLocation,
    workerId: params.workerId,
    fieldName: params.fieldName,
    attachmentUrl: params.attachmentUrl,
  });

  return { success: true };
}

/**
 * Get notes for a payroll batch
 */
export async function getBatchNotes(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const notes = await db
    .select()
    .from(payrollBatchNotes)
    .where(eq(payrollBatchNotes.batchId, batchId))
    .orderBy(desc(payrollBatchNotes.createdAt));

  return notes;
}
