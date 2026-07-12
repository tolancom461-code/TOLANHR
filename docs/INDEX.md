# 📖 الفهرس التفصيلي — TolanWorkforce

> مولَّد آلياً من الكود المصدري — آخر تحديث: 2026-07-12
> للخريطة العامة للمجلدات راجع [STRUCTURE.md](./STRUCTURE.md)

## ١. طبقة قاعدة البيانات — `server/db/` (44 وحدة)

### `db/_shared.ts` (55 سطراً — 1 تصدير)

`getActorLabel`

### `db/advanced-payroll.ts` (295 سطراً — 6 تصدير)

`calculateDailyFinancesForPeriod` · `getUnlockedDailyFinances` · `lockDailyFinancesForBatch` · `unlockDailyFinancesForBatch` · `aggregatePayrollData` · `checkLockedDaysInPeriod`

### `db/assignment-settlements.ts` (386 سطراً — 2 تصدير)

`checkBatchAssignments` · `applyAssignmentSettlements`

### `db/attendance-adjustments.ts` (173 سطراً — 4 تصدير)

`getAttendanceEventById` · `updateAttendanceEvent` · `getAttendanceEventsForEdit` · `getAttendanceEventsByGroup`

### `db/attendance-export.ts` (345 سطراً — 4 تصدير)

`getAttendanceReportData` · `getAttendanceSummaryByWorker` · `getAttendanceSummaryByGroup` · `getAttendanceSummaryByCostCenter`

### `db/attendance.ts` (650 سطراً — 16 تصدير)

`getWorkerAttendance` · `getWorkerFinanceSummary` · `getWorkerPayOverrides` · `changeUserPassword` · `recordAttendance` · `getWorkerByQRToken` · `getWorkerByManualCode` · `getTodayAttendanceWithPagination` · `getTodayAttendance` · `getWorkerLastEvent` · `getMonthlyAttendanceReport` · `getDateRangeAttendanceReport` · `getWorkDays` · `upsertWorkDay` · `getAttendanceStats` · `recordAttendanceWithAdministrativeDay`

### `db/audit.ts` (70 سطراً — 1 تصدير)

`logAudit`

### `db/auth-local.ts` (133 سطراً — 4 تصدير)

`hashPassword` · `verifyPassword` · `createLocalUser` · `authenticateLocalUser`

### `db/auto-finance.ts` (1129 سطراً — 16 تصدير)

`calculateAndSaveDailyFinance` · `saveWeeklySchedules` · `aggregatePayrollDataByCostCenter` · `getCheckOutEventsByDate` · `deleteWorkerDailyFinanceByDate` · `getAuditLog` · `getAuditLogStats` · `checkGroupHasSchedules` · `getGroupsWithoutSchedules` · `checkScheduleDateConflict` · `getEarliestSafeEffectiveDate` · `getRecentScheduleChanges` · `getIncompleteAttendance` · `checkIncompleteAttendanceForPeriod` · `checkIncompleteAttendanceForPeriodAndCostCenter` · `getAbsentWorkers`

### `db/backup.ts` (210 سطراً — 4 تصدير)

`getBackupTableInfo` · `exportTablesData` · `exportFullSqlDump` · `getBackupHistory`

### `db/batch-worker-operations.ts` (447 سطراً — 7 تصدير)

`addManualAttendanceForBatch` · `updateAttendanceEventForBatch` · `updatePayrollItemNote` · `getAbsentWorkersForBatch` · `addWorkerToBatch` · `getPresentWorkersForGroupOnDate` · `addWorkerFromOtherGroup`

### `db/connection.ts` (246 سطراً — 7 تصدير)

`safeParseDecimal` · `safeParseInt` · `groupEventsByWorkDate` · `getWorkDateForCheckOut` · `getExpandedDateRange` · `getDb` · `getRawConnection`

### `db/cost-center-report.ts` (205 سطراً — 2 تصدير)

`getCostCenterPayrollReport` · `runMigration`

### `db/cost-centers.ts` (90 سطراً — 4 تصدير)

`getAllCostCenters` · `createCostCenter` · `updateCostCenter` · `deleteCostCenter`

### `db/daily-finance-entries.ts` (287 سطراً — 6 تصدير)

`listDailyFinanceEntries` · `createDailyFinanceEntry` · `updateDailyFinanceEntry` · `deleteDailyFinanceEntry` · `deleteDailyFinanceByWorkerAndDate` · `cleanupOrphanFinanceRecords`

### `db/daily-finance.ts` (439 سطراً — 3 تصدير)

`createOrUpdateDailyFinance` · `calculateDailyFinanceFromAttendance` · `processAttendanceToFinance`

### `db/daily-management.ts` (141 سطراً — 3 تصدير)

`getDailyAttendanceRecordsWithPagination` · `getDailyAttendanceRecords` · `updateDailyAttendanceRecord`

### `db/daily-work-assignments.ts` (182 سطراً — 4 تصدير)

`getWorkersWithAssignmentForGroupDate` · `upsertDailyWorkAssignment` · `removeDailyWorkAssignment` · `getRestaurantNamesForWorkerPeriod`

### `db/executive-dashboard.ts` (145 سطراً — 1 تصدير)

`getExecutiveFinanceSummary`

### `db/finance-entries.ts` (134 سطراً — 2 تصدير)

`addFinanceEntry` · `getDailyFinanceRecords`

### `db/financial-reports.ts` (393 سطراً — 4 تصدير)

`getWorkerFinancialReport` · `getGroupFinancialReport` · `getCostCenterFinancialReport` · `getAllFinancialReportsSummary`

### `db/full-day-overrides.ts` (217 سطراً — 3 تصدير)

`setFullDayOverride` · `getDailyFinanceForWorker` · `getAttendanceForWorkerPeriod`

### `db/group-coverage.ts` (221 سطراً — 5 تصدير)

`getGroupCoverageReport` · `getAllRestaurants` · `createRestaurant` · `updateRestaurant` · `deleteRestaurant`

### `db/group-schedules.ts` (93 سطراً — 2 تصدير)

`getGroupSchedules` · `updateGroupSchedule`

### `db/groups.ts` (176 سطراً — 8 تصدير)

`transformGroup` · `getAllGroups` · `getGroupById` · `getGroupByCode` · `createGroup` · `updateGroup` · `getGroupsByCostCenter` · `deleteGroup`

### `db/notifications-db.ts` (103 سطراً — 5 تصدير)

`getNotifications` · `getUnreadNotificationsCount` · `markNotificationAsRead` · `markAllNotificationsAsRead` · `savePushSubscription`

### `db/operational-dashboard.ts` (537 سطراً — 9 تصدير)

`getPresentWorkers` · `getLateWorkers` · `getAbsentWorkersWithDetails` · `getOperationalDashboardStats` · `createOperationalFlagFromAction` · `getOperationalFlagsForReview` · `getPendingOperationalFlagsCount` · `getPendingOperationalFlagsForPeriod` · `checkDuplicatePayrollBatch`

### `db/operational-flags.ts` (420 سطراً — 11 تصدير)

`createOperationalFlag` · `listOperationalFlags` · `getOperationalFlag` · `approveOperationalFlag` · `rejectOperationalFlag` · `checkUnresolvedFlags` · `updateUserRole` · `createSimplifiedOperationalFlag` · `getPendingOperationalFlags` · `checkPendingFlagsBeforePayroll` · `listAllOperationalFlags`

### `db/pagination.ts` (127 سطراً — 2 تصدير)

`getWorkersWithPagination` · `getGroupsWithPagination`

### `db/pay-overrides.ts` (187 سطراً — 4 تصدير)

`createPayOverride` · `getPendingOverrides` · `approveOverride` · `rejectOverride`

### `db/payroll-batches.ts` (1218 سطراً — 13 تصدير)

`createPayrollBatch` · `getPayrollBatches` · `getPayrollBatchDetails` · `updateBatchItem` · `submitBatchForReview` · `accountantApproveBatch` · `accountantRejectBatch` · `financialReviewerApproveBatch` · `financialReviewerRejectBatch` · `accountsManagerApproveBatch` · `accountsManagerRejectBatch` · `getBatchesByStatus` · `deleteBatch`

### `db/payroll-locks.ts` (127 سطراً — 3 تصدير)

`checkPayrollBatchForDate` · `forceUnlockPayroll` · `relockPayroll`

### `db/payroll-workflow.ts` (256 سطراً — 6 تصدير)

`submitBatchToAccounting` · `submitBatchToFinalReview` · `submitBatchForApproval` · `approveBatch` · `rejectBatch` · `updateBatchData`

### `db/recalculation.ts` (231 سطراً — 4 تصدير)

`getLastClosedPayrollDate` · `getEffectiveGroupForWorkerOnDate` · `recalculateWorkerFinanceForPeriod` · `recalculateGroupFinanceForOpenPeriods`

### `db/restaurant-costs.ts` (116 سطراً — 1 تصدير)

`getRestaurantCostReport`

### `db/roles.ts` (67 سطراً — 5 تصدير)

`getAllRoles` · `getRoleById` · `createRole` · `updateRole` · `checkUserPermission`

### `db/statistics.ts` (58 سطراً — 1 تصدير)

`getDashboardStats`

### `db/temporary-assignments.ts` (445 سطراً — 9 تصدير)

`getTemporaryAssignments` · `createTemporaryAssignment` · `cancelTemporaryAssignment` · `getWorkerAssignmentsInPeriod` · `getAssignmentsToCostCenter` · `getAssignmentsFromCostCenter` · `calculateAssignmentDays` · `updateTemporaryAssignment` · `deleteTemporaryAssignment`

### `db/test-helpers.ts` (142 سطراً — 4 تصدير)

`createTestWorker` · `deleteTestWorker` · `deleteTestGroup` · `calculateDailyFinance`

### `db/user-cost-centers.ts` (91 سطراً — 3 تصدير)

`assignUserCostCenters` · `getUserCostCenters` · `getUserCostCenterIds`

### `db/users.ts` (181 سطراً — 8 تصدير)

`upsertUser` · `getUserByOpenId` · `getUserById` · `getUserByUsername` · `getAllUsers` · `createUser` · `updateUser` · `deleteUser`

### `db/work-group-settings.ts` (279 سطراً — 7 تصدير)

`calculateMinuteCost` · `calculateLatePenalty` · `calculateEarlyLeavePenalty` · `getPayrollReportByGroup` · `getPayrollReportByWorker` · `getPayrollReportByCostCenter` · `getPayrollReportSummary`

### `db/workers.ts` (145 سطراً — 9 تصدير)

`getAllWorkers` · `getWorkersByGroup` · `getWorkerById` · `getWorkerByCode` · `getWorkerByCodeDirect` · `createWorkerFromImportData` · `createWorker` · `updateWorker` · `deleteWorker`

---

## ٢. مسارات tRPC — `server/routers/` (32 راوتر)

> الاستدعاء من العميل: `trpc.<اسم الراوتر>.<اسم الإجراء>` — Q = query (قراءة) / M = mutation (كتابة)

### `trpc.analytics` — ملف `routers/analytics.ts` (53 سطراً — 1 إجراء)

`executive`(Q)

### `trpc.attendanceAdjust` — ملف `routers/attendance-adjust.ts` (89 سطراً — 3 إجراء)

`getEvents`(Q) · `getEventsByGroup`(Q) · `updateEvent`(M)

### `trpc.attendanceStatus` — ملف `routers/attendance-status.ts` (34 سطراً — 1 إجراء)

`list`(Q)

### `trpc.attendance` — ملف `routers/attendance.ts` (867 سطراً — 29 إجراء)

`record`(M) · `getWorkerFromQR`(Q) · `getPendingCount`(Q) · `getForReview`(Q) · `getAbsentWorkers`(Q) · `approvePunch`(M) · `rejectPunch`(M) · `addMissingCheckIn`(M) · `addMissingCheckOut`(M) · `addFullSession`(M) · `deletePunchEvent`(M) · `confirmAttendance`(M) · `scanQR`(M) · `manualEntry`(M) · `todayLogWithPagination`(Q) · `todayLog`(Q) · `checkDateLocked`(Q) · `workerLastEvent`(Q) · `monthlyReport`(Q) · `dateRangeReport`(Q) · `stats`(Q) · `bulkUpdate`(M) · `getDailyRecordsWithPagination`(Q) · `getDailyRecords`(Q) · `updateDailyRecord`(M) · `recalculateDailyFinance`(M) · `recalculatePeriod`(M) · `updateEvent`(M) · `exportToExcel`(M)

### `trpc.audit` — ملف `routers/audit.ts` (59 سطراً — 3 إجراء)

`getLog`(Q) · `getStats`(Q) · `getUsers`(Q)

### `trpc.auth` — ملف `routers/auth.ts` (88 سطراً — 4 إجراء)

`me`(Q) · `logout`(M) · `permissions`(Q) · `localLogin`(M)

### `trpc.backup` — ملف `routers/backup.ts` (161 سطراً — 5 إجراء)

`getTableInfo`(Q) · `exportExcel`(M) · `exportSql`(M) · `exportCsv`(M) · `getHistory`(Q)

### `trpc.costCenterReport` — ملف `routers/cost-center-report.ts` (39 سطراً — 1 إجراء)

`getData`(Q)

### `trpc.costCenters` — ملف `routers/cost-centers.ts` (94 سطراً — 4 إجراء)

`list`(Q) · `create`(M) · `update`(M) · `delete`(M)

### `trpc.dailyFinance` — ملف `routers/daily-finance.ts` (124 سطراً — 5 إجراء)

`processAttendance`(M) · `getRecords`(Q) · `addEntry`(M) · `update`(M) · `setFullDayOverride`(M)

### `trpc.dailyPayrollReport` — ملف `routers/daily-payroll-report.ts` (50 سطراً — 2 إجراء)

`getReport`(Q) · `getGroups`(Q)

### `trpc.dashboard` — ملف `routers/dashboard.ts` (28 سطراً — 1 إجراء)

`stats`(Q)

### `trpc.excelImportExport` — ملف `routers/excel-import-export.ts` (187 سطراً — 6 إجراء)

`downloadGroupsTemplate`(Q) · `downloadWorkersTemplate`(Q) · `importGroups`(M) · `importWorkers`(M) · `exportGroups`(Q) · `exportWorkers`(Q)

### `trpc.executive` — ملف `routers/executive.ts` (42 سطراً — 1 إجراء)

`financeSummary`(Q)

### `trpc.export` — ملف `routers/export.ts` (337 سطراً — 6 إجراء)

`attendanceReport`(M) · `detailedAttendance`(M) · `summaryByWorker`(M) · `summaryByGroup`(M) · `summaryByCostCenter`(M) · `payrollReport`(M)

### `trpc.financialRecalculation` — ملف `routers/financial-recalculation.ts` (131 سطراً — 1 إجراء)

`recalculateRange`(M)

### `trpc.financialReports` — ملف `routers/financial-reports.ts` (82 سطراً — 4 إجراء)

`worker`(Q) · `group`(Q) · `costCenter`(Q) · `summary`(Q)

### `trpc.groupSchedules` — ملف `routers/group-schedules.ts` (157 سطراً — 6 إجراء)

`listByGroup`(Q) · `update`(M) · `saveWeeklySchedules`(M) · `checkDateConflict`(Q) · `getEarliestSafeDate`(Q) · `getRecentChanges`(Q)

### `trpc.groups` — ملف `routers/groups.ts` (184 سطراً — 9 إجراء)

`list`(Q) · `listByCostCenter`(Q) · `listWithPagination`(Q) · `getById`(Q) · `create`(M) · `update`(M) · `delete`(M) · `listWithoutSchedules`(Q) · `checkHasSchedules`(Q)

### `trpc.migration` — ملف `routers/migration.ts` (49 سطراً — 1 إجراء)

`addFlexibleScheduleColumns`(M)

### `trpc.notifications` — ملف `routers/notifications.ts` (52 سطراً — 6 إجراء)

`list`(Q) · `unreadCount`(Q) · `markAsRead`(M) · `markAllAsRead`(M) · `savePushSubscription`(M) · `getVapidPublicKey`(Q)

### `trpc.operationalDashboard` — ملف `routers/operational-dashboard.ts` (323 سطراً — 12 إجراء)

`getStats`(Q) · `getPresentWorkers`(Q) · `getAbsentWorkers`(Q) · `getLateWorkers`(Q) · `createFlag`(M) · `getFlags`(Q) · `approveFlag`(M) · `rejectFlag`(M) · `getPendingCount`(Q) · `generateUnconfirmedFlags`(M) · `getConfirmedWorkerIds`(Q) · `getSupervisorPerformance`(Q)

### `trpc.operationalFlags` — ملف `routers/operational-flags.ts` (110 سطراً — 6 إجراء)

`create`(M) · `getPending`(Q) · `list`(Q) · `checkUnresolved`(Q) · `approve`(M) · `reject`(M)

### `trpc.payOverrides` — ملف `routers/pay-overrides.ts` (81 سطراً — 4 إجراء)

`create`(M) · `pending`(Q) · `approve`(M) · `reject`(M)

### `trpc.payrollFunctions` — ملف `routers/payroll-functions.ts` (194 سطراً — 6 إجراء)

`calculateDailyPayroll`(Q) · `calculateGroupPayroll`(Q) · `detectMissingPunches`(Q) · `getDailyPayrollSummary`(Q) · `getGroupPayrollSummary`(Q) · `getWorkersWithMissingPunches`(Q)

### `trpc.payroll` — ملف `routers/payroll.ts` (996 سطراً — 46 إجراء)

`createBatch`(M) · `getPayrollBatches`(Q) · `listBatches`(Q) · `listBatchesByStatus`(Q) · `getGroupCoverageReport`(Q) · `getDetails`(Q) · `updateItem`(M) · `submitForReview`(M) · `accountantApprove`(M) · `accountantReject`(M) · `financialReviewerApprove`(M) · `financialReviewerReject`(M) · `accountsManagerApprove`(M) · `accountsManagerReject`(M) · `deleteBatch`(M) · `exportBatchDetailsToExcel`(M) · `forceUnlock`(M) · `relock`(M) · `submitToAccounting`(M) · `submitToFinalReview`(M) · `submitForApproval`(M) · `approveBatchFinal`(M) · `rejectBatchFinal`(M) · `getReportByGroup`(Q) · `getReportByWorker`(Q) · `getReportByCostCenter`(Q) · `getReportSummary`(Q) · `exportToExcel`(M) · `getDailyFinanceForWorker`(Q) · `getAttendanceForWorkerPeriod`(Q) · `calculateDailyFinancesForPeriod`(M) · `getUnlockedDailyFinances`(Q) · `aggregatePayrollData`(Q) · `checkLockedDaysInPeriod`(Q) · `aggregatePayrollDataByCostCenter`(M) · `addBatchNote`(M) · `getBatchNotes`(Q) · `checkBatchAssignments`(Q) · `applyAssignmentSettlements`(M) · `addManualAttendance`(M) · `updateAttendanceForBatch`(M) · `updateWorkerNote`(M) · `getAbsentWorkersForBatch`(Q) · `addWorkerToBatch`(M) · `getPresentWorkersForGroupDate`(Q) · `addWorkerFromOtherGroup`(M)

### `trpc.profile` — ملف `routers/profile.ts` (62 سطراً — 2 إجراء)

`update`(M) · `changePassword`(M)

### `trpc.restaurants` — ملف `routers/restaurants.ts` (96 سطراً — 8 إجراء)

`list`(Q) · `create`(M) · `update`(M) · `delete`(M) · `getWorkersForAssignment`(Q) · `assignWorker`(M) · `removeAssignment`(M) · `costReport`(Q)

### `trpc.temporaryAssignments` — ملف `routers/temporary-assignments.ts` (157 سطراً — 6 إجراء)

`list`(Q) · `create`(M) · `cancel`(M) · `update`(M) · `delete`(M) · `getForCostCenter`(Q)

### `trpc.users` — ملف `routers/users.ts` (218 سطراً — 10 إجراء)

`list`(Q) · `getById`(Q) · `create`(M) · `update`(M) · `delete`(M) · `updateRole`(M) · `getRoles`(Q) · `getRolePermissions`(Q) · `assignCostCenters`(M) · `getUserCostCenters`(Q)

### `trpc.workDays` — ملف `routers/work-days.ts` (44 سطراً — 2 إجراء)

`list`(Q) · `upsert`(M)

### `trpc.workers` — ملف `routers/workers.ts` (302 سطراً — 14 إجراء)

`list`(Q) · `listWithPagination`(Q) · `listByGroup`(Q) · `getById`(Q) · `getByCode`(Q) · `create`(M) · `update`(M) · `delete`(M) · `regenerateQR`(M) · `getAttendance`(Q) · `getFinanceSummary`(Q) · `getPayOverrides`(Q) · `exportWorkerQRCode`(M) · `exportGroupQRCodes`(M)

### مداخل خاصة في `routers/index.ts`

`trpc.system` (راوتر النظام من `_core/systemRouter`) · `trpc.dbQuery`(M) (تنفيذ استعلام مباشر — admin فقط)

---

## ٣. صفحات الواجهة — `client/src/pages/`

(58 صفحة)

- `AttendanceExport.tsx`
- `AttendanceLog.tsx`
- `AttendanceReports.tsx`
- `AttendanceScanner.tsx`
- `AuditLog.tsx`
- `Backfill.tsx`
- `Backup.tsx`
- `CostCenters.tsx`
- `DailyManagement.tsx`
- `Dashboard.tsx`
- `DatabaseConsole.tsx`
- `ExecutiveDashboard.tsx`
- `ExecutiveFinanceDashboard.tsx`
- `FinanceEntry.tsx`
- `FinancialRecalculation.tsx`
- `Groups.tsx`
- `Home.tsx`
- `LandingPage.tsx`
- `LocalLogin.tsx`
- `Migration.tsx`
- `NotFound.tsx`
- `OfficialPayrollReport.tsx`
- `OperationalDashboard.tsx`
- `OperationalFlagsSimple.tsx`
- `OperationalNotesReview.tsx`
- `Operations.tsx`
- `PaymentVoucher.tsx`
- `PayOverrides.tsx`
- `payroll/AccountantReview.tsx`
- `payroll/AccountsManagerReview.tsx`
- `payroll/AdvancedPayrollPage.tsx`
- `payroll/FinancialReview.tsx`
- `payroll/GroupCoverageReport.tsx`
- `payroll/PayrollBatchCreate.tsx`
- `payroll/PayrollBatchCreateSimple.tsx`
- `payroll/PayrollBatchDetails.tsx`
- `payroll/PayrollBatchList.tsx`
- `payroll/PayrollBatchReview.tsx`
- `PayrollBatches.tsx`
- `PayrollBatchHistory.tsx`
- `PayrollDashboard.tsx`
- `PayrollManagement.tsx`
- `PayrollReport.tsx`
- `Profile.tsx`
- `PunchesReviewCenter.tsx`
- `reports/CostCenterReport.tsx`
- `reports/DailyPayrollReport.tsx`
- `reports/FinancialReports.tsx`
- `RestaurantCostReport.tsx`
- `RestaurantsManagement.tsx`
- `SupervisorPerformance.tsx`
- `TemporaryAssignments.tsx`
- `Users.tsx`
- `WeeklyShifts.tsx`
- `WorkDays.tsx`
- `WorkerCard.tsx`
- `WorkerDetails.tsx`
- `Workers.tsx`

---

## ٤. ملفات الخادم المساندة — `server/`

- `analytics.ts` — تحليلات الاستخدام
- `attendance-logic.ts` — منطق اليوم الإداري والورديات الليلية
- `dailyPayrollReport.ts` — تقرير الرواتب اليومي
- `db.ts` — barrel — يعيد تصدير server/db/
- `db_batch_notes.ts` — ملاحظات دفعات الرواتب
- `error-handling.ts` — معالجة الأخطاء
- `excel-export.ts` — تصدير Excel (سجل الحضور وتفاصيل الدفعات)
- `excelExport.ts` — تصدير Excel (تقارير الحضور والرواتب)
- `excelImportExport.ts` — استيراد/تصدير المجموعات والعمال Excel
- `middleware.ts` — وسيطات Express
- `notifications.ts` — الإشعارات والإرسال للأدوار
- `permissions.ts` — نظام الصلاحيات RBAC
- `routers.ts` — barrel — يعيد تصدير appRouter من server/routers/
- `storage.ts` — التخزين (S3)
- `validation.ts` — التحقق من المدخلات
