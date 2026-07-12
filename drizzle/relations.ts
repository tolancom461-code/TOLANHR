import { relations } from "drizzle-orm/relations";
import { temporaryAssignments, assignmentSettlements, workers, payrollBatches, costCenters, users, attendanceEvents, auditLog, groups, groupSchedules, loginSessions, payOverrides, paymentVouchers, payrollBatchCorrections, payrollBatchItems, payrollBatchNotes, userCostCenters, workerArchive, workerDailyFinance } from "./schema";

export const assignmentSettlementsRelations = relations(assignmentSettlements, ({one}) => ({
	temporaryAssignment: one(temporaryAssignments, {
		fields: [assignmentSettlements.assignmentId],
		references: [temporaryAssignments.id]
	}),
	worker: one(workers, {
		fields: [assignmentSettlements.workerId],
		references: [workers.id]
	}),
	payrollBatch_fromBatchId: one(payrollBatches, {
		fields: [assignmentSettlements.fromBatchId],
		references: [payrollBatches.id],
		relationName: "assignmentSettlements_fromBatchId_payrollBatches_id"
	}),
	payrollBatch_toBatchId: one(payrollBatches, {
		fields: [assignmentSettlements.toBatchId],
		references: [payrollBatches.id],
		relationName: "assignmentSettlements_toBatchId_payrollBatches_id"
	}),
	costCenter_fromCostCenterId: one(costCenters, {
		fields: [assignmentSettlements.fromCostCenterId],
		references: [costCenters.id],
		relationName: "assignmentSettlements_fromCostCenterId_costCenters_id"
	}),
	costCenter_toCostCenterId: one(costCenters, {
		fields: [assignmentSettlements.toCostCenterId],
		references: [costCenters.id],
		relationName: "assignmentSettlements_toCostCenterId_costCenters_id"
	}),
	user: one(users, {
		fields: [assignmentSettlements.appliedBy],
		references: [users.id]
	}),
}));

export const temporaryAssignmentsRelations = relations(temporaryAssignments, ({one, many}) => ({
	assignmentSettlements: many(assignmentSettlements),
	group_fromGroupId: one(groups, {
		fields: [temporaryAssignments.fromGroupId],
		references: [groups.id],
		relationName: "temporaryAssignments_fromGroupId_groups_id"
	}),
	group_toGroupId: one(groups, {
		fields: [temporaryAssignments.toGroupId],
		references: [groups.id],
		relationName: "temporaryAssignments_toGroupId_groups_id"
	}),
}));

export const workersRelations = relations(workers, ({one, many}) => ({
	assignmentSettlements: many(assignmentSettlements),
	attendanceEvents: many(attendanceEvents),
	payOverrides: many(payOverrides),
	payrollBatchItems: many(payrollBatchItems),
	payrollBatchNotes: many(payrollBatchNotes),
	workerArchives: many(workerArchive),
	workerDailyFinances: many(workerDailyFinance),
	group: one(groups, {
		fields: [workers.groupId],
		references: [groups.id]
	}),
}));

export const payrollBatchesRelations = relations(payrollBatches, ({one, many}) => ({
	assignmentSettlements_fromBatchId: many(assignmentSettlements, {
		relationName: "assignmentSettlements_fromBatchId_payrollBatches_id"
	}),
	assignmentSettlements_toBatchId: many(assignmentSettlements, {
		relationName: "assignmentSettlements_toBatchId_payrollBatches_id"
	}),
	payrollBatchCorrections: many(payrollBatchCorrections),
	payrollBatchItems: many(payrollBatchItems),
	payrollBatchNotes: many(payrollBatchNotes),
	group: one(groups, {
		fields: [payrollBatches.groupId],
		references: [groups.id]
	}),
	costCenter: one(costCenters, {
		fields: [payrollBatches.costCenterId],
		references: [costCenters.id]
	}),
	user_approvedBy: one(users, {
		fields: [payrollBatches.approvedBy],
		references: [users.id],
		relationName: "payrollBatches_approvedBy_users_id"
	}),
	user_createdBy: one(users, {
		fields: [payrollBatches.createdBy],
		references: [users.id],
		relationName: "payrollBatches_createdBy_users_id"
	}),
	user_unlockedBy: one(users, {
		fields: [payrollBatches.unlockedBy],
		references: [users.id],
		relationName: "payrollBatches_unlockedBy_users_id"
	}),
	workerDailyFinances: many(workerDailyFinance),
}));

export const costCentersRelations = relations(costCenters, ({many}) => ({
	assignmentSettlements_fromCostCenterId: many(assignmentSettlements, {
		relationName: "assignmentSettlements_fromCostCenterId_costCenters_id"
	}),
	assignmentSettlements_toCostCenterId: many(assignmentSettlements, {
		relationName: "assignmentSettlements_toCostCenterId_costCenters_id"
	}),
	groups: many(groups),
	paymentVouchers: many(paymentVouchers),
	payrollBatches: many(payrollBatches),
	userCostCenters: many(userCostCenters),
}));

export const usersRelations = relations(users, ({many}) => ({
	assignmentSettlements: many(assignmentSettlements),
	attendanceEvents: many(attendanceEvents),
	auditLogs: many(auditLog),
	groups: many(groups),
	loginSessions: many(loginSessions),
	payOverrides_approvedBy: many(payOverrides, {
		relationName: "payOverrides_approvedBy_users_id"
	}),
	payOverrides_createdBy: many(payOverrides, {
		relationName: "payOverrides_createdBy_users_id"
	}),
	payrollBatches_approvedBy: many(payrollBatches, {
		relationName: "payrollBatches_approvedBy_users_id"
	}),
	payrollBatches_createdBy: many(payrollBatches, {
		relationName: "payrollBatches_createdBy_users_id"
	}),
	payrollBatches_unlockedBy: many(payrollBatches, {
		relationName: "payrollBatches_unlockedBy_users_id"
	}),
	userCostCenters: many(userCostCenters),
	workerArchives: many(workerArchive),
}));

export const attendanceEventsRelations = relations(attendanceEvents, ({one}) => ({
	worker: one(workers, {
		fields: [attendanceEvents.workerId],
		references: [workers.id]
	}),
	user: one(users, {
		fields: [attendanceEvents.verifiedBy],
		references: [users.id]
	}),
}));

export const auditLogRelations = relations(auditLog, ({one}) => ({
	user: one(users, {
		fields: [auditLog.userId],
		references: [users.id]
	}),
}));

export const groupSchedulesRelations = relations(groupSchedules, ({one}) => ({
	group: one(groups, {
		fields: [groupSchedules.groupId],
		references: [groups.id]
	}),
}));

export const groupsRelations = relations(groups, ({one, many}) => ({
	groupSchedules: many(groupSchedules),
	costCenter: one(costCenters, {
		fields: [groups.costCenterId],
		references: [costCenters.id]
	}),
	user: one(users, {
		fields: [groups.supervisorId],
		references: [users.id]
	}),
	payrollBatchItems: many(payrollBatchItems),
	payrollBatches: many(payrollBatches),
	temporaryAssignments_fromGroupId: many(temporaryAssignments, {
		relationName: "temporaryAssignments_fromGroupId_groups_id"
	}),
	temporaryAssignments_toGroupId: many(temporaryAssignments, {
		relationName: "temporaryAssignments_toGroupId_groups_id"
	}),
	workers: many(workers),
}));

export const loginSessionsRelations = relations(loginSessions, ({one}) => ({
	user: one(users, {
		fields: [loginSessions.userId],
		references: [users.id]
	}),
}));

export const payOverridesRelations = relations(payOverrides, ({one}) => ({
	worker: one(workers, {
		fields: [payOverrides.workerId],
		references: [workers.id]
	}),
	user_approvedBy: one(users, {
		fields: [payOverrides.approvedBy],
		references: [users.id],
		relationName: "payOverrides_approvedBy_users_id"
	}),
	user_createdBy: one(users, {
		fields: [payOverrides.createdBy],
		references: [users.id],
		relationName: "payOverrides_createdBy_users_id"
	}),
}));

export const paymentVouchersRelations = relations(paymentVouchers, ({one}) => ({
	costCenter: one(costCenters, {
		fields: [paymentVouchers.costCenterId],
		references: [costCenters.id]
	}),
}));

export const payrollBatchCorrectionsRelations = relations(payrollBatchCorrections, ({one}) => ({
	payrollBatch: one(payrollBatches, {
		fields: [payrollBatchCorrections.batchId],
		references: [payrollBatches.id]
	}),
}));

export const payrollBatchItemsRelations = relations(payrollBatchItems, ({one}) => ({
	payrollBatch: one(payrollBatches, {
		fields: [payrollBatchItems.batchId],
		references: [payrollBatches.id]
	}),
	worker: one(workers, {
		fields: [payrollBatchItems.workerId],
		references: [workers.id]
	}),
	group: one(groups, {
		fields: [payrollBatchItems.groupId],
		references: [groups.id]
	}),
}));

export const payrollBatchNotesRelations = relations(payrollBatchNotes, ({one}) => ({
	payrollBatch: one(payrollBatches, {
		fields: [payrollBatchNotes.batchId],
		references: [payrollBatches.id]
	}),
	worker: one(workers, {
		fields: [payrollBatchNotes.workerId],
		references: [workers.id]
	}),
}));

export const userCostCentersRelations = relations(userCostCenters, ({one}) => ({
	user: one(users, {
		fields: [userCostCenters.userId],
		references: [users.id]
	}),
	costCenter: one(costCenters, {
		fields: [userCostCenters.costCenterId],
		references: [costCenters.id]
	}),
}));

export const workerArchiveRelations = relations(workerArchive, ({one}) => ({
	worker: one(workers, {
		fields: [workerArchive.workerId],
		references: [workers.id]
	}),
	user: one(users, {
		fields: [workerArchive.archivedBy],
		references: [users.id]
	}),
}));

export const workerDailyFinanceRelations = relations(workerDailyFinance, ({one}) => ({
	worker: one(workers, {
		fields: [workerDailyFinance.workerId],
		references: [workers.id]
	}),
	payrollBatch: one(payrollBatches, {
		fields: [workerDailyFinance.lockedBatchId],
		references: [payrollBatches.id]
	}),
}));