-- إضافة قيمة "restaurant_operations" (تشغيل مطاعم) لعمود role في جدول users
ALTER TABLE users MODIFY COLUMN role ENUM(
  'guard',
  'supervisor',
  'supervisor_tolan',
  'supervisor_malqa',
  'admin_affairs',
  'accountant',
  'auditor',
  'finance_manager',
  'executive',
  'super_admin',
  'restaurant_operations'
) NOT NULL DEFAULT 'guard';
