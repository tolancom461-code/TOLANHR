-- إضافة دور محاسب تكاليف التشغيل مع الحفاظ على جميع الأدوار الحالية.
-- شغّل هذا الملف مرة واحدة على قاعدة TiDB/MySQL قبل تعيين الدور لمستخدم.
ALTER TABLE users MODIFY COLUMN role ENUM(
  'guard',
  'supervisor',
  'supervisor_tolan',
  'supervisor_malqa',
  'admin_affairs',
  'accountant',
  'operations_cost_accountant',
  'auditor',
  'finance_manager',
  'executive',
  'super_admin',
  'restaurant_operations',
  'data_entry'
) NOT NULL DEFAULT 'guard';
