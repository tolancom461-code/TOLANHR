/**
 * Role-Based Access Control (RBAC) System
 * 9 roles with specific page/feature access
 * 
 * دورة اعتماد الرواتب:
 * 1. الشؤون الإدارية (admin_affairs) تنشئ الدفعة (draft) وترسلها للمحاسب
 * 2. المحاسب (accountant) يراجع → يعتمد (ترسل للمراجع) أو يرفض (تعود draft للشؤون الإدارية)
 * 3. المراجع (auditor) يراجع → يعتمد (ترسل للمدير المالي) أو يرفض (تعود draft للشؤون الإدارية)
 * 4. المدير المالي (finance_manager) يعتمد نهائياً أو يرفض (تعود draft للشؤون الإدارية)
 * 
 * ملاحظات مهمة:
 * - المراجع لا يتدخل إلا بعد أن تصله الدفعة من المحاسب
 * - المدير المالي لا يتدخل إلا بعد أن تصله الدفعة من المراجع
 * - أي رفض من أي مرحلة يعيد الدفعة إلى draft لدى الشؤون الإدارية
 * - المراجع والمدير المالي لا يملكان صلاحية الحذف
 */

import type { UserRole } from "../drizzle/schema";

// Define which pages/features each role can access
export const ROLE_PERMISSIONS: Record<UserRole, {
  label: string;
  labelAr: string;
  pages: string[];
  canCreateBatch: boolean;
  canDeleteBatch: boolean;
  canSubmitDraft: boolean; // إرسال المسودة للمحاسب (الشؤون الإدارية فقط)
  canReviewAsAccountant: boolean;
  canReviewAsAuditor: boolean;
  canApproveAsFM: boolean;
  canManageWorkers: boolean;
  canManageGroups: boolean;
  canManageCostCenters: boolean;
  canManageUsers: boolean;
  canViewFinancialReports: boolean;
  canViewAttendanceReports: boolean;
  canViewAttendanceLog: boolean;
  canEditAttendanceLog: boolean;
  canViewExecutiveDashboard: boolean;
  canAccessOperations: boolean;
  canViewDashboard: boolean;
  canViewDashboardQuickActions: boolean;
  restrictedByCostCenter: boolean;
}> = {
  guard: {
    label: "Guard",
    labelAr: "حارس",
    // الحارس: فقط تسجيل الحضور - بدون سجل الحضور وبدون تقارير الحضور
    pages: ["attendance"],
    canCreateBatch: false,
    canDeleteBatch: false,
    canSubmitDraft: false,
    canReviewAsAccountant: false,
    canReviewAsAuditor: false,
    canApproveAsFM: false,
    canManageWorkers: false,
    canManageGroups: false,
    canManageCostCenters: false,
    canManageUsers: false,
    canViewFinancialReports: false,
    canViewAttendanceReports: false,
    canViewAttendanceLog: false,
    canEditAttendanceLog: false,
    canViewExecutiveDashboard: false,
    canAccessOperations: false,
    canViewDashboard: false,
    canViewDashboardQuickActions: false,
    restrictedByCostCenter: false,
  },
  supervisor_tolan: {
    label: "Supervisor Tolan",
    labelAr: "مشرف تولان",
    // بدون معالجة الملاحظات (operationsReview)
    pages: ["operations"],
    canCreateBatch: false,
    canDeleteBatch: false,
    canSubmitDraft: false,
    canReviewAsAccountant: false,
    canReviewAsAuditor: false,
    canApproveAsFM: false,
    canManageWorkers: false,
    canManageGroups: false,
    canManageCostCenters: false,
    canManageUsers: false,
    canViewFinancialReports: false,
    canViewAttendanceReports: false,
    canViewAttendanceLog: false,
    canEditAttendanceLog: false,
    canViewExecutiveDashboard: false,
    canAccessOperations: true,
    canViewDashboard: false,
    canViewDashboardQuickActions: false,
    restrictedByCostCenter: true,
  },
  supervisor_malqa: {
    label: "Supervisor Malqa",
    labelAr: "مشرف الملقا",
    // بدون معالجة الملاحظات (operationsReview)
    pages: ["operations"],
    canCreateBatch: false,
    canDeleteBatch: false,
    canSubmitDraft: false,
    canReviewAsAccountant: false,
    canReviewAsAuditor: false,
    canApproveAsFM: false,
    canManageWorkers: false,
    canManageGroups: false,
    canManageCostCenters: false,
    canManageUsers: false,
    canViewFinancialReports: false,
    canViewAttendanceReports: false,
    canViewAttendanceLog: false,
    canEditAttendanceLog: false,
    canViewExecutiveDashboard: false,
    canAccessOperations: true,
    canViewDashboard: false,
    canViewDashboardQuickActions: false,
    restrictedByCostCenter: true,
  },
  admin_affairs: {
    label: "Admin Affairs",
    labelAr: "شؤون إدارية",
    pages: ["attendance", "workers", "groups", "costCenters", "payroll", "reports", "settings", "operations", "operationsReview"],
    canCreateBatch: true,
    canDeleteBatch: true,
    canSubmitDraft: true, // الشؤون الإدارية ترسل المسودة للمحاسب
    canReviewAsAccountant: false,
    canReviewAsAuditor: false,
    canApproveAsFM: false,
    canManageWorkers: true,
    canManageGroups: true,
    canManageCostCenters: true,
    canManageUsers: false,
    canViewFinancialReports: true,
    canViewAttendanceReports: true,
    canViewAttendanceLog: true,
    canEditAttendanceLog: true,
    canViewExecutiveDashboard: false,
    canAccessOperations: true,
    canViewDashboard: true,
    canViewDashboardQuickActions: false,
    restrictedByCostCenter: false,
  },
  accountant: {
    label: "Accountant",
    labelAr: "محاسب مالي",
    // المحاسب: يستلم المسودة من الشؤون الإدارية ويعتمد أو يرفض
    // لا يملك: حذف، سجل حضور، لوحة تحكم، إنشاء دفعة، إرسال مسودة
    pages: ["workers", "groups", "costCenters", "payroll", "reports", "settings", "operations", "operationsReview", "attendanceLog"],
    canCreateBatch: false,
    canDeleteBatch: false,
    canSubmitDraft: false, // لا يرسل المسودة - يستلمها فقط
    canReviewAsAccountant: true,
    canReviewAsAuditor: false,
    canApproveAsFM: false,
    canManageWorkers: true,
    canManageGroups: true,
    canManageCostCenters: true,
    canManageUsers: false,
    canViewFinancialReports: true,
    canViewAttendanceReports: true,
    canViewAttendanceLog: true,
    canEditAttendanceLog: false,
    canViewExecutiveDashboard: false,
    canAccessOperations: true,
    canViewDashboard: false,
    canViewDashboardQuickActions: false,
    restrictedByCostCenter: false,
  },
  auditor: {
    label: "Auditor",
    labelAr: "مراجع مالي",
    // المراجع: لا يتدخل إلا بعد أن تصله الدفعة من المحاسب
    // لا يملك: حذف، إنشاء دفعات، إرسال مسودة
    pages: ["payroll", "reports", "attendanceLog"],
    canCreateBatch: false,
    canDeleteBatch: false,
    canSubmitDraft: false, // لا يتعامل مع المسودة نهائياً
    canReviewAsAccountant: false,
    canReviewAsAuditor: true,
    canApproveAsFM: false,
    canManageWorkers: false,
    canManageGroups: false,
    canManageCostCenters: false,
    canManageUsers: false,
    canViewFinancialReports: true,
    canViewAttendanceReports: true,
    canViewAttendanceLog: true,
    canEditAttendanceLog: false,
    canViewExecutiveDashboard: false,
    canAccessOperations: false,
    canViewDashboard: false,
    canViewDashboardQuickActions: false,
    restrictedByCostCenter: false,
  },
  finance_manager: {
    label: "Finance Manager",
    labelAr: "مدير مالي",
    // المدير المالي: اعتماد نهائي أو رفض (تعود draft للشؤون الإدارية)
    // لا يملك: حذف، إنشاء دفعات، إرسال مسودة
    pages: ["payroll", "reports", "attendanceLog"],
    canCreateBatch: false,
    canDeleteBatch: false,
    canSubmitDraft: false,
    canReviewAsAccountant: false,
    canReviewAsAuditor: false,
    canApproveAsFM: true,
    canManageWorkers: false,
    canManageGroups: false,
    canManageCostCenters: false,
    canManageUsers: false,
    canViewFinancialReports: true,
    canViewAttendanceReports: true,
    canViewAttendanceLog: true,
    canEditAttendanceLog: false,
    canViewExecutiveDashboard: false,
    canAccessOperations: false,
    canViewDashboard: false,
    canViewDashboardQuickActions: false,
    restrictedByCostCenter: false,
  },
  executive: {
    label: "Executive",
    labelAr: "إدارة عليا",
    pages: ["executiveDashboard"],
    canCreateBatch: false,
    canDeleteBatch: false,
    canSubmitDraft: false,
    canReviewAsAccountant: false,
    canReviewAsAuditor: false,
    canApproveAsFM: false,
    canManageWorkers: false,
    canManageGroups: false,
    canManageCostCenters: false,
    canManageUsers: false,
    canViewFinancialReports: false,
    canViewAttendanceReports: false,
    canViewAttendanceLog: false,
    canEditAttendanceLog: false,
    canViewExecutiveDashboard: true,
    canAccessOperations: false,
    canViewDashboard: false,
    canViewDashboardQuickActions: false,
    restrictedByCostCenter: false,
  },
  restaurant_operations: {
    label: "Restaurant Operations",
    labelAr: "تشغيل مطاعم",
    // تشغيل مطاعم: صلاحية التشغيل وإدارة المطاعم فقط، لا غير
    pages: ["restaurantOperations"],
    canCreateBatch: false,
    canDeleteBatch: false,
    canSubmitDraft: false,
    canReviewAsAccountant: false,
    canReviewAsAuditor: false,
    canApproveAsFM: false,
    canManageWorkers: false,
    canManageGroups: false,
    canManageCostCenters: false,
    canManageUsers: false,
    canViewFinancialReports: false,
    canViewAttendanceReports: false,
    canViewAttendanceLog: false,
    canEditAttendanceLog: false,
    canViewExecutiveDashboard: false,
    canAccessOperations: false,
    canViewDashboard: false,
    canViewDashboardQuickActions: false,
    restrictedByCostCenter: false,
  },
  super_admin: {
    label: "Super Admin",
    labelAr: "سوبر أدمن",
    pages: ["all"],
    canCreateBatch: true,
    canDeleteBatch: true,
    canSubmitDraft: true,
    canReviewAsAccountant: true,
    canReviewAsAuditor: true,
    canApproveAsFM: true,
    canManageWorkers: true,
    canManageGroups: true,
    canManageCostCenters: true,
    canManageUsers: true,
    canViewFinancialReports: true,
    canViewAttendanceReports: true,
    canViewAttendanceLog: true,
    canEditAttendanceLog: true,
    canViewExecutiveDashboard: true,
    canAccessOperations: true,
    canViewDashboard: true,
    canViewDashboardQuickActions: true,
    restrictedByCostCenter: false,
  },
};

// Helper to check if a role is a supervisor type
export function isSupervisorRole(role: UserRole): boolean {
  return role === 'supervisor_tolan' || role === 'supervisor_malqa';
}

// Helper functions
export function hasPageAccess(role: UserRole, page: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (perms.pages.includes("all")) return true;
  return perms.pages.includes(page);
}

export function canPerformAction(role: UserRole, action: keyof typeof ROLE_PERMISSIONS[UserRole]): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return !!perms[action];
}

export function getRoleLabel(role: UserRole, lang: "ar" | "en" = "ar"): string {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return role;
  return lang === "ar" ? perms.labelAr : perms.label;
}

export function getAllRoles(): { value: UserRole; label: string; labelAr: string }[] {
  return Object.entries(ROLE_PERMISSIONS).map(([value, perms]) => ({
    value: value as UserRole,
    label: perms.label,
    labelAr: perms.labelAr,
  }));
}

/**
 * Batch approval stage validation
 * 
 * التسلسل الصحيح:
 * draft → (admin_affairs يرسل) → under_accountant_review
 * under_accountant_review → (accountant يعتمد) → under_financial_review
 * under_accountant_review → (accountant يرفض) → draft
 * under_financial_review → (auditor يعتمد) → under_accounts_manager_review
 * under_financial_review → (auditor يرفض) → draft
 * under_accounts_manager_review → (finance_manager يعتمد) → approved
 * under_accounts_manager_review → (finance_manager يرفض) → draft
 */
export function canApproveBatchAtStage(role: UserRole, currentStatus: string): { allowed: boolean; reason?: string } {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return { allowed: false, reason: "دور غير معروف" };
  
  // Super admin can do everything
  if (role === "super_admin") return { allowed: true };
  
  switch (currentStatus) {
    case "draft":
      // فقط الشؤون الإدارية يمكنها إرسال المسودة للمحاسب
      if (perms.canSubmitDraft) return { allowed: true };
      return { allowed: false, reason: "فقط الشؤون الإدارية يمكنهم إرسال الدفعة للمراجعة" };
    
    case "under_accountant_review":
      // فقط المحاسب يمكنه مراجعة الدفعة في هذه المرحلة
      if (perms.canReviewAsAccountant) return { allowed: true };
      return { allowed: false, reason: "فقط المحاسب المالي يمكنه مراجعة الدفعة في هذه المرحلة" };
    
    case "under_financial_review":
      // فقط المراجع يمكنه مراجعة الدفعة في هذه المرحلة (بعد اعتماد المحاسب)
      if (perms.canReviewAsAuditor) return { allowed: true };
      return { allowed: false, reason: "فقط المراجع المالي يمكنه مراجعة الدفعة في هذه المرحلة" };
    
    case "under_accounts_manager_review":
      // فقط المدير المالي يمكنه الاعتماد النهائي (بعد اعتماد المراجع)
      if (perms.canApproveAsFM) return { allowed: true };
      return { allowed: false, reason: "فقط المدير المالي يمكنه الاعتماد النهائي للدفعة" };
    
    default:
      return { allowed: false, reason: "حالة الدفعة لا تسمح بهذا الإجراء" };
  }
}

/**
 * التحقق من أن الدور يمكنه رفض الدفعة في المرحلة الحالية
 */
export function canRejectBatchAtStage(role: UserRole, currentStatus: string): { allowed: boolean; reason?: string } {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return { allowed: false, reason: "دور غير معروف" };
  
  // Super admin can do everything
  if (role === "super_admin") return { allowed: true };
  
  switch (currentStatus) {
    case "under_accountant_review":
      if (perms.canReviewAsAccountant) return { allowed: true };
      return { allowed: false, reason: "فقط المحاسب المالي يمكنه رفض الدفعة في هذه المرحلة" };
    
    case "under_financial_review":
      if (perms.canReviewAsAuditor) return { allowed: true };
      return { allowed: false, reason: "فقط المراجع المالي يمكنه رفض الدفعة في هذه المرحلة" };
    
    case "under_accounts_manager_review":
      if (perms.canApproveAsFM) return { allowed: true };
      return { allowed: false, reason: "فقط المدير المالي يمكنه رفض الدفعة في هذه المرحلة" };
    
    default:
      return { allowed: false, reason: "حالة الدفعة لا تسمح بالرفض" };
  }
}

// Check if a user created a batch (to prevent self-review)
export function cannotSelfReview(createdByUserId: number, currentUserId: number, role: UserRole): boolean {
  // Super admin bypasses this check
  if (role === "super_admin") return false;
  // Accountant cannot review a batch they created
  if (role === "accountant" && createdByUserId === currentUserId) return true;
  return false;
}
