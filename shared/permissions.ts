/**
 * Permission definitions for role-based access control
 * نظام صلاحيات شامل ومحكم لجميع الأدوار
 */

export const PERMISSIONS = {
  // Dashboard permissions
  DASHBOARD_VIEW: 'dashboard_view',
  
  // Attendance permissions
  ATTENDANCE_RECORD: 'attendance_record', // تسجيل الحضور (الحارس)
  ATTENDANCE_VIEW: 'attendance_view', // عرض سجل الحضور
  ATTENDANCE_MANAGE: 'attendance_manage', // تعديل سجلات الحضور
  ATTENDANCE_EXPORT: 'attendance_export', // تصدير تقارير الحضور
  
  // Worker permissions
  WORKER_VIEW: 'worker_view', // عرض قائمة العمال
  WORKER_CREATE: 'worker_create', // إضافة عامل جديد
  WORKER_EDIT: 'worker_edit', // تعديل بيانات عامل
  WORKER_DELETE: 'worker_delete', // حذف عامل
  WORKER_EXPORT: 'worker_export', // تصدير قائمة العمال
  
  // Group permissions
  GROUP_VIEW: 'group_view', // عرض المجموعات
  GROUP_MANAGE: 'group_manage', // إدارة المجموعات (إضافة/تعديل/حذف)
  
  // Payroll permissions
  PAYROLL_VIEW: 'payroll_view', // عرض دفعات الرواتب
  PAYROLL_CREATE: 'payroll_create', // إنشاء دفعة رواتب جديدة
  PAYROLL_EDIT: 'payroll_edit', // تعديل دفعة رواتب
  PAYROLL_DELETE: 'payroll_delete', // حذف دفعة رواتب
  PAYROLL_ACCOUNTANT_REVIEW: 'payroll_batch_accountant_review', // مراجعة المحاسب
  PAYROLL_FINANCIAL_REVIEW: 'payroll_batch_financial_review', // مراجعة المالية
  PAYROLL_MANAGER_REVIEW: 'payroll_batch_manager_review', // اعتماد مدير الحسابات
  PAYROLL_BATCH_FINAL_APPROVE: 'payroll_batch_final_approve', // الاعتماد النهائي
  PAYROLL_EXPORT: 'payroll_export', // تصدير الرواتب
  
  // Financial Reports permissions
  FINANCIAL_REPORTS_VIEW: 'financial_reports_view', // عرض التقارير المالية
  FINANCIAL_REPORTS_EXPORT: 'financial_reports_export', // تصدير التقارير المالية
  
  // User management permissions
  USER_VIEW: 'user_view', // عرض قائمة المستخدمين
  USER_CREATE: 'user_create', // إضافة مستخدم جديد
  USER_EDIT: 'user_edit', // تعديل بيانات مستخدم
  USER_DELETE: 'user_delete', // حذف مستخدم
  USER_PERMISSIONS_MANAGE: 'user_permissions_manage', // إدارة صلاحيات المستخدمين
  
  // Reports permissions
  REPORTS_VIEW: 'reports_view', // عرض التقارير
  REPORTS_EXPORT: 'reports_export', // تصدير التقارير
  
  // Operational flags permissions
  OPERATIONAL_FLAGS_VIEW: 'operational_flags_view', // عرض البلاغات التشغيلية
  OPERATIONAL_FLAGS_MANAGE: 'operational_flags_manage', // إدارة البلاغات التشغيلية
  
  // Cost Center permissions
  COST_CENTER_VIEW: 'cost_center_view', // عرض مراكز التكلفة
  COST_CENTER_MANAGE: 'cost_center_manage', // إدارة مراكز التكلفة
  
  // Role Management permissions
  ROLE_VIEW: 'role_view', // عرض الأدوار
  ROLE_MANAGE: 'role_manage', // إدارة الأدوار (إضافة/تعديل/حذف/تخصيص صلاحيات)
  
  // System Settings permissions
  SYSTEM_SETTINGS_VIEW: 'system_settings_view', // عرض إعدادات النظام
  SYSTEM_SETTINGS_MANAGE: 'system_settings_manage', // إدارة إعدادات النظام
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/**
 * Role-based permission mappings
 * تعريف صلاحيات كل دور بدقة
 */
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  /**
   * الحارس (Security Guard)
   * الصلاحيات: تسجيل الحضور فقط
   */
  security_guard: [
    PERMISSIONS.ATTENDANCE_RECORD, // تسجيل الحضور والانصراف
  ],
  
  /**
   * مدير الموارد البشرية (HR Manager)
   * الصلاحيات: إدارة العمال والحضور والمجموعات
   */
  hr_manager: [
    PERMISSIONS.DASHBOARD_VIEW,
    // إدارة العمال
    PERMISSIONS.WORKER_VIEW,
    PERMISSIONS.WORKER_CREATE,
    PERMISSIONS.WORKER_EDIT,
    PERMISSIONS.WORKER_DELETE,
    PERMISSIONS.WORKER_EXPORT,
    // إدارة المجموعات
    PERMISSIONS.GROUP_VIEW,
    PERMISSIONS.GROUP_MANAGE,
    // إدارة الحضور
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.ATTENDANCE_EXPORT,
    // البلاغات التشغيلية
    PERMISSIONS.OPERATIONAL_FLAGS_VIEW,
    PERMISSIONS.OPERATIONAL_FLAGS_MANAGE,
    // التقارير
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.REPORTS_EXPORT,
  ],
  
  /**
   * المحاسب (Accountant)
   * الصلاحيات: إنشاء ومراجعة دفعات الرواتب
   */
  accountant: [
    PERMISSIONS.DASHBOARD_VIEW,
    // عرض العمال والحضور (للمراجعة فقط)
    PERMISSIONS.WORKER_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.GROUP_VIEW,
    // إدارة الرواتب
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.PAYROLL_CREATE,
    PERMISSIONS.PAYROLL_ACCOUNTANT_REVIEW, // مراجعة المحاسب
    // التقارير المالية
    PERMISSIONS.FINANCIAL_REPORTS_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],
  
  /**
   * المراجع المالي (Financial Reviewer)
   * الصلاحيات: مراجعة مالية لدفعات الرواتب
   */
  financial_reviewer: [
    PERMISSIONS.DASHBOARD_VIEW,
    // عرض العمال والحضور (للمراجعة فقط)
    PERMISSIONS.WORKER_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.GROUP_VIEW,
    // مراجعة الرواتب
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.PAYROLL_FINANCIAL_REVIEW, // مراجعة المالية
    // التقارير المالية
    PERMISSIONS.FINANCIAL_REPORTS_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],
  
  /**
   * مدير الحسابات (Accounts Manager)
   * الصلاحيات: اعتماد نهائي وتصدير الرواتب + إدارة المستخدمين
   */
  accounts_manager: [
    PERMISSIONS.DASHBOARD_VIEW,
    // عرض العمال والحضور
    PERMISSIONS.WORKER_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.GROUP_VIEW,
    // اعتماد وتصدير الرواتب
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.PAYROLL_MANAGER_REVIEW, // الاعتماد النهائي
    PERMISSIONS.PAYROLL_EXPORT,
    // التقارير المالية
    PERMISSIONS.FINANCIAL_REPORTS_VIEW,
    PERMISSIONS.FINANCIAL_REPORTS_EXPORT,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.REPORTS_EXPORT,
    // إدارة المستخدمين
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_EDIT,
    PERMISSIONS.USER_DELETE,
    PERMISSIONS.USER_PERMISSIONS_MANAGE,
  ],
  
  /**
   * المدير العام / Super Admin (Admin)
   * الصلاحيات: جميع الصلاحيات بدون استثناء
   */
  admin: Object.values(PERMISSIONS),
};

/**
 * Check if a role has a specific permission
 */
export function roleHasPermission(role: string, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Page-to-permission mappings
 * ربط كل صفحة بالصلاحيات المطلوبة للوصول إليها
 */
export const PAGE_PERMISSIONS: Record<string, Permission[]> = {
  // الصفحات العامة
  '/': [], // Home page - accessible to all
  '/dashboard': [PERMISSIONS.DASHBOARD_VIEW], // لوحة التحكم
  
  // الحضور والانصراف
  '/attendance': [PERMISSIONS.ATTENDANCE_RECORD], // تسجيل الحضور (الحارس)
  '/attendance/log': [PERMISSIONS.ATTENDANCE_VIEW], // سجل الحضور
  
  // العمال والمجموعات
  '/workers': [PERMISSIONS.WORKER_VIEW], // قائمة العمال
  '/workers/add': [PERMISSIONS.WORKER_CREATE], // إضافة عامل
  '/workers/edit': [PERMISSIONS.WORKER_EDIT], // تعديل عامل
  '/groups': [PERMISSIONS.GROUP_VIEW], // المجموعات
  
  // الرواتب والمالية
  '/payroll/batches': [PERMISSIONS.PAYROLL_VIEW], // دفعات الرواتب
  '/payroll/create': [PERMISSIONS.PAYROLL_CREATE], // إنشاء دفعة رواتب
  '/finance/reports': [PERMISSIONS.FINANCIAL_REPORTS_VIEW], // التقارير المالية
  
  // التقارير
  '/reports': [PERMISSIONS.REPORTS_VIEW], // التقارير
  
  // البلاغات التشغيلية
  '/operational-flags': [PERMISSIONS.OPERATIONAL_FLAGS_VIEW], // البلاغات التشغيلية
  
  // إدارة المستخدمين
  '/users': [PERMISSIONS.USER_VIEW], // قائمة المستخدمين
  '/users/permissions': [PERMISSIONS.USER_PERMISSIONS_MANAGE], // صلاحيات المستخدمين
  
  // مراكز التكلفة
  '/cost-centers': [PERMISSIONS.COST_CENTER_VIEW], // مراكز التكلفة
  
  // إعدادات النظام
  '/settings': [PERMISSIONS.SYSTEM_SETTINGS_VIEW], // إعدادات النظام
};

/**
 * Check if a user has permission to access a page
 */
export function canAccessPage(userPermissions: string[], pagePath: string): boolean {
  const requiredPermissions = PAGE_PERMISSIONS[pagePath];
  
  // If no permissions required, allow access
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }
  
  // Check if user has at least one of the required permissions
  return requiredPermissions.some(permission => 
    userPermissions.includes(permission)
  );
}

/**
 * Get user-friendly role name in Arabic
 */
export function getRoleDisplayName(role: string): string {
  const roleNames: Record<string, string> = {
    admin: 'مدير عام',
    accounts_manager: 'مدير الحسابات',
    financial_reviewer: 'مراجع مالي',
    accountant: 'محاسب',
    hr_manager: 'مدير الموارد البشرية',
    security_guard: 'حارس',
  };
  return roleNames[role] || role;
}
