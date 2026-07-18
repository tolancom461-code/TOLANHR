import { useState, useEffect, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  ArrowRightCircle, 
  ArrowLeftCircle,
  RefreshCw,
  Users,
  Calendar,
  Edit,
  Lock,
  AlertCircle,
  Download,
  Trash2,
  ChevronDown,
  Printer
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function AttendanceLog() {
  const { user } = useAuth();
  // المراجع والمدير المالي: استعراض فقط بدون تعديل
  const canEditAttendance = user?.role !== 'auditor' && user?.role !== 'finance_manager';
  // [] يعني "جميع المجموعات" — وإلا فهي قائمة معرّفات المجموعات المختارة
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [isGroupFilterOpen, setIsGroupFilterOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
  // ✅ وضع العرض: يوم واحد أو فترة (من-إلى)
  const [dateMode, setDateMode] = useState<'day' | 'range'>('day');
  const [rangeStart, setRangeStart] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [rangeEnd, setRangeEnd] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [expandedWorkerIds, setExpandedWorkerIds] = useState<Set<number>>(new Set());
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editingSessions, setEditingSessions] = useState<Array<{
    checkInId: number | null;
    checkOutId: number | null;
    checkInTime: string;
    checkOutTime: string;
  }>>([]);
  const [editNote, setEditNote] = useState('');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{eventId: number, eventType: 'checkIn' | 'checkOut'} | null>(null);
  const [isAbsentDialogOpen, setIsAbsentDialogOpen] = useState(false);
  const [isPrepareDialogOpen, setIsPrepareDialogOpen] = useState(false);
  const [selectedAbsentWorker, setSelectedAbsentWorker] = useState<any>(null);
  const [prepareCheckInTime, setPrepareCheckInTime] = useState('');
  const [prepareCheckOutTime, setPrepareCheckOutTime] = useState('');
  const [prepareNote, setPrepareNote] = useState('');
  const [absentFilterGroup, setAbsentFilterGroup] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  
  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedGroupIds, selectedDate]);

  useEffect(() => {
    setExpandedWorkerIds(new Set());
  }, [rangeStart, rangeEnd, selectedGroupIds, dateMode]);
  
  // Check if selected date is locked (✅ مرتبط بالمجموعات المختارة بالفلتر)
  const { data: dateLockStatus } = trpc.attendance.checkDateLocked.useQuery(
    {
      date: selectedDate,
      groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    },
    { enabled: !!selectedDate }
  );

  const { data: allGroups } = trpc.groups.list.useQuery();
  const utils = trpc.useUtils();
  
  const groups = allGroups;
  const { data: todayLogData, isLoading, refetch } = trpc.attendance.todayLogWithPagination.useQuery({
    groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    date: selectedDate,
    page: currentPage,
    limit: pageSize
  });
  
  const todayLog = todayLogData?.data || [];
  const totalPages = todayLogData?.totalPages || 1;
  const total = todayLogData?.total || 0;
  const { data: stats } = trpc.attendance.stats.useQuery({
    groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    date: selectedDate
  });

  // ✅ استعلام سجل الفترة (من-إلى) — يُفعّل فقط بوضع "فترة"
  const { data: periodLogData, isLoading: isPeriodLoading, refetch: refetchPeriod } = trpc.attendance.periodLog.useQuery(
    {
      startDate: rangeStart,
      endDate: rangeEnd,
      groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    },
    { enabled: dateMode === 'range' && !!rangeStart && !!rangeEnd }
  );
  const periodWorkers = periodLogData?.workers || [];

  // تقسيم ملخص الفترة إلى مجموعات — نفس منطق تقسيم السجل اليومي بالضبط
  const groupedPeriodLog = useMemo(() => {
    const byGroup = new Map<number | 'none', any[]>();
    for (const worker of periodWorkers) {
      const key = (worker.groupId ?? 'none') as number | 'none';
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(worker);
    }

    const ordered: Array<{ key: number | 'none'; name: string; workers: any[] }> = [];
    for (const g of groups || []) {
      if (byGroup.has(g.id)) {
        ordered.push({ key: g.id, name: g.name, workers: byGroup.get(g.id)! });
        byGroup.delete(g.id);
      }
    }
    if (byGroup.has('none')) {
      ordered.push({ key: 'none', name: 'بدون مجموعة', workers: byGroup.get('none')! });
    }
    return ordered;
  }, [periodWorkers, groups]);

  const toggleWorkerExpanded = (workerId: number) => {
    setExpandedWorkerIds((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) {
        next.delete(workerId);
      } else {
        next.add(workerId);
      }
      return next;
    });
  };

  const formatMinutesLabel = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h} س ${m} د`;
  };

  // تقسيم سجل اليوم إلى مجموعات — كل عامل تحت عنوان مجموعته
  const groupedLog = useMemo(() => {
    const byGroup = new Map<number | 'none', any[]>();
    for (const record of todayLog) {
      const key = (record.groupId ?? 'none') as number | 'none';
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(record);
    }

    const ordered: Array<{ key: number | 'none'; name: string; records: any[] }> = [];
    for (const g of groups || []) {
      if (byGroup.has(g.id)) {
        ordered.push({ key: g.id, name: g.name, records: byGroup.get(g.id)! });
        byGroup.delete(g.id);
      }
    }
    // أي عمال بدون مجموعة معروفة (احتياط)
    if (byGroup.has('none')) {
      ordered.push({ key: 'none', name: 'بدون مجموعة', records: byGroup.get('none')! });
    }
    return ordered;
  }, [todayLog, groups]);

  // Get absent workers
  const { data: absentWorkers, refetch: refetchAbsent } = trpc.attendance.getAbsentWorkers.useQuery({
    workDateStr: selectedDate,
    groupId: absentFilterGroup !== 'all' ? parseInt(absentFilterGroup) : undefined
  });

  // Mutations for manual attendance
  const addCheckInMutation = trpc.attendance.addMissingCheckIn.useMutation({
    onSuccess: () => {
      toast.success('تم إضافة الحضور بنجاح');
      refetchAbsent();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل إضافة الحضور');
    }
  });

  const addCheckOutMutation = trpc.attendance.addMissingCheckOut.useMutation({
    onSuccess: () => {
      toast.success('تم إضافة الانصراف بنجاح');
      setIsPrepareDialogOpen(false);
      setIsAbsentDialogOpen(false);
      refetchAbsent();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل إضافة الانصراف');
    }
  });

  const exportMutation = trpc.attendance.exportToExcel.useMutation({
    onSuccess: (result) => {
      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('تم تصدير سجل الحضور بنجاح');
    },
    onError: (error) => {
      toast.error(error.message || 'فشل تصدير سجل الحضور');
    }
  });

  const exportPeriodMutation = trpc.attendance.exportPeriodToExcel.useMutation({
    onSuccess: (result) => {
      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('تم تصدير سجل الفترة بنجاح');
    },
    onError: (error) => {
      toast.error(error.message || 'فشل تصدير سجل الفترة');
    }
  });

  // طباعة كل البيانات المطابقة للفلتر (مو بس الصفحة الظاهرة حاليًا)، منسّقة ومجمّعة حسب المجموعة
  const handlePrint = async () => {
    try {
      const result = await utils.attendance.todayLogWithPagination.fetch({
        groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
        date: selectedDate,
        page: 1,
        limit: 100000,
      });
      const fullLog = result?.data || [];
      if (fullLog.length === 0) {
        toast.error('لا يوجد بيانات لطباعتها');
        return;
      }

      // تجميع حسب المجموعة بنفس ترتيب المجموعات المعروض على الشاشة
      const byGroup = new Map<number | 'none', any[]>();
      for (const record of fullLog) {
        const key = (record.groupId ?? 'none') as number | 'none';
        if (!byGroup.has(key)) byGroup.set(key, []);
        byGroup.get(key)!.push(record);
      }
      const orderedGroups: Array<{ name: string; records: any[] }> = [];
      for (const g of groups || []) {
        if (byGroup.has(g.id)) {
          orderedGroups.push({ name: g.name, records: byGroup.get(g.id)! });
          byGroup.delete(g.id);
        }
      }
      if (byGroup.has('none')) {
        orderedGroups.push({ name: 'بدون مجموعة', records: byGroup.get('none')! });
      }

      const fmtTime = (d: string | Date | null | undefined) => {
        if (!d) return '-';
        return new Date(d).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: true });
      };
      const fmtHours = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h} س ${m} د`;
      };

      let bodyHtml = '';
      let groupToggle = false;
      for (const group of orderedGroups) {
        groupToggle = !groupToggle;
        const groupClass = groupToggle ? 'group-a' : 'group-b';
        bodyHtml += `<tr class="group-row ${groupClass}"><td colspan="7">${group.name} <span class="count">(${group.records.length} عامل)</span></td></tr>`;
        let rowCounter = 0;
        for (const record of group.records) {
          const sessions = record.sessions && record.sessions.length > 0
            ? record.sessions
            : [{
                checkIn: record.checkInTime ? { eventTime: record.checkInTime, method: record.checkInMethod } : null,
                checkOut: record.checkOutTime ? { eventTime: record.checkOutTime, method: record.checkOutMethod } : null,
              }];
          for (const session of sessions) {
            const checkInDate = session.checkIn?.eventTime ? new Date(session.checkIn.eventTime) : null;
            const checkOutDate = session.checkOut?.eventTime ? new Date(session.checkOut.eventTime) : null;
            const workMinutes = checkInDate && checkOutDate
              ? Math.round((checkOutDate.getTime() - checkInDate.getTime()) / 60000)
              : null;
            rowCounter++;
            const altClass = rowCounter % 2 === 0 ? 'alt-row' : '';
            bodyHtml += `<tr class="${altClass}">
              <td>${record.workerCode || '-'}</td>
              <td class="name-cell">${record.workerName}</td>
              <td>${fmtTime(session.checkIn?.eventTime)}</td>
              <td>${session.checkIn?.method || '-'}</td>
              <td>${fmtTime(session.checkOut?.eventTime)}</td>
              <td>${session.checkOut?.method || '-'}</td>
              <td class="hours-cell">${workMinutes !== null ? fmtHours(workMinutes) : '-'}</td>
            </tr>`;
          }
        }
      }

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error('تعذر فتح نافذة الطباعة (تحقق من حاجب النوافذ المنبثقة)');
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8" />
          <title>سجل الحضور اليومي - ${selectedDate}</title>
          <style>
            :root {
              --title-bg: #e8f0fe;
              --title-text: #1e3a5f;
              --subtitle-text: #64748b;
              --header-bg: #d9e2f3;
              --header-text: #1e3a5f;
              --group-a-bg: #eff6ff;
              --group-a-text: #2c5282;
              --group-b-bg: #f0fbf7;
              --group-b-text: #2f855a;
              --row-alt-bg: #f8fafc;
              --border-color: #e2e8f0;
            }
            * { box-sizing: border-box; }
            body {
              font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
              margin: 24px;
              color: #1e293b;
              background: #fff;
            }
            .report-header {
              background: var(--title-bg);
              border-radius: 10px;
              padding: 16px 20px;
              margin-bottom: 18px;
              text-align: center;
            }
            .report-header h1 {
              margin: 0 0 6px 0;
              font-size: 21px;
              color: var(--title-text);
              font-weight: 700;
            }
            .subtitle {
              font-size: 13px;
              color: var(--subtitle-text);
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12.5px;
              border: 1px solid var(--border-color);
              border-radius: 8px;
              overflow: hidden;
            }
            th, td {
              border: 1px solid var(--border-color);
              padding: 8px 10px;
              text-align: center;
            }
            th {
              background: var(--header-bg);
              color: var(--header-text);
              font-weight: 700;
              font-size: 12.5px;
            }
            td.name-cell { font-weight: 600; text-align: right; }
            td.hours-cell { color: #334155; font-weight: 600; }
            tr.alt-row td { background: var(--row-alt-bg); }
            tr.group-row td {
              font-weight: 700;
              text-align: right;
              padding: 7px 10px;
            }
            tr.group-row.group-a td { background: var(--group-a-bg); color: var(--group-a-text); }
            tr.group-row.group-b td { background: var(--group-b-bg); color: var(--group-b-text); }
            tr.group-row .count { font-weight: 400; font-size: 11px; opacity: 0.75; }
            @media print {
              body { margin: 10mm; }
              @page { margin: 12mm; }
              tr.group-row { break-inside: avoid; break-after: avoid; }
              tr { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="report-header">
            <h1>سجل الحضور اليومي</h1>
            <div class="subtitle">
              التاريخ: ${new Date(selectedDate).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
              ${selectedGroupIds.length > 0 ? ` — المجموعات: ${orderedGroups.map(g => g.name).join('، ')}` : ' — جميع المجموعات'}
              — إجمالي السجلات: ${fullLog.length}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>الرمز</th>
                <th>اسم العامل</th>
                <th>وقت الحضور</th>
                <th>طريقة الحضور</th>
                <th>وقت الانصراف</th>
                <th>طريقة الانصراف</th>
                <th>ساعات العمل</th>
              </tr>
            </thead>
            <tbody>
              ${bodyHtml}
            </tbody>
          </table>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      };
    } catch (err: any) {
      toast.error(err?.message || 'فشل تجهيز الطباعة');
    }
  };

  // طباعة سجل الفترة: اسم كل عامل ثم تفاصيل أيامه تحته مباشرة، مجمّعة حسب المجموعة
  const handlePrintPeriod = () => {
    if (!periodWorkers.length) {
      toast.error('لا يوجد بيانات لطباعتها');
      return;
    }

    let bodyHtml = '';
    let groupToggle = false;
    for (const group of groupedPeriodLog) {
      groupToggle = !groupToggle;
      const groupClass = groupToggle ? 'group-a' : 'group-b';
      bodyHtml += `<tr class="group-row ${groupClass}"><td colspan="7">${group.name} <span class="count">(${group.workers.length} عامل)</span></td></tr>`;

      for (const worker of group.workers) {
        bodyHtml += `<tr class="worker-row">
          <td colspan="5">${worker.workerName} (${worker.workerCode}) — ${worker.totalDays} يوم حضور</td>
          <td>${worker.totalMinutes}</td>
          <td>${formatMinutesLabel(worker.totalMinutes)}</td>
        </tr>`;

        let rowCounter = 0;
        for (const day of worker.days) {
          const sessions = day.sessions.length > 0 ? day.sessions : [{ checkIn: null, checkOut: null }];
          const dayLabel = new Date(day.workDate).toLocaleDateString('ar-SA', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
          for (const session of sessions) {
            rowCounter++;
            const altClass = rowCounter % 2 === 0 ? 'alt-row' : '';
            const checkInDate = session.checkIn?.eventTime ? new Date(session.checkIn.eventTime) : null;
            const checkOutDate = session.checkOut?.eventTime ? new Date(session.checkOut.eventTime) : null;
            // دقائق هذه الجلسة تحديدًا (مو إجمالي اليوم) — حتى ما تتكرر نفس القيمة لو فيه أكثر من جلسة بنفس اليوم
            const sessionMinutes = checkInDate && checkOutDate
              ? Math.round((checkOutDate.getTime() - checkInDate.getTime()) / 60000)
              : null;
            bodyHtml += `<tr class="${altClass}">
              <td class="date-cell">${dayLabel}</td>
              <td>${formatTime(session.checkIn?.eventTime)}</td>
              <td>${session.checkIn?.method || '-'}</td>
              <td>${formatTime(session.checkOut?.eventTime)}</td>
              <td>${session.checkOut?.method || '-'}</td>
              <td>${sessionMinutes !== null ? sessionMinutes : '-'}</td>
              <td class="hours-cell">${sessionMinutes !== null ? formatMinutesLabel(sessionMinutes) : '-'}</td>
            </tr>`;
          }
        }
      }
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('تعذر فتح نافذة الطباعة (تحقق من حاجب النوافذ المنبثقة)');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8" />
        <title>سجل حضور الفترة - ${rangeStart} إلى ${rangeEnd}</title>
        <style>
          :root {
            --title-bg: #e8f0fe;
            --title-text: #1e3a5f;
            --subtitle-text: #64748b;
            --header-bg: #d9e2f3;
            --header-text: #1e3a5f;
            --group-a-bg: #eff6ff;
            --group-a-text: #2c5282;
            --group-b-bg: #f0fbf7;
            --group-b-text: #2f855a;
            --worker-bg: #fdf6e3;
            --worker-text: #8a6d00;
            --row-alt-bg: #f8fafc;
            --border-color: #e2e8f0;
          }
          * { box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
            margin: 24px;
            color: #1e293b;
            background: #fff;
          }
          .report-header {
            background: var(--title-bg);
            border-radius: 10px;
            padding: 16px 20px;
            margin-bottom: 18px;
            text-align: center;
          }
          .report-header h1 {
            margin: 0 0 6px 0;
            font-size: 21px;
            color: var(--title-text);
            font-weight: 700;
          }
          .subtitle { font-size: 13px; color: var(--subtitle-text); }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12.5px;
            border: 1px solid var(--border-color);
          }
          th, td { border: 1px solid var(--border-color); padding: 7px 9px; text-align: center; }
          th { background: var(--header-bg); color: var(--header-text); font-weight: 700; }
          td.date-cell { font-weight: 500; }
          td.hours-cell { font-weight: 600; color: #334155; }
          tr.alt-row td { background: var(--row-alt-bg); }
          tr.group-row td { font-weight: 700; text-align: right; padding: 7px 10px; }
          tr.group-row.group-a td { background: var(--group-a-bg); color: var(--group-a-text); }
          tr.group-row.group-b td { background: var(--group-b-bg); color: var(--group-b-text); }
          tr.group-row .count { font-weight: 400; font-size: 11px; opacity: 0.75; }
          tr.worker-row td { background: var(--worker-bg); color: var(--worker-text); font-weight: 700; text-align: right; }
          @media print {
            body { margin: 10mm; }
            @page { margin: 12mm; }
            tr.group-row, tr.worker-row { break-inside: avoid; break-after: avoid; }
            tr { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="report-header">
          <h1>سجل حضور الفترة</h1>
          <div class="subtitle">
            من ${new Date(rangeStart).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
            إلى ${new Date(rangeEnd).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
            ${selectedGroupIds.length > 0 ? ` — المجموعات: ${groupedPeriodLog.map(g => g.name).join('، ')}` : ' — جميع المجموعات'}
            — عدد العمال: ${periodWorkers.length}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>التاريخ / العامل</th>
              <th>وقت الحضور</th>
              <th>طريقة الحضور</th>
              <th>وقت الانصراف</th>
              <th>طريقة الانصراف</th>
              <th>دقائق العمل</th>
              <th>ساعات العمل</th>
            </tr>
          </thead>
          <tbody>
            ${bodyHtml}
          </tbody>
        </table>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    };
  };

  const updateEventMutation = trpc.attendance.updateEvent.useMutation({
    onSuccess: () => {
      toast.success('تم تعديل سجل الحضور بنجاح');
      setIsEditDialogOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل تعديل سجل الحضور');
    }
  });

  const deletePunchMutation = trpc.attendance.deletePunchEvent.useMutation({
    onSuccess: () => {
      toast.success('تم حذف سجل الحضور بنجاح');
      setIsDeleteConfirmOpen(false);
      setIsEditDialogOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل حذف سجل الحضور');
    }
  });

  const handleEditClick = (record: any) => {
    setEditingRecord(record);

    const sessions = record.sessions && record.sessions.length > 0
      ? record.sessions
      : [{
          checkIn: record.checkInTime ? { id: record.checkInId, eventTime: record.checkInTime } : null,
          checkOut: record.checkOutTime ? { id: record.checkOutId, eventTime: record.checkOutTime } : null
        }];

    const builtSessions = sessions.map((s: any) => {
      const formatT = (t: any) => {
        if (!t) return '';
        const d = new Date(t);
        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      };
      return {
        checkInId: s.checkIn?.id || null,
        checkOutId: s.checkOut?.id || null,
        checkInTime: formatT(s.checkIn?.eventTime),
        checkOutTime: formatT(s.checkOut?.eventTime),
      };
    });

    setEditingSessions(builtSessions);
    setEditNote('');
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = (eventId: number, eventType: 'checkIn' | 'checkOut') => {
    setDeleteTarget({ eventId, eventType });
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deletePunchMutation.mutate({
      eventId: deleteTarget.eventId,
      reason: editNote || 'حذف سجل حضور تم بالخطأ'
    });
  };

  // ✅ يعدل كل الجلسات
  const handleSaveEdit = () => {
    if (!editingRecord || editingSessions.length === 0) return;

    const baseDate = new Date(selectedDate);
    baseDate.setHours(0, 0, 0, 0);

    for (const session of editingSessions) {
      if (session.checkInTime && session.checkInId) {
        const [h, m] = session.checkInTime.split(':');
        const newTime = new Date(baseDate);
        newTime.setHours(parseInt(h), parseInt(m), 0, 0);
        updateEventMutation.mutate({
          eventId: session.checkInId,
          newTime: newTime.toISOString(),
          internalNote: editNote
        });
      }

      if (session.checkOutTime && session.checkOutId) {
        const [h, m] = session.checkOutTime.split(':');
        const newTime = new Date(baseDate);
        newTime.setHours(parseInt(h), parseInt(m), 0, 0);

        if (session.checkInTime) {
          const [ih, im] = session.checkInTime.split(':');
          const inRef = new Date(baseDate);
          inRef.setHours(parseInt(ih), parseInt(im), 0, 0);
          if (newTime <= inRef) newTime.setDate(newTime.getDate() + 1);
        }

        updateEventMutation.mutate({
          eventId: session.checkOutId,
          newTime: newTime.toISOString(),
          internalNote: editNote
        });
      }
    }
  };

  const handlePrepareWorker = (worker: any) => {
    setSelectedAbsentWorker(worker);
    setPrepareCheckInTime('');
    setPrepareCheckOutTime('');
    setPrepareNote('');
    setIsPrepareDialogOpen(true);
  };

  const handleSavePrepare = async () => {
    if (!selectedAbsentWorker || !prepareCheckInTime || !prepareCheckOutTime) {
      toast.error('يجب إدخال وقت الحضور والانصراف');
      return;
    }

    try {
      const baseDate = new Date(selectedDate);
      baseDate.setHours(0, 0, 0, 0);

      const [checkInHours, checkInMinutes] = prepareCheckInTime.split(':');
      const checkInTime = new Date(baseDate);
      checkInTime.setHours(parseInt(checkInHours), parseInt(checkInMinutes), 0, 0);
      await addCheckInMutation.mutateAsync({
        workerId: selectedAbsentWorker.workerId,
        checkInTime: checkInTime.toISOString(),
        note: prepareNote || 'تحضير يدوي'
      });

      const [checkOutHours, checkOutMinutes] = prepareCheckOutTime.split(':');
      const checkOutTime = new Date(baseDate);
      checkOutTime.setHours(parseInt(checkOutHours), parseInt(checkOutMinutes), 0, 0);
      
      if (checkOutTime <= checkInTime) {
        checkOutTime.setDate(checkOutTime.getDate() + 1);
      }
      await addCheckOutMutation.mutateAsync({
        workerId: selectedAbsentWorker.workerId,
        checkOutTime: checkOutTime.toISOString(),
        note: prepareNote || 'تحضير يدوي'
      });

      toast.success('تم إضافة الحضور والانصراف بنجاح');
      setIsPrepareDialogOpen(false);
      setIsAbsentDialogOpen(false);
    } catch (error: any) {
      console.error('Error in handleSavePrepare:', error);
      toast.error(error.message || 'فشل إضافة الحضور');
    }
  };

  const formatTime = (date: Date | string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMethodBadge = (method: string | null) => {
    if (!method) return null;
    switch (method) {
      case 'qr':
        return <Badge variant="outline">QR</Badge>;
      case 'manual':
        return <Badge variant="secondary">يدوي</Badge>;
      case 'biometric':
        return <Badge variant="default">بصمة</Badge>;
      default:
        return <Badge variant="outline">{method}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            سجل الحضور اليومي
          </h1>
          <p className="text-muted-foreground">
            {dateMode === 'day' ? (
              new Date(selectedDate).toLocaleDateString('ar-SA', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })
            ) : (
              <>
                من {new Date(rangeStart).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
                {' '}إلى{' '}
                {new Date(rangeEnd).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* ✅ التبديل بين عرض يوم واحد أو فترة (من-إلى) */}
          <div className="flex items-center rounded-lg border p-0.5 bg-muted/40">
            <Button
              type="button"
              size="sm"
              variant={dateMode === 'day' ? 'default' : 'ghost'}
              className="h-8 px-3"
              onClick={() => setDateMode('day')}
            >
              يوم واحد
            </Button>
            <Button
              type="button"
              size="sm"
              variant={dateMode === 'range' ? 'default' : 'ghost'}
              className="h-8 px-3"
              onClick={() => setDateMode('range')}
            >
              فترة (من-إلى)
            </Button>
          </div>

          {dateMode === 'day' ? (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-48"
              />
              {dateLockStatus?.isLocked && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  مغلق
                </Badge>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="w-40"
              />
              <span className="text-muted-foreground text-sm">إلى</span>
              <Input
                type="date"
                value={rangeEnd}
                min={rangeStart}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="w-40"
              />
            </div>
          )}
          <Popover open={isGroupFilterOpen} onOpenChange={setIsGroupFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-56 justify-between font-normal">
                <span className="truncate">
                  {selectedGroupIds.length === 0
                    ? 'جميع المجموعات'
                    : selectedGroupIds.length === 1
                    ? groups?.find((g) => g.id === selectedGroupIds[0])?.name || 'مجموعة واحدة'
                    : `${selectedGroupIds.length} مجموعات محددة`}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer" onClick={() => setSelectedGroupIds([])}>
                <Checkbox checked={selectedGroupIds.length === 0} />
                <span className="text-sm font-medium">جميع المجموعات</span>
              </div>
              <div className="h-px bg-border my-1" />
              <div className="max-h-64 overflow-y-auto space-y-0.5">
                {groups?.map((group) => {
                  const checked = selectedGroupIds.includes(group.id);
                  return (
                    <div
                      key={group.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
                      onClick={() =>
                        setSelectedGroupIds((prev) =>
                          checked ? prev.filter((id) => id !== group.id) : [...prev, group.id]
                        )
                      }
                    >
                      <Checkbox checked={checked} />
                      <span className="text-sm">{group.name}</span>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" onClick={() => (dateMode === 'day' ? refetch() : refetchPeriod())}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {dateMode === 'day' ? (
            <>
              <Button 
                variant="default" 
                onClick={() => exportMutation.mutate({ 
                  date: selectedDate, 
                  groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined
                })}
                disabled={exportMutation.isPending || !todayLog?.length}
              >
                <Download className="h-4 w-4 ml-2" />
                تصدير Excel
              </Button>
              <Button
                variant="outline"
                onClick={handlePrint}
                disabled={!todayLog?.length}
              >
                <Printer className="h-4 w-4 ml-2" />
                طباعة
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="default"
                onClick={() => exportPeriodMutation.mutate({
                  startDate: rangeStart,
                  endDate: rangeEnd,
                  groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined
                })}
                disabled={exportPeriodMutation.isPending || !periodWorkers.length}
              >
                <Download className="h-4 w-4 ml-2" />
                تصدير Excel
              </Button>
              <Button
                variant="outline"
                onClick={handlePrintPeriod}
                disabled={!periodWorkers.length}
              >
                <Printer className="h-4 w-4 ml-2" />
                طباعة
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Info Banner */}
      {dateLockStatus?.isLocked ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <Lock className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">التاريخ مغلق للتعديل</p>
            <p className="text-sm text-red-700 mt-1">
              لا يمكن تعديل سجلات الحضور لهذا التاريخ لأنه يتضمن دفعة راتب معتمدة ({dateLockStatus.batch?.batchCode}). 
              يجب حذف المسودة أولاً للتمكن من التعديل.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Calendar className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">ملاحظة هامة</p>
            <p className="text-sm text-blue-700 mt-1">
              يمكنك تعديل سجلات الحضور لأي يوم طالما لم يتم إنشاء دفعة راتب له. إذا كان هناك دفعة راتب معتمدة، يجب حذف المسودة أولاً.
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalWorkers || 0}</p>
                <p className="text-sm text-muted-foreground">إجمالي العمال</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <ArrowRightCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.presentToday || 0}</p>
                <p className="text-sm text-muted-foreground">حاضرون</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => {
            setAbsentFilterGroup(selectedGroupIds.length === 1 ? selectedGroupIds[0].toString() : 'all');
            setIsAbsentDialogOpen(true);
          }}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                <ArrowLeftCircle className="h-5 w-5 text-red-600" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold">{stats?.absentToday || 0}</p>
                <p className="text-sm text-muted-foreground">غائبون</p>
              </div>
              <ArrowLeftCircle className="h-5 w-5 text-red-600 transform rotate-180" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{todayLog?.length || 0}</p>
                <p className="text-sm text-muted-foreground">عدد العمال</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attendance Table */}
      {dateMode === 'day' && (
      <Card id="attendance-log-print-area">
        <CardHeader>
          <CardTitle>سجل اليوم</CardTitle>
          <CardDescription>جميع تسجيلات الحضور والانصراف لهذا اليوم</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">جاري التحميل...</p>
            </div>
          ) : !todayLog?.length ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
              <p className="mt-2 text-muted-foreground">لا توجد تسجيلات اليوم</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">اسم العامل</TableHead>
                    <TableHead className="text-right">الرمز</TableHead>
                    <TableHead className="text-right">وقت الحضور</TableHead>
                    <TableHead className="text-right">طريقة الحضور</TableHead>
                    <TableHead className="text-right">وقت الانصراف</TableHead>
                    <TableHead className="text-right">طريقة الانصراف</TableHead>
                    <TableHead className="text-right">دقائق العمل</TableHead>
                    <TableHead className="text-right">ساعات العمل</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedLog.map((groupEntry) => (
                    <>
                      <TableRow key={`group-header-${groupEntry.key}`} className="bg-muted/50 hover:bg-muted/50">
                        <TableCell colSpan={9} className="font-semibold text-sm py-2">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            {groupEntry.name}
                            <Badge variant="secondary" className="font-normal">
                              {groupEntry.records.length} عامل
                            </Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                      {groupEntry.records.map((record: any) => {
                    // ✅ عرض كل الجلسات — لو عنده جلسات متعددة نعرضها كلها
                    const sessions = record.sessions && record.sessions.length > 0
                      ? record.sessions
                      : [{
                          checkIn: record.checkInTime ? {
                            id: record.checkInId,
                            eventTime: record.checkInTime,
                            method: record.checkInMethod
                          } : null,
                          checkOut: record.checkOutTime ? {
                            id: record.checkOutId,
                            eventTime: record.checkOutTime,
                            method: record.checkOutMethod
                          } : null
                        }];

                    return sessions.map((session: any, sessionIndex: number) => (
                      <TableRow
                        key={`${record.workerId}-${sessionIndex}`}
                        className={sessionIndex > 0 ? "bg-blue-50/30" : ""}
                      >
                        <TableCell className="font-medium">
                          {sessionIndex === 0 ? record.workerName : (
                            <span className="text-muted-foreground text-sm pr-4">
                              ↳ جلسة {sessionIndex + 1}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {sessionIndex === 0 ? record.workerCode : ""}
                        </TableCell>
                        <TableCell className="font-mono">
                          {session.checkIn?.eventTime ? (
                            <div className="flex items-center gap-2">
                              <ArrowRightCircle className="h-4 w-4 text-green-600" />
                              {formatTime(session.checkIn.eventTime)}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {getMethodBadge(session.checkIn?.method)}
                        </TableCell>
                        <TableCell className="font-mono">
                          {session.checkOut?.eventTime ? (
                            <div className="flex items-center gap-2">
                              <ArrowLeftCircle className="h-4 w-4 text-orange-600" />
                              {formatTime(session.checkOut.eventTime)}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {getMethodBadge(session.checkOut?.method)}
                        </TableCell>
                        <TableCell className="font-mono font-semibold">
                          {session.checkIn?.eventTime && session.checkOut?.eventTime ? (
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-blue-600" />
                              {(() => {
                                let mins = Math.round((new Date(session.checkOut.eventTime).getTime() - new Date(session.checkIn.eventTime).getTime()) / 60000);
                                if (mins < 0) mins += 1440;
                                return mins;
                              })()} دقيقة
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono font-semibold">
                          {session.checkIn?.eventTime && session.checkOut?.eventTime ? (
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-blue-600" />
                              {(() => {
                                let mins = Math.round((new Date(session.checkOut.eventTime).getTime() - new Date(session.checkIn.eventTime).getTime()) / 60000);
                                if (mins < 0) mins += 1440;
                                return (mins / 60).toLocaleString("ar-SA", { maximumFractionDigits: 2 });
                              })()} ساعة
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {canEditAttendance && sessionIndex === 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditClick(record)}
                              disabled={dateLockStatus?.isLocked}
                              title={dateLockStatus?.isLocked ? `التاريخ مغلق - دفعة ${dateLockStatus.batch?.batchCode}` : 'تعديل سجل الحضور'}
                            >
                              {dateLockStatus?.isLocked ? (
                                <Lock className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Edit className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ));
                      })}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t">
            <div className="text-sm text-muted-foreground">
              عرض {todayLog.length} سجل بالصفحة {currentPage} من {totalPages} (الإجمالي {total} سجل)
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                السابق
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                التالي
              </Button>
            </div>
          </div>
        )}
      </Card>
      )}

      {/* ✅ عرض الفترة (من-إلى): ملخص لكل عامل مع إمكانية التوسيع لتفاصيل كل يوم */}
      {dateMode === 'range' && (
      <Card>
        <CardHeader>
          <CardTitle>سجل الفترة</CardTitle>
          <CardDescription>
            ملخص حضور كل عامل خلال الفترة المحددة — اضغط على اسم العامل لعرض تفاصيل كل يوم
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPeriodLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">جاري التحميل...</p>
            </div>
          ) : !periodWorkers.length ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
              <p className="mt-2 text-muted-foreground">لا توجد تسجيلات خلال هذه الفترة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">اسم العامل</TableHead>
                    <TableHead className="text-right">الرمز</TableHead>
                    <TableHead className="text-right">أيام الحضور</TableHead>
                    <TableHead className="text-right">إجمالي ساعات العمل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedPeriodLog.map((groupEntry) => (
                    <>
                      <TableRow key={`period-group-header-${groupEntry.key}`} className="bg-muted/50 hover:bg-muted/50">
                        <TableCell colSpan={4} className="font-semibold text-sm py-2">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            {groupEntry.name}
                            <Badge variant="secondary" className="font-normal">
                              {groupEntry.workers.length} عامل
                            </Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                      {groupEntry.workers.map((worker: any) => {
                        const isExpanded = expandedWorkerIds.has(worker.workerId);
                        return (
                          <>
                            <TableRow
                              key={`period-worker-${worker.workerId}`}
                              className="cursor-pointer hover:bg-muted/30"
                              onClick={() => toggleWorkerExpanded(worker.workerId)}
                            >
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-1.5">
                                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                  {worker.workerName}
                                </div>
                              </TableCell>
                              <TableCell>{worker.workerCode}</TableCell>
                              <TableCell>{worker.totalDays} يوم</TableCell>
                              <TableCell>{formatMinutesLabel(worker.totalMinutes)}</TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow key={`period-worker-detail-${worker.workerId}`}>
                                <TableCell colSpan={4} className="bg-muted/20 p-0">
                                  <div className="p-4">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="text-right">التاريخ</TableHead>
                                          <TableHead className="text-right">وقت الحضور</TableHead>
                                          <TableHead className="text-right">طريقة الحضور</TableHead>
                                          <TableHead className="text-right">وقت الانصراف</TableHead>
                                          <TableHead className="text-right">طريقة الانصراف</TableHead>
                                          <TableHead className="text-right">دقائق العمل</TableHead>
                                          <TableHead className="text-right">ساعات العمل</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {worker.days.map((day: any) =>
                                          (day.sessions.length > 0 ? day.sessions : [{ checkIn: null, checkOut: null }]).map(
                                            (session: any, sessionIndex: number) => (
                                              <TableRow key={`${day.workDate}-${sessionIndex}`}>
                                                {sessionIndex === 0 && (
                                                  <TableCell rowSpan={day.sessions.length || 1} className="align-top font-medium">
                                                    {new Date(day.workDate).toLocaleDateString('ar-SA', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                                  </TableCell>
                                                )}
                                                <TableCell>{formatTime(session.checkIn?.eventTime)}</TableCell>
                                                <TableCell>{getMethodBadge(session.checkIn?.method)}</TableCell>
                                                <TableCell>{formatTime(session.checkOut?.eventTime)}</TableCell>
                                                <TableCell>{getMethodBadge(session.checkOut?.method)}</TableCell>
                                                {sessionIndex === 0 && (
                                                  <>
                                                    <TableCell rowSpan={day.sessions.length || 1} className="align-top">
                                                      {day.dayMinutes}
                                                    </TableCell>
                                                    <TableCell rowSpan={day.sessions.length || 1} className="align-top">
                                                      {formatMinutesLabel(day.dayMinutes)}
                                                    </TableCell>
                                                  </>
                                                )}
                                              </TableRow>
                                            )
                                          )
                                        )}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        );
                      })}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* ✅ Edit Dialog — يعرض كل الجلسات */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تعديل سجل الحضور</DialogTitle>
            <DialogDescription>
              تعديل أوقات الحضور والانصراف للعامل: {editingRecord?.workerName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            {editingSessions.map((session, idx) => (
              <div key={idx} className={`border rounded-lg p-4 ${idx > 0 ? 'border-blue-200 bg-blue-50/30' : ''}`}>
                <p className="font-medium mb-3 text-sm text-muted-foreground">
                  {idx === 0 ? 'الجلسة الأولى' : `↳ جلسة ${idx + 1}`}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>وقت الحضور</Label>
                    <Input
                      type="time"
                      value={session.checkInTime}
                      onChange={(e) => {
                        const updated = [...editingSessions];
                        updated[idx] = { ...updated[idx], checkInTime: e.target.value };
                        setEditingSessions(updated);
                      }}
                      disabled={!session.checkInId}
                    />
                    {!session.checkInId && <p className="text-xs text-muted-foreground">لا يوجد حضور</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>وقت الانصراف</Label>
                    <Input
                      type="time"
                      value={session.checkOutTime}
                      onChange={(e) => {
                        const updated = [...editingSessions];
                        updated[idx] = { ...updated[idx], checkOutTime: e.target.value };
                        setEditingSessions(updated);
                      }}
                      disabled={!session.checkOutId}
                    />
                    {!session.checkOutId && <p className="text-xs text-muted-foreground">لا يوجد انصراف</p>}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  {session.checkInId && (
                    <Button variant="destructive" size="sm"
                      onClick={() => handleDeleteClick(session.checkInId!, 'checkIn')}
                      disabled={deletePunchMutation.isPending}>
                      <Trash2 className="h-3 w-3 mr-1" />حذف الحضور
                    </Button>
                  )}
                  {session.checkOutId && (
                    <Button variant="destructive" size="sm"
                      onClick={() => handleDeleteClick(session.checkOutId!, 'checkOut')}
                      disabled={deletePunchMutation.isPending}>
                      <Trash2 className="h-3 w-3 mr-1" />حذف الانصراف
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <div className="space-y-2">
              <Label>ملاحظة (اختياري)</Label>
              <Input value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="سبب التعديل..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveEdit} disabled={updateEventMutation.isPending}>
              {updateEventMutation.isPending ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Absent Workers Dialog *//* Absent Workers Dialog */}
      <Dialog open={isAbsentDialogOpen} onOpenChange={setIsAbsentDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>العمال الغائبون</DialogTitle>
            <DialogDescription>
              قائمة العمال الغائبين ليوم {new Date(selectedDate).toLocaleDateString('ar-SA')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="mb-4">
              <Label>فلترة حسب المجموعة</Label>
              <Select value={absentFilterGroup} onValueChange={setAbsentFilterGroup}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر المجموعة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المجموعات</SelectItem>
                  {groups?.map((group: any) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!absentWorkers || absentWorkers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>لا يوجد عمال غائبون لهذا اليوم</p>
              </div>
            ) : (
              <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-red-50">
                      <TableHead className="text-right">كود العامل</TableHead>
                      <TableHead className="text-right">اسم العامل</TableHead>
                      <TableHead className="text-right">المجموعة</TableHead>
                      <TableHead className="text-right">الإجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {absentWorkers.map((worker: any) => (
                      <TableRow key={worker.workerId} className="bg-red-50/50">
                        <TableCell className="font-mono">{worker.workerCode}</TableCell>
                        <TableCell className="font-medium">{worker.workerName}</TableCell>
                        <TableCell>{worker.groupName || '-'}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handlePrepareWorker(worker)}
                          >
                            تحضير
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAbsentDialogOpen(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prepare Worker Dialog */}
      <Dialog open={isPrepareDialogOpen} onOpenChange={setIsPrepareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تحضير يدوي</DialogTitle>
            <DialogDescription>
              إضافة حضور وانصراف يدوي للعامل: {selectedAbsentWorker?.workerName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="prepareCheckInTime">وقت الحضور *</Label>
              <Input
                id="prepareCheckInTime"
                type="time"
                value={prepareCheckInTime}
                onChange={(e) => setPrepareCheckInTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prepareCheckOutTime">وقت الانصراف *</Label>
              <Input
                id="prepareCheckOutTime"
                type="time"
                value={prepareCheckOutTime}
                onChange={(e) => setPrepareCheckOutTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prepareNote">ملاحظة (اختياري)</Label>
              <Input
                id="prepareNote"
                value={prepareNote}
                onChange={(e) => setPrepareNote(e.target.value)}
                placeholder="سبب التحضير اليدوي..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPrepareDialogOpen(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleSavePrepare} 
              disabled={addCheckInMutation.isPending || addCheckOutMutation.isPending}
            >
              {(addCheckInMutation.isPending || addCheckOutMutation.isPending) ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              تأكيد الحذف
            </DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف سجل {deleteTarget?.eventType === 'checkIn' ? 'الحضور' : 'الانصراف'} للعامل <strong>{editingRecord?.workerName}</strong>؟
              <br /><br />
              <span className="text-destructive font-semibold">لن يمكن التراجع عن هذا الإجراء!</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
              إلغاء
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmDelete}
              disabled={deletePunchMutation.isPending}
            >
              {deletePunchMutation.isPending ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
