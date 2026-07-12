import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileSearch, 
  Calendar, 
  User, 
  Filter, 
  ChevronRight, 
  ChevronLeft,
  BarChart3,
  Eye,
  X,
  ArrowLeftRight,
  Printer
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ===== Arabic action labels =====
const ACTION_LABELS: Record<string, string> = {
  CREATE_WORKER: 'إضافة عامل',
  UPDATE_WORKER: 'تعديل بيانات عامل',
  DELETE_WORKER: 'حذف عامل',
  CREATE_USER: 'إضافة مستخدم',
  UPDATE_USER: 'تعديل بيانات مستخدم',
  DELETE_USER: 'حذف مستخدم',
  UPDATE_USER_ROLE: 'تغيير دور مستخدم',
  ASSIGN_COST_CENTERS: 'تعيين مراكز تكلفة',
  UPDATE_PROFILE: 'تعديل الملف الشخصي',
  CHANGE_PASSWORD: 'تغيير كلمة المرور',
  CREATE_GROUP: 'إضافة مجموعة',
  UPDATE_GROUP: 'تعديل مجموعة',
  DELETE_GROUP: 'حذف مجموعة',
  CREATE_COST_CENTER: 'إضافة مركز تكلفة',
  UPDATE_COST_CENTER: 'تعديل مركز تكلفة',
  DELETE_COST_CENTER: 'حذف مركز تكلفة',
  ADD_MISSING_CHECK_IN: 'إضافة بصمة حضور ناقصة',
  ADD_MISSING_CHECK_OUT: 'إضافة بصمة انصراف ناقصة',
  UPDATE_ATTENDANCE: 'تعديل بصمة حضور',
  DELETE_ATTENDANCE: 'حذف بصمة',
  CREATE_PAYROLL_BATCH: 'إنشاء دفعة رواتب',
  SUBMIT_PAYROLL_FOR_REVIEW: 'إرسال دفعة للمراجعة',
  SUBMIT_TO_FINAL_REVIEW: 'إرسال للمراجعة النهائية',
  SUBMIT_FOR_APPROVAL: 'إرسال للاعتماد',
  ACCOUNTANT_APPROVE_PAYROLL: 'اعتماد المحاسب للدفعة',
  ACCOUNTANT_REJECT_PAYROLL: 'رفض المحاسب للدفعة',
  AUDITOR_APPROVE_PAYROLL: 'اعتماد المراجع للدفعة',
  AUDITOR_REJECT_PAYROLL: 'رفض المراجع للدفعة',
  FM_APPROVE_PAYROLL: 'اعتماد المدير المالي',
  FM_REJECT_PAYROLL: 'رفض المدير المالي',
  APPROVE_BATCH_FINAL: 'اعتماد نهائي للدفعة',
  REJECT_BATCH_FINAL: 'رفض نهائي للدفعة',
  DELETE_PAYROLL_BATCH: 'حذف دفعة رواتب',
  FORCE_DELETE_PAYROLL_BATCH: 'حذف نهائي إجباري لدفعة',
  FORCE_UNLOCK_PAYROLL: 'إلغاء قفل دفعة رواتب',
  RELOCK_PAYROLL: 'إعادة قفل دفعة رواتب',
  CREATE_PAY_OVERRIDE: 'إضافة استثناء مالي',
  APPROVE_PAY_OVERRIDE: 'اعتماد استثناء مالي',
  REJECT_PAY_OVERRIDE: 'رفض استثناء مالي',
  CREATE_FLAG: 'إنشاء بلاغ تشغيلي',
  APPROVE_FLAG: 'الموافقة على بلاغ',
  REJECT_FLAG: 'رفض بلاغ',
  CREATE_TEMP_ASSIGNMENT: 'إنشاء انتداب مؤقت',
  UPDATE_TEMP_ASSIGNMENT: 'تعديل انتداب مؤقت',
  CANCEL_TEMP_ASSIGNMENT: 'إلغاء انتداب مؤقت',
  DELETE_TEMP_ASSIGNMENT: 'حذف انتداب مؤقت',
  UPDATE_PAYROLL_ITEM: 'تعديل بند راتب',
  BULK_UPDATE_ATTENDANCE: 'تعديل جماعي للحضور',
  SET_FULL_DAY_OVERRIDE: 'تجاوز يوم كامل',
  UPDATE_DAILY_RECORD: 'تعديل سجل يومي',
  ADD_BATCH_NOTE: 'إضافة ملاحظة على دفعة',
  UPDATE_GROUP_SCHEDULE: 'تعديل جدول مجموعة',
  UPDATE_WEEKLY_SCHEDULES: 'تعديل الجداول الأسبوعية',
  'نسخ احتياطي Excel': 'نسخ احتياطي Excel',
  'نسخ احتياطي SQL': 'نسخ احتياطي SQL',
  'نسخ احتياطي CSV': 'نسخ احتياطي CSV',
};

const TABLE_LABELS: Record<string, string> = {
  workers: 'العمال',
  users: 'المستخدمين',
  groups: 'المجموعات',
  cost_centers: 'مراكز التكلفة',
  attendance_events: 'الحضور والانصراف',
  payroll_batches: 'دفعات الرواتب',
  pay_overrides: 'الاستثناءات المالية',
  operational_flags: 'البلاغات التشغيلية',
  temporary_assignments: 'الانتدابات المؤقتة',
  backup: 'النسخ الاحتياطي',
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'مدير النظام',
  admin_affairs: 'الشؤون الإدارية',
  accountant: 'المحاسب',
  auditor: 'المراجع المالي',
  finance_manager: 'المدير المالي',
  guard: 'حارس',
  executive: 'الإدارة العليا',
  supervisor_tolan: 'مشرف طولان',
  supervisor_malqa: 'مشرف ملقا',
};

const FIELD_LABELS: Record<string, string> = {
  fullName: 'الاسم الكامل',
  code: 'الرمز',
  groupId: 'رقم المجموعة',
  status: 'الحالة',
  nationality: 'الجنسية',
  jobTitle: 'المسمى الوظيفي',
  hireDate: 'تاريخ التعيين',
  baseSalary: 'الراتب الأساسي',
  dailyRate: 'الأجر اليومي',
  housingAllowance: 'بدل السكن',
  transportAllowance: 'بدل النقل',
  foodAllowance: 'بدل الطعام',
  otherAllowance: 'بدلات أخرى',
  iqamaNumber: 'رقم الإقامة',
  passportNumber: 'رقم الجواز',
  phone: 'الهاتف',
  username: 'اسم المستخدم',
  role: 'الدور',
  isActive: 'نشط',
  email: 'البريد الإلكتروني',
  name: 'الاسم',
  description: 'الوصف',
  costCenterId: 'مركز التكلفة',
  costCenterIds: 'مراكز التكلفة',
  workerId: 'رقم العامل',
  eventType: 'نوع البصمة',
  eventTime: 'وقت البصمة',
  newTime: 'الوقت الجديد',
  note: 'ملاحظة',
  internalNote: 'ملاحظة داخلية',
  periodStart: 'بداية الفترة',
  periodEnd: 'نهاية الفترة',
  itemsCount: 'عدد العناصر',
  overrideType: 'نوع الاستثناء',
  amount: 'المبلغ',
  reason: 'السبب',
  notes: 'ملاحظات',
  type: 'النوع',
  tables: 'الجداول',
  table: 'الجدول',
  timestamp: 'الوقت',
  workerName: 'اسم العامل',
  fromGroupId: 'من مجموعة',
  toGroupId: 'إلى مجموعة',
  startDate: 'تاريخ البداية',
  endDate: 'تاريخ النهاية',
  passwordChanged: 'تم تغيير كلمة المرور',
  checkInTime: 'وقت الحضور',
  checkOutTime: 'وقت الانصراف',
};

const OVERRIDE_TYPE_LABELS: Record<string, string> = {
  bonus: 'مكافأة',
  deduction: 'خصم',
  advance: 'سلفة',
  emergency_call: 'استدعاء طوارئ',
};

// Action category colors
function getActionColor(action: string): string {
  if (action.includes('CREATE') || action.includes('APPROVE') || action.includes('إنشاء') || action.includes('ADD_MISSING')) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  if (action.includes('DELETE') || action.includes('REJECT') || action.includes('FORCE') || action.includes('CANCEL')) return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  if (action.includes('UPDATE') || action.includes('SUBMIT') || action.includes('LOCK') || action.includes('CHANGE') || action.includes('ASSIGN')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  if (action.includes('نسخ احتياطي')) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
  return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
}

// ===== بناء وصف عربي واضح ومفهوم لكل عملية =====
function buildArabicDescription(log: any): string {
  const action = log.action || '';
  const oldValues = log.oldValues;
  const newValues = log.newValues;
  const userName = log.userName || 'مستخدم غير معروف';
  const userRole = ROLE_LABELS[log.userRole] || log.userRole || '';
  const userInfo = userRole ? `${userName} (${userRole})` : userName;

  // ===== العمال =====
  if (action === 'CREATE_WORKER') {
    const wName = newValues?.fullName || '';
    const wCode = newValues?.code || '';
    return `${userInfo} قام بإضافة العامل ${wName} (${wCode})`;
  }
  if (action === 'UPDATE_WORKER') {
    const wName = oldValues?.fullName || newValues?.fullName || '';
    const wCode = oldValues?.code || newValues?.code || '';
    const changes = buildChanges(oldValues, newValues);
    return `${userInfo} قام بتعديل بيانات العامل ${wName} (${wCode})${changes}`;
  }
  if (action === 'DELETE_WORKER') {
    const wName = oldValues?.fullName || '';
    const wCode = oldValues?.code || '';
    return `${userInfo} قام بحذف العامل ${wName} (${wCode})`;
  }

  // ===== المستخدمين =====
  if (action === 'CREATE_USER') {
    const uName = newValues?.fullName || newValues?.username || '';
    return `${userInfo} قام بإضافة المستخدم ${uName}`;
  }
  if (action === 'UPDATE_USER') {
    const uName = oldValues?.fullName || newValues?.fullName || '';
    const changes = buildChanges(oldValues, newValues);
    return `${userInfo} قام بتعديل بيانات المستخدم ${uName}${changes}`;
  }
  if (action === 'DELETE_USER') {
    const uName = oldValues?.fullName || oldValues?.username || '';
    return `${userInfo} قام بحذف المستخدم ${uName}`;
  }
  if (action === 'UPDATE_USER_ROLE') {
    const oldRole = ROLE_LABELS[oldValues?.role] || oldValues?.role || '';
    const newRole = ROLE_LABELS[newValues?.role] || newValues?.role || '';
    return `${userInfo} قام بتغيير دور المستخدم من "${oldRole}" إلى "${newRole}"`;
  }
  if (action === 'ASSIGN_COST_CENTERS') {
    const count = newValues?.costCenterIds?.length || 0;
    return `${userInfo} قام بتعيين ${count} مركز تكلفة للمستخدم رقم ${log.recordId}`;
  }
  if (action === 'UPDATE_PROFILE') {
    const uName = oldValues?.fullName || newValues?.fullName || '';
    return `${userInfo} قام بتعديل ملفه الشخصي${uName ? ` (${uName})` : ''}`;
  }
  if (action === 'CHANGE_PASSWORD') {
    return `${userInfo} قام بتغيير كلمة المرور الخاصة به`;
  }

  // ===== المجموعات =====
  if (action === 'CREATE_GROUP') {
    const gName = newValues?.name || '';
    const gCode = newValues?.code || '';
    return `${userInfo} قام بإنشاء المجموعة ${gName} (${gCode})`;
  }
  if (action === 'UPDATE_GROUP') {
    const gName = oldValues?.name || newValues?.name || '';
    const gCode = oldValues?.code || newValues?.code || '';
    const changes = buildChanges(oldValues, newValues);
    return `${userInfo} قام بتعديل المجموعة ${gName} (${gCode})${changes}`;
  }
  if (action === 'DELETE_GROUP') {
    const gName = oldValues?.name || '';
    const gCode = oldValues?.code || '';
    return `${userInfo} قام بحذف المجموعة ${gName} (${gCode})`;
  }

  // ===== مراكز التكلفة =====
  if (action === 'CREATE_COST_CENTER') {
    const ccName = newValues?.name || '';
    const ccCode = newValues?.code || '';
    return `${userInfo} قام بإنشاء مركز التكلفة ${ccName} (${ccCode})`;
  }
  if (action === 'UPDATE_COST_CENTER') {
    const ccName = oldValues?.name || newValues?.name || '';
    const ccCode = oldValues?.code || newValues?.code || '';
    const changes = buildChanges(oldValues, newValues);
    return `${userInfo} قام بتعديل مركز التكلفة ${ccName} (${ccCode})${changes}`;
  }
  if (action === 'DELETE_COST_CENTER') {
    const ccName = oldValues?.name || '';
    const ccCode = oldValues?.code || '';
    return `${userInfo} قام بحذف مركز التكلفة ${ccName} (${ccCode})`;
  }

  // ===== الحضور والانصراف =====
  if (action === 'ADD_MISSING_CHECK_IN') {
    const wName = newValues?.workerName || '';
    const wId = newValues?.workerId || '';
    const workerDisplay = wName || `عامل رقم ${wId}`;
    const time = newValues?.eventTime || newValues?.checkInTime || '';
    return `${userInfo} قام بإضافة بصمة حضور ناقصة للعامل ${workerDisplay}${time ? ` - الوقت: ${time}` : ''}`;
  }
  if (action === 'ADD_MISSING_CHECK_OUT') {
    const wName = newValues?.workerName || '';
    const wId = newValues?.workerId || '';
    const workerDisplay = wName || `عامل رقم ${wId}`;
    const time = newValues?.eventTime || newValues?.checkOutTime || '';
    return `${userInfo} قام بإضافة بصمة انصراف ناقصة للعامل ${workerDisplay}${time ? ` - الوقت: ${time}` : ''}`;
  }
  if (action === 'UPDATE_ATTENDANCE') {
    const wName = oldValues?.workerName || newValues?.workerName || '';
    const wId = oldValues?.workerId || newValues?.workerId || '';
    const workerDisplay = wName || `عامل رقم ${wId}`;
    const oldTime = oldValues?.eventTime || '';
    const newTime = newValues?.newTime || '';
    let desc = `${userInfo} قام بتعديل بصمة العامل ${workerDisplay}`;
    if (oldTime && newTime) desc += ` من ${oldTime} إلى ${newTime}`;
    return desc;
  }
  if (action === 'DELETE_ATTENDANCE') {
    const wName = oldValues?.workerName || '';
    const wId = oldValues?.workerId || '';
    const workerDisplay = wName || `عامل رقم ${wId}`;
    const eType = oldValues?.eventType === 'check_in' ? 'حضور' : oldValues?.eventType === 'check_out' ? 'انصراف' : oldValues?.eventType || '';
    const time = oldValues?.eventTime || '';
    return `${userInfo} قام بحذف بصمة ${eType} للعامل ${workerDisplay}${time ? ` - الوقت: ${time}` : ''}`;
  }

  // ===== دفعات الرواتب =====
  if (action === 'CREATE_PAYROLL_BATCH') {
    const start = newValues?.periodStart || '';
    const end = newValues?.periodEnd || '';
    const count = newValues?.itemsCount || '';
    return `${userInfo} قام بإنشاء دفعة رواتب للفترة ${start} إلى ${end}${count ? ` (${count} عامل)` : ''}`;
  }
  if (action === 'SUBMIT_PAYROLL_FOR_REVIEW') {
    return `${userInfo} قام بإرسال الدفعة رقم ${log.recordId} للمراجعة`;
  }
  if (action === 'SUBMIT_TO_FINAL_REVIEW') {
    return `${userInfo} قام بإرسال الدفعة رقم ${log.recordId} للمراجعة النهائية`;
  }
  if (action === 'SUBMIT_FOR_APPROVAL') {
    return `${userInfo} قام بإرسال الدفعة رقم ${log.recordId} للاعتماد`;
  }
  if (action === 'ACCOUNTANT_APPROVE_PAYROLL') {
    return `${userInfo} (المحاسب) قام باعتماد الدفعة رقم ${log.recordId}`;
  }
  if (action === 'ACCOUNTANT_REJECT_PAYROLL') {
    const note = newValues?.note || '';
    return `${userInfo} (المحاسب) قام برفض الدفعة رقم ${log.recordId}${note ? ` - السبب: ${note}` : ''}`;
  }
  if (action === 'AUDITOR_APPROVE_PAYROLL') {
    return `${userInfo} (المراجع) قام باعتماد الدفعة رقم ${log.recordId}`;
  }
  if (action === 'AUDITOR_REJECT_PAYROLL') {
    const note = newValues?.note || '';
    return `${userInfo} (المراجع) قام برفض الدفعة رقم ${log.recordId}${note ? ` - السبب: ${note}` : ''}`;
  }
  if (action === 'FM_APPROVE_PAYROLL' || action === 'APPROVE_BATCH_FINAL') {
    return `${userInfo} (المدير المالي) قام بالاعتماد النهائي للدفعة رقم ${log.recordId}`;
  }
  if (action === 'FM_REJECT_PAYROLL' || action === 'REJECT_BATCH_FINAL') {
    const reason = newValues?.reason || newValues?.note || '';
    return `${userInfo} (المدير المالي) قام برفض الدفعة رقم ${log.recordId}${reason ? ` - السبب: ${reason}` : ''}`;
  }
  if (action === 'DELETE_PAYROLL_BATCH') {
    return `${userInfo} قام بحذف دفعة الرواتب رقم ${log.recordId}`;
  }
  if (action === 'FORCE_DELETE_PAYROLL_BATCH') {
    return `${userInfo} قام بالحذف النهائي الإجباري لدفعة الرواتب رقم ${log.recordId}`;
  }
  if (action === 'FORCE_UNLOCK_PAYROLL') {
    const reason = newValues?.reason || '';
    return `${userInfo} قام بإلغاء قفل دفعة الرواتب رقم ${log.recordId}${reason ? ` - السبب: ${reason}` : ''}`;
  }
  if (action === 'RELOCK_PAYROLL') {
    return `${userInfo} قام بإعادة قفل دفعة الرواتب رقم ${log.recordId}`;
  }

  // ===== الاستثناءات المالية =====
  if (action === 'CREATE_PAY_OVERRIDE') {
    const wName = newValues?.workerName || '';
    const wId = newValues?.workerId || '';
    const workerDisplay = wName || `عامل رقم ${wId}`;
    const oType = OVERRIDE_TYPE_LABELS[newValues?.overrideType] || newValues?.overrideType || '';
    const amount = newValues?.amount || '';
    return `${userInfo} قام بإضافة ${oType} للعامل ${workerDisplay}${amount ? ` بمبلغ ${amount} ريال` : ''}`;
  }
  if (action === 'APPROVE_PAY_OVERRIDE') {
    return `${userInfo} قام باعتماد الاستثناء المالي رقم ${log.recordId}`;
  }
  if (action === 'REJECT_PAY_OVERRIDE') {
    return `${userInfo} قام برفض الاستثناء المالي رقم ${log.recordId}`;
  }

  // ===== البلاغات التشغيلية =====
  if (action === 'CREATE_FLAG') {
    const wName = newValues?.workerName || '';
    const wId = newValues?.workerId || '';
    const desc = newValues?.description || '';
    const workerDisplay = wName || `عامل رقم ${wId}`;
    return `${userInfo} قام بإنشاء بلاغ تشغيلي للعامل ${workerDisplay}${desc ? ` - ${desc}` : ''}`;
  }
  if (action === 'APPROVE_FLAG') {
    return `${userInfo} قام بالموافقة على البلاغ رقم ${log.recordId}`;
  }
  if (action === 'REJECT_FLAG') {
    return `${userInfo} قام برفض البلاغ رقم ${log.recordId}`;
  }

  // ===== الانتدابات المؤقتة =====
  if (action === 'CREATE_TEMP_ASSIGNMENT') {
    const wName = newValues?.workerName || '';
    const wId = newValues?.workerId || '';
    return `${userInfo} قام بإنشاء انتداب مؤقت${wName ? ` للعامل ${wName}` : wId ? ` للعامل رقم ${wId}` : ''}`;
  }
  if (action === 'UPDATE_TEMP_ASSIGNMENT') {
    return `${userInfo} قام بتعديل الانتداب المؤقت رقم ${log.recordId}`;
  }
  if (action === 'CANCEL_TEMP_ASSIGNMENT') {
    return `${userInfo} قام بإلغاء الانتداب المؤقت رقم ${log.recordId}`;
  }
  if (action === 'DELETE_TEMP_ASSIGNMENT') {
    return `${userInfo} قام بحذف الانتداب المؤقت رقم ${log.recordId}`;
  }

  // ===== عمليات إضافية =====
  if (action === 'UPDATE_PAYROLL_ITEM') {
    return `${userInfo} قام بتعديل بند راتب في الدفعة - العنصر رقم ${log.recordId}`;
  }
  if (action === 'BULK_UPDATE_ATTENDANCE') {
    const wName = oldValues?.workerName || '';
    const wId = oldValues?.workerId || '';
    const workerDisplay = wName || (wId ? `عامل رقم ${wId}` : '');
    const adj = newValues?.adjustmentMinutes || '';
    return `${userInfo} قام بتعديل جماعي للحضور${workerDisplay ? ` - ${workerDisplay}` : ''}${adj ? ` (${adj} دقيقة)` : ''}`;
  }
  if (action === 'SET_FULL_DAY_OVERRIDE') {
    const wName = newValues?.workerName || '';
    const wId = newValues?.workerId || '';
    const workerDisplay = wName || `عامل رقم ${wId}`;
    const date = newValues?.workDate || '';
    const override = newValues?.override ? 'تفعيل' : 'إلغاء';
    return `${userInfo} قام بـ${override} تجاوز يوم كامل للعامل ${workerDisplay} بتاريخ ${date}`;
  }
  if (action === 'UPDATE_DAILY_RECORD') {
    return `${userInfo} قام بتعديل السجل اليومي رقم ${log.recordId}`;
  }
  if (action === 'ADD_BATCH_NOTE') {
    return `${userInfo} قام بإضافة ملاحظة على الدفعة رقم ${log.recordId}`;
  }
  if (action === 'UPDATE_GROUP_SCHEDULE') {
    return `${userInfo} قام بتعديل جدول المجموعة رقم ${log.recordId}`;
  }
  if (action === 'UPDATE_WEEKLY_SCHEDULES') {
    const count = newValues?.schedulesCount || '';
    return `${userInfo} قام بتعديل الجداول الأسبوعية للمجموعة رقم ${log.recordId}${count ? ` (${count} أيام)` : ''}`;
  }

  // ===== النسخ الاحتياطي =====
  if (action.includes('نسخ احتياطي')) {
    const bType = newValues?.type?.toUpperCase() || '';
    return `${userInfo} قام بإنشاء نسخة احتياطية ${bType}`;
  }

  // ===== افتراضي =====
  const actionLabel = ACTION_LABELS[action] || action;
  return `${userInfo} قام بتنفيذ: ${actionLabel}`;
}

// بناء نص التغييرات (من → إلى)
function buildChanges(oldValues: any, newValues: any): string {
  if (!oldValues || !newValues) return '';
  const changes: string[] = [];
  
  for (const key of Object.keys(newValues)) {
    if (key === 'passwordChanged' || key === 'passwordHash') continue;
    const oldVal = oldValues[key];
    const newVal = newValues[key];
    const fieldName = FIELD_LABELS[key] || key;
    
    if (oldVal !== undefined && newVal !== undefined && oldVal !== newVal) {
      const oldDisplay = formatChangeValue(key, oldVal);
      const newDisplay = formatChangeValue(key, newVal);
      changes.push(`${fieldName}: من "${oldDisplay}" إلى "${newDisplay}"`);
    }
  }
  
  if (changes.length === 0) return '';
  if (changes.length <= 2) return ` - ${changes.join('، ')}`;
  return ` - ${changes.length} تغييرات`;
}

function formatChangeValue(key: string, value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (key === 'isActive') return value ? 'نشط' : 'غير نشط';
  if (key === 'status') {
    const labels: Record<string, string> = { active: 'نشط', inactive: 'غير نشط', terminated: 'منتهي', transferred: 'منقول' };
    return labels[value] || String(value);
  }
  if (key === 'role') return ROLE_LABELS[value] || String(value);
  if (key === 'overrideType') return OVERRIDE_TYPE_LABELS[value] || String(value);
  if (key === 'eventType') return value === 'check_in' ? 'حضور' : value === 'check_out' ? 'انصراف' : String(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Category filter options
const TABLE_FILTER_OPTIONS = [
  { value: 'all', label: 'الكل' },
  { value: 'workers', label: 'العمال' },
  { value: 'users', label: 'المستخدمين' },
  { value: 'groups', label: 'المجموعات' },
  { value: 'cost_centers', label: 'مراكز التكلفة' },
  { value: 'attendance_events', label: 'الحضور والانصراف' },
  { value: 'payroll_batches', label: 'دفعات الرواتب' },
  { value: 'pay_overrides', label: 'الاستثناءات المالية' },
  { value: 'operational_flags', label: 'البلاغات التشغيلية' },
  { value: 'temporary_assignments', label: 'الانتدابات المؤقتة' },
  { value: 'backup', label: 'النسخ الاحتياطي' },
];

export default function AuditLog() {
  const [activeTab, setActiveTab] = useState('logs');
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    action: '',
    tableName: '',
    userId: undefined as number | undefined,
  });
  const [page, setPage] = useState(0);
  const pageSize = 30;
  const [selectedLog, setSelectedLog] = useState<any>(null);

  // Queries
  const { data: auditData, isLoading, refetch } = trpc.audit.getLog.useQuery({
    ...filters,
    tableName: filters.tableName || undefined,
    action: filters.action || undefined,
    limit: pageSize,
    offset: page * pageSize,
  });

  const { data: stats } = trpc.audit.getStats.useQuery({
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  });

  const { data: auditUsers } = trpc.audit.getUsers.useQuery();

  const logs = auditData?.logs || [];
  const total = auditData?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const uniqueActions = useMemo(() => {
    if (!stats) return [];
    return stats.map(s => s.action);
  }, [stats]);

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleString('ar-SA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const handleFilter = () => {
    setPage(0);
    refetch();
  };

  const handleReset = () => {
    setFilters({ startDate: '', endDate: '', action: '', tableName: '', userId: undefined });
    setPage(0);
  };

  const formatValue = (key: string, value: any): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
    if (key === 'eventTime' || key === 'createdAt' || key === 'timestamp') {
      try { return formatDate(value); } catch { return String(value); }
    }
    if (key === 'status') {
      const statusLabels: Record<string, string> = { active: 'نشط', inactive: 'غير نشط', terminated: 'منتهي', transferred: 'منقول' };
      return statusLabels[value] || String(value);
    }
    if (key === 'eventType') {
      return value === 'check_in' ? 'حضور' : value === 'check_out' ? 'انصراف' : String(value);
    }
    if (key === 'role') return ROLE_LABELS[value] || String(value);
    if (key === 'overrideType') return OVERRIDE_TYPE_LABELS[value] || String(value);
    if (key === 'isActive') return value ? 'نعم' : 'لا';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const renderDetailValues = (label: string, values: any, otherValues?: any) => {
    if (!values || typeof values !== 'object') return null;
    const entries = Object.entries(values);
    if (entries.length === 0) return null;
    
    return (
      <div className="space-y-2">
        <h4 className="font-semibold text-sm">{label}</h4>
        <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
          {entries.map(([key, val]) => {
            const otherVal = otherValues?.[key];
            const hasChanged = otherValues && otherVal !== undefined && otherVal !== val;
            return (
              <div key={key} className="flex justify-between text-sm gap-4 items-center">
                <span className="text-muted-foreground whitespace-nowrap">{FIELD_LABELS[key] || key}</span>
                <div className="flex items-center gap-2">
                  <span className={`font-medium text-xs ${hasChanged ? 'line-through text-red-400' : ''}`}>
                    {formatValue(key, val)}
                  </span>
                  {hasChanged && (
                    <>
                      <ArrowLeftRight className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium text-xs text-green-600">{formatValue(key, otherVal)}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // طباعة السجلات
  const handlePrint = () => {
    const printContent = document.getElementById('audit-log-table');
    if (!printContent) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html dir="rtl">
      <head>
        <title>سجل التدقيق</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, sans-serif; margin: 20px; direction: rtl; }
          h1 { text-align: center; font-size: 18px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
          th { background: #f5f5f5; font-weight: bold; }
          tr:nth-child(even) { background: #fafafa; }
          .desc { font-size: 11px; color: #333; }
          @media print { @page { margin: 10mm; } }
        </style>
      </head>
      <body>
        <h1>سجل التدقيق - نظام طولان</h1>
        <p style="text-align:center;font-size:12px;color:#666;">تاريخ الطباعة: ${new Date().toLocaleString('ar-SA')}</p>
        ${printContent.outerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSearch className="h-7 w-7 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold">سجل التدقيق</h1>
            <p className="text-sm text-muted-foreground">متابعة جميع العمليات والتغييرات في النظام</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint}>
          <Printer className="h-4 w-4" />
          طباعة
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="logs" className="gap-2">
            <FileSearch className="h-4 w-4" />
            السجلات
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            الإحصائيات
          </TabsTrigger>
        </TabsList>

        {/* ===== Logs Tab ===== */}
        <TabsContent value="logs" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" />
                تصفية السجلات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">من تاريخ</Label>
                  <Input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">إلى تاريخ</Label>
                  <Input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">القسم</Label>
                  <Select
                    value={filters.tableName || 'all'}
                    onValueChange={(value) => setFilters({ ...filters, tableName: value === 'all' ? '' : value })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="الكل" />
                    </SelectTrigger>
                    <SelectContent>
                      {TABLE_FILTER_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">نوع العملية</Label>
                  <Select
                    value={filters.action || 'all'}
                    onValueChange={(value) => setFilters({ ...filters, action: value === 'all' ? '' : value })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="الكل" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      {uniqueActions.map(action => (
                        <SelectItem key={action} value={action}>
                          {ACTION_LABELS[action] || action}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">المستخدم</Label>
                  <Select
                    value={filters.userId?.toString() || 'all'}
                    onValueChange={(value) => setFilters({ ...filters, userId: value === 'all' ? undefined : parseInt(value) })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="الكل" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع المستخدمين</SelectItem>
                      {auditUsers?.map((u) => (
                        <SelectItem key={u.id} value={u.id.toString()}>
                          {u.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button onClick={handleFilter} size="sm" className="gap-1">
                  <Filter className="h-3.5 w-3.5" />
                  تطبيق
                </Button>
                <Button onClick={handleReset} variant="outline" size="sm" className="gap-1">
                  <X className="h-3.5 w-3.5" />
                  إعادة تعيين
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results Count */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              إجمالي السجلات: <span className="font-bold text-foreground">{total}</span>
            </p>
            {totalPages > 1 && (
              <p className="text-sm text-muted-foreground">
                صفحة {page + 1} من {totalPages}
              </p>
            )}
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
              ) : logs.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table id="audit-log-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[160px]">التاريخ والوقت</TableHead>
                        <TableHead className="w-[120px]">المستخدم</TableHead>
                        <TableHead className="w-[130px]">العملية</TableHead>
                        <TableHead>الوصف</TableHead>
                        <TableHead className="w-[60px]">تفاصيل</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => {
                        const description = buildArabicDescription(log);
                        return (
                          <TableRow key={log.id} className="hover:bg-muted/50">
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="text-xs font-mono">{formatDate(log.createdAt)}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                <div className="min-w-0">
                                  <span className="text-sm block truncate">{log.userName || 'غير معروف'}</span>
                                  {log.userRole && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {ROLE_LABELS[log.userRole] || log.userRole}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-[11px] font-normal ${getActionColor(log.action)}`}>
                                {ACTION_LABELS[log.action] || log.action}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm text-foreground leading-relaxed">{description}</p>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => setSelectedLog(log)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  لا توجد سجلات تدقيق
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronRight className="h-4 w-4" />
                السابق
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i;
                  } else if (page < 3) {
                    pageNum = i;
                  } else if (page > totalPages - 4) {
                    pageNum = totalPages - 5 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={page === pageNum ? 'default' : 'outline'}
                      size="sm"
                      className="w-8 h-8 p-0"
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum + 1}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                التالي
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ===== Stats Tab ===== */}
        <TabsContent value="stats" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">تصفية الإحصائيات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">من تاريخ</Label>
                    <Input
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">إلى تاريخ</Label>
                    <Input
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                      className="h-9"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">ملخص</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-indigo-600">
                  {stats?.reduce((sum, s) => sum + s.count, 0) || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">إجمالي العمليات المسجلة</p>
              </CardContent>
            </Card>
          </div>

          {/* Stats Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                إحصائيات حسب نوع العملية
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats && stats.length > 0 ? (
                <div className="space-y-2">
                  {stats.map((stat) => {
                    const maxCount = Math.max(...stats.map(s => s.count));
                    const percentage = maxCount > 0 ? (stat.count / maxCount) * 100 : 0;
                    return (
                      <div key={stat.action} className="flex items-center gap-3">
                        <div className="w-[180px] flex-shrink-0">
                          <Badge className={`text-[11px] font-normal ${getActionColor(stat.action)}`}>
                            {ACTION_LABELS[stat.action] || stat.action}
                          </Badge>
                        </div>
                        <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold w-12 text-left">{stat.count}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  لا توجد إحصائيات
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              تفاصيل العملية
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              {/* الوصف العربي الواضح - بارز في الأعلى */}
              <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
                <p className="text-sm font-bold text-indigo-800 dark:text-indigo-300 leading-relaxed">
                  {buildArabicDescription(selectedLog)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">التاريخ:</span>
                  <p className="font-mono text-xs mt-0.5">{formatDate(selectedLog.createdAt)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">المستخدم:</span>
                  <p className="mt-0.5">{selectedLog.userName || 'غير معروف'}</p>
                  {selectedLog.userRole && (
                    <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[selectedLog.userRole] || selectedLog.userRole}</p>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">العملية:</span>
                  <div className="mt-0.5">
                    <Badge className={`text-[11px] ${getActionColor(selectedLog.action)}`}>
                      {ACTION_LABELS[selectedLog.action] || selectedLog.action}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">القسم:</span>
                  <p className="mt-0.5">{TABLE_LABELS[selectedLog.tableName || ''] || selectedLog.tableName || '-'}</p>
                </div>
                {selectedLog.recordId && (
                  <div>
                    <span className="text-muted-foreground">رقم السجل:</span>
                    <p className="font-mono mt-0.5">{selectedLog.recordId}</p>
                  </div>
                )}
                {selectedLog.ipAddress && (
                  <div>
                    <span className="text-muted-foreground">عنوان IP:</span>
                    <p className="font-mono text-xs mt-0.5">{selectedLog.ipAddress}</p>
                  </div>
                )}
              </div>
              
              {/* القيم القديمة مع إبراز التغييرات */}
              {selectedLog.oldValues && selectedLog.newValues ? (
                <>
                  {renderDetailValues('القيم القديمة', selectedLog.oldValues, selectedLog.newValues)}
                  {renderDetailValues('القيم الجديدة', selectedLog.newValues)}
                </>
              ) : (
                <>
                  {renderDetailValues('القيم القديمة', selectedLog.oldValues)}
                  {renderDetailValues('القيم الجديدة', selectedLog.newValues)}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
