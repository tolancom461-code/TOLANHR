import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from '@/lib/trpc';
import { numberToArabicWords } from '@/lib/numberToArabicWords';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/payroll/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Edit, Loader2, ArrowLeft, Users, Download, Calendar, CheckCircle, Clock, XCircle, Printer, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";

export default function PayrollBatchDetails() {
  const [, params] = useRoute("/payroll/batches/:id");
  const [, setLocation] = useLocation();
  const batchId = Number(params?.id);

  const [editingItem, setEditingItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    baseAmount: "",
    totalDeductions: "",
    totalBonuses: "",
    notes: "",
  });

  // Daily Details Dialog State
  const [dailyDetailsOpen, setDailyDetailsOpen] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [overrideForm, setOverrideForm] = useState<{
    [key: string]: { enabled: boolean; reason: string };
  }>({});
  
  // Edit Time Dialog State
  const [editTimeDialogOpen, setEditTimeDialogOpen] = useState(false);
  const [editingDay, setEditingDay] = useState<any>(null);
  const [editTimeForm, setEditTimeForm] = useState({
    checkInTime: "",
    checkOutTime: "",
  });

  // Add Attendance Dialog State
  const [addAttendanceOpen, setAddAttendanceOpen] = useState(false);
  const [addAttendanceWorker, setAddAttendanceWorker] = useState<any>(null);
  const [addAttendanceForm, setAddAttendanceForm] = useState({
    workDate: "",
    eventType: "check_in" as "check_in" | "check_out",
    eventTime: "",
    note: "",
  });

  // Worker Note inline state
  const [editingNoteItemId, setEditingNoteItemId] = useState<number | null>(null);
  const [noteInputValue, setNoteInputValue] = useState("");

  // Add Worker To Batch Dialog State
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const [addWorkerGroup, setAddWorkerGroup] = useState<any>(null);
  const [addWorkerDate, setAddWorkerDate] = useState("");
  const [absentWorkers, setAbsentWorkers] = useState<any[]>([]);
  const [selectedAbsentWorker, setSelectedAbsentWorker] = useState<any>(null);
  const [addWorkerForm, setAddWorkerForm] = useState({ checkInTime: "", checkOutTime: "" });
  const [isLoadingAbsent, setIsLoadingAbsent] = useState(false);

  // Add Worker From Other Group/Cost Center Dialog State
  const [addFromOtherOpen, setAddFromOtherOpen] = useState(false);
  const [addFromOtherTargetGroup, setAddFromOtherTargetGroup] = useState<any>(null); // المجموعة الهدف داخل الدفعة الحالية
  const [addFromOtherDate, setAddFromOtherDate] = useState("");
  const [addFromOtherCostCenterId, setAddFromOtherCostCenterId] = useState("");
  const [addFromOtherSourceGroupId, setAddFromOtherSourceGroupId] = useState("");
  const [presentWorkers, setPresentWorkers] = useState<any[]>([]);
  const [selectedPresentWorker, setSelectedPresentWorker] = useState<any>(null);
  const [isLoadingPresentWorkers, setIsLoadingPresentWorkers] = useState(false);

  // Assignment Settlement Dialog State
  const [settlementDialogOpen, setSettlementDialogOpen] = useState(false);
  const [pendingAssignments, setPendingAssignments] = useState<any[]>([]);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<number[]>([]);
  const [isCheckingAssignments, setIsCheckingAssignments] = useState(false);

  const utils = trpc.useUtils();
  const { data: batch, isLoading } = trpc.payroll.getDetails.useQuery({ batchId });

  // Print handler
  const handlePrint = () => {
    if (!batch) return;
    const groupedForPrint = batch.items?.reduce((acc: any, item: any) => {
      const groupKey = item.groupId || 'unknown';
      if (!acc[groupKey]) {
        acc[groupKey] = {
          groupName: item.groupName || 'مجموعة غير محددة',
          workers: [],
          totals: { base: 0, deductions: 0, bonuses: 0, net: 0 },
        };
      }
      acc[groupKey].workers.push(item);
      acc[groupKey].totals.base += parseFloat(item.baseAmount || '0');
      acc[groupKey].totals.deductions += parseFloat(item.totalDeductions || '0');
      acc[groupKey].totals.bonuses += parseFloat(item.totalBonuses || '0');
      acc[groupKey].totals.net += parseFloat(item.netAmount || '0');
      return acc;
    }, {});
    const printGroups = Object.values(groupedForPrint || {}) as any[];
    let workerNum = 0;
    const grandTotal = { base: 0, deductions: 0, bonuses: 0, net: 0 };
    printGroups.forEach((g: any) => {
      grandTotal.base += g.totals.base;
      grandTotal.deductions += g.totals.deductions;
      grandTotal.bonuses += g.totals.bonuses;
      grandTotal.net += g.totals.net;
    });
    const fmt = (n: number) => n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let tableRows = '';
    printGroups.forEach((group: any) => {
      tableRows += `<tr class="group-header"><td colspan="7">${group.groupName} (${group.workers.length} عامل)</td></tr>`;
      group.workers.forEach((w: any) => {
        workerNum++;
        tableRows += `<tr>
          <td>${workerNum}</td>
          <td>${w.workerName}</td>
          <td>${fmt(parseFloat(w.baseAmount || '0'))}</td>
          <td>${fmt(parseFloat(w.totalDeductions || '0'))}</td>
          <td>${fmt(parseFloat(w.totalBonuses || '0'))}</td>
          <td>${fmt(parseFloat(w.netAmount || '0'))}</td>
          <td>${w.notes || '-'}</td>
        </tr>`;
      });
      tableRows += `<tr class="group-total"><td colspan="2">إجمالي ${group.groupName}</td><td>${fmt(group.totals.base)}</td><td>${fmt(group.totals.deductions)}</td><td>${fmt(group.totals.bonuses)}</td><td>${fmt(group.totals.net)}</td><td></td></tr>`;
    });
    tableRows += `<tr class="grand-total"><td colspan="2">الإجمالي الكلي</td><td>${fmt(grandTotal.base)}</td><td>${fmt(grandTotal.deductions)}</td><td>${fmt(grandTotal.bonuses)}</td><td>${fmt(grandTotal.net)}</td><td></td></tr>`;
    const totalNetWords = numberToArabicWords(grandTotal.net);
    tableRows += `<tr class="amount-words"><td colspan="7" style="background:#f0f7ff;padding:10px 12px;font-size:13px;font-weight:600;color:#1a3c6e;border-top:2px solid #4a90d9;"> الإجمالي بالأحرف: ${totalNetWords}</td></tr>`;
    const periodStartDateObj = new Date(batch.batch.periodStart);
    const periodEndDateObj = new Date(batch.batch.periodEnd);
    const periodStart = periodStartDateObj.toLocaleDateString('ar-SA');
    const periodEnd = periodEndDateObj.toLocaleDateString('ar-SA');

    const isSameDay = periodStartDateObj.toLocaleDateString('en-CA') === periodEndDateObj.toLocaleDateString('en-CA');
    const dayNameAr = periodStartDateObj.toLocaleDateString('ar-SA', { weekday: 'long' });
    const periodDisplay = isSameDay
      ? `${periodStart} (${dayNameAr})`
      : `${periodStart} إلى ${periodEnd}`;
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('يرجى السماح بالنوافذ المنبثقة'); return; }
    printWindow.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>كشف العمال - ${batch.batch.batchCode}</title><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 20px; direction: rtl; color: #333; }
      .header { text-align: center; margin-bottom: 20px; }
      .header h1 { font-size: 22px; margin-bottom: 5px; }
      .header p { font-size: 13px; color: #666; }
      .meta { display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: right; }
      th { background: #f5f5f5; font-weight: 600; }
      .group-header td { background: #e8f4fd; font-weight: 700; font-size: 14px; color: #1a5276; }
      .group-total td { background: #f0f0f0; font-weight: 600; }
      .grand-total td { background: #d4edda; font-weight: 700; font-size: 14px; }
      .footer { margin-top: 20px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
      @media print { body { padding: 10px; } }
    </style></head><body>
      <div class="header">
        <h1>كشف يوميات العمال اليومية</h1>
        <p>رمز الدفعة: ${batch.batch.batchCode}</p>
      </div>
      <div class="meta">
        <span>الفترة: ${periodDisplay}</span>
        <span>الحالة: ${batch.batch.status === 'approved' ? 'موافق عليها' : batch.batch.status}</span>
      </div>
      <table>
        <thead><tr><th>#</th><th>العامل</th><th>المبلغ</th><th>الخصومات</th><th>الاضافي</th><th>الصافي</th><th>ملاحظات</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="footer">تم إنشاء هذا الكشف بواسطة نظام إدارة العمالة اليومية — تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')} | وقت الطباعة: ${new Date().toLocaleTimeString('ar-SA')}</div>
    </body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  const updateItemMutation = trpc.payroll.updateItem.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث البيانات بنجاح");
      setEditingItem(null);
      utils.payroll.getDetails.invalidate({ batchId });
    },
    onError: (error) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  const submitMutation = trpc.payroll.submitForReview.useMutation({
    onSuccess: () => {
      toast.success("تم إرسال الدفعة للمراجعة");
      utils.payroll.getDetails.invalidate({ batchId });
      utils.payroll.listBatches.invalidate();
    },
    onError: (error) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  // Daily Override Mutation - REMOVED (feature deprecated)

  // Export to Excel mutation
  const exportMutation = trpc.payroll.exportBatchDetailsToExcel.useMutation({
    onSuccess: (data) => {
      // Convert base64 to blob and download
      const byteCharacters = atob(data.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('تم تصدير الملف بنجاح');
    },
    onError: (error) => {
      toast.error(`خطأ في التصدير: ${error.message}`);
    },
  });
  const updateAttendanceMutation = trpc.attendance.updateEvent.useMutation();

  const addManualAttendanceMutation = trpc.payroll.addManualAttendance.useMutation({
    onSuccess: async () => {
      toast.success("تمت إضافة البصمة بنجاح");
      setAddAttendanceOpen(false);
      setAddAttendanceForm({ workDate: "", eventType: "check_in", eventTime: "", note: "" });
      utils.payroll.getDetails.invalidate({ batchId });
      if (addAttendanceWorker) {
        const periodStart = batch?.batch.periodStart instanceof Date
          ? batch.batch.periodStart.toLocaleDateString('en-CA')
          : new Date(batch!.batch.periodStart).toLocaleDateString('en-CA');
        const periodEnd = batch?.batch.periodEnd instanceof Date
          ? batch.batch.periodEnd.toLocaleDateString('en-CA')
          : new Date(batch!.batch.periodEnd).toLocaleDateString('en-CA');
        const data = await utils.client.payroll.getAttendanceForWorkerPeriod.query({
          workerId: addAttendanceWorker.workerId,
          periodStart,
          periodEnd,
        });
        setDailyData(data);
      }
    },
    onError: (error) => { toast.error(`خطأ: ${error.message}`); },
  });

  const updateAttendanceForBatchMutation = trpc.payroll.updateAttendanceForBatch.useMutation({
    onSuccess: async () => {
      toast.success("تم تحديث البصمة بنجاح");
      setEditTimeDialogOpen(false);
      utils.payroll.getDetails.invalidate({ batchId });
      if (selectedWorker) {
        const periodStart = batch?.batch.periodStart instanceof Date
          ? batch.batch.periodStart.toLocaleDateString('en-CA')
          : new Date(batch!.batch.periodStart).toLocaleDateString('en-CA');
        const periodEnd = batch?.batch.periodEnd instanceof Date
          ? batch.batch.periodEnd.toLocaleDateString('en-CA')
          : new Date(batch!.batch.periodEnd).toLocaleDateString('en-CA');
        const data = await utils.client.payroll.getAttendanceForWorkerPeriod.query({
          workerId: selectedWorker.workerId,
          periodStart,
          periodEnd,
        });
        setDailyData(data);
      }
    },
    onError: (error) => { toast.error(`خطأ: ${error.message}`); },
  });

  const updateWorkerNoteMutation = trpc.payroll.updateWorkerNote.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ الملاحظة");
      setEditingNoteItemId(null);
      utils.payroll.getDetails.invalidate({ batchId });
    },
    onError: (error) => { toast.error(`خطأ: ${error.message}`); },
  });

  const addWorkerToBatchMutation = trpc.payroll.addWorkerToBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`تمت إضافة ${data.workerName} للدفعة بنجاح`);
      setAddWorkerOpen(false);
      setSelectedAbsentWorker(null);
      setAddWorkerForm({ checkInTime: "", checkOutTime: "" });
      setAbsentWorkers([]);
      utils.payroll.getDetails.invalidate({ batchId });
    },
    onError: (error) => { toast.error(`خطأ: ${error.message}`); },
  });

  const handleOpenAddWorker = (group: any) => {
    setAddWorkerGroup(group);
    setAddWorkerDate(
      batch?.batch.periodStart instanceof Date
        ? batch.batch.periodStart.toLocaleDateString('en-CA')
        : new Date(batch!.batch.periodStart).toLocaleDateString('en-CA')
    );
    setAbsentWorkers([]);
    setSelectedAbsentWorker(null);
    setAddWorkerForm({ checkInTime: "", checkOutTime: "" });
    setAddWorkerOpen(true);
  };

  const handleFetchAbsentWorkers = async (date: string, groupId: number) => {
    setIsLoadingAbsent(true);
    try {
      const result = await utils.client.payroll.getAbsentWorkersForBatch.query({
        groupId,
        workDate: date,
        batchId,
      });
      setAbsentWorkers(result);
      setSelectedAbsentWorker(null);
    } catch (error: any) {
      toast.error(`خطأ في جلب العمال: ${error.message}`);
    } finally {
      setIsLoadingAbsent(false);
    }
  };

  // ===== إضافة عامل من مركز/مجموعة أخرى =====
  const { data: allCostCenters } = trpc.costCenters.list.useQuery();
  const { data: otherCostCenterGroups } = trpc.groups.listByCostCenter.useQuery(
    { costCenterId: addFromOtherCostCenterId ? parseInt(addFromOtherCostCenterId) : undefined },
    { enabled: !!addFromOtherCostCenterId }
  );

  const addWorkerFromOtherGroupMutation = trpc.payroll.addWorkerFromOtherGroup.useMutation({
    onSuccess: (data) => {
      toast.success(`تمت إضافة ${data.workerName} للدفعة بنجاح (عبر انتداب مؤقت ليوم واحد)`);
      setAddFromOtherOpen(false);
      setAddFromOtherCostCenterId("");
      setAddFromOtherSourceGroupId("");
      setPresentWorkers([]);
      setSelectedPresentWorker(null);
      utils.payroll.getDetails.invalidate({ batchId });
    },
    onError: (error) => { toast.error(`خطأ: ${error.message}`); },
  });

  const handleOpenAddFromOther = (group: any) => {
    setAddFromOtherTargetGroup(group);
    setAddFromOtherDate(
      batch?.batch.periodStart instanceof Date
        ? batch.batch.periodStart.toLocaleDateString('en-CA')
        : new Date(batch!.batch.periodStart).toLocaleDateString('en-CA')
    );
    setAddFromOtherCostCenterId("");
    setAddFromOtherSourceGroupId("");
    setPresentWorkers([]);
    setSelectedPresentWorker(null);
    setAddFromOtherOpen(true);
  };

  const handleFetchPresentWorkers = async (date: string, groupId: number) => {
    setIsLoadingPresentWorkers(true);
    try {
      const result = await utils.client.payroll.getPresentWorkersForGroupDate.query({
        groupId,
        workDate: date,
      });
      setPresentWorkers(result);
      setSelectedPresentWorker(null);
    } catch (error: any) {
      toast.error(`خطأ في جلب العمال: ${error.message}`);
    } finally {
      setIsLoadingPresentWorkers(false);
    }
  };

  const handleConfirmAddFromOther = () => {
    if (!selectedPresentWorker || !addFromOtherDate || !addFromOtherTargetGroup) return;
    addWorkerFromOtherGroupMutation.mutate({
      batchId,
      targetGroupId: addFromOtherTargetGroup.groupId,
      workerId: selectedPresentWorker.id,
      workDate: addFromOtherDate,
    });
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setEditForm({
      baseAmount: item.baseAmount,
      totalDeductions: item.totalDeductions,
      totalBonuses: item.totalBonuses,
      notes: item.notes || "",
    });
  };

  const handleSaveEdit = () => {
    updateItemMutation.mutate({
      itemId: editingItem.id,
      ...editForm,
    });
  };

  // Assignment Settlement Mutation
  const applySettlementsMutation = trpc.payroll.applyAssignmentSettlements.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setSettlementDialogOpen(false);
      utils.payroll.getDetails.invalidate({ batchId });
      utils.payroll.listBatches.invalidate();
      // بعد تطبيق التسوية، نسأل عن إرسال للمراجعة
      if (confirm("تم تطبيق التسوية بنجاح. هل تريد إرسال الدفعة للمراجعة الآن؟")) {
        submitMutation.mutate({ batchId });
      }
    },
    onError: (error) => {
      toast.error(`خطأ في تطبيق التسوية: ${error.message}`);
    },
  });

  const handleSubmitForReview = async () => {
    // فحص الانتدابات أولاً قبل الإرسال
    setIsCheckingAssignments(true);
    try {
      const result = await utils.client.payroll.checkBatchAssignments.query({ batchId });
      if (result.hasAssignments) {
        // يوجد انتدابات - عرض التنبيه
        const unsettled = result.assignments.filter((a: any) => !a.alreadySettled);
        if (unsettled.length > 0) {
          setPendingAssignments(unsettled);
          setSelectedAssignmentIds(unsettled.map((a: any) => a.assignmentId));
          setSettlementDialogOpen(true);
        } else {
          // جميع التسويات مطبقة مسبقاً
          if (confirm("هل أنت متأكد من إرسال الدفعة للمراجعة؟ لن تتمكن من التعديل بعد ذلك.")) {
            submitMutation.mutate({ batchId });
          }
        }
      } else {
        // لا توجد انتدابات - إرسال عادي
        if (confirm("هل أنت متأكد من إرسال الدفعة للمراجعة؟ لن تتمكن من التعديل بعد ذلك.")) {
          submitMutation.mutate({ batchId });
        }
      }
    } catch (error: any) {
      toast.error(`خطأ في فحص الانتدابات: ${error.message}`);
      // السماح بالإرسال حتى لو فشل الفحص
      if (confirm("تعذر فحص الانتدابات. هل تريد إرسال الدفعة للمراجعة على أي حال؟")) {
        submitMutation.mutate({ batchId });
      }
    } finally {
      setIsCheckingAssignments(false);
    }
  };

  const handleApplySettlements = () => {
    if (selectedAssignmentIds.length === 0) {
      toast.error("يرجى اختيار انتداب واحد على الأقل");
      return;
    }
    applySettlementsMutation.mutate({
      batchId,
      assignmentIds: selectedAssignmentIds,
    });
  };

  const handleSkipSettlements = () => {
    setSettlementDialogOpen(false);
    if (confirm("هل أنت متأكد من إرسال الدفعة للمراجعة بدون تطبيق تسويات الانتدابات؟")) {
      submitMutation.mutate({ batchId });
    }
  };

  // Daily Details Handlers
  const handleOpenDailyDetails = async (worker: any) => {
    setSelectedWorker(worker);
    setDailyDetailsOpen(true);
    
    // Fetch attendance data (check_in and check_out)
    try {
      // Convert dates safely - handle both Date objects and strings
      const periodStart = batch!.batch.periodStart instanceof Date 
        ? batch!.batch.periodStart.toLocaleDateString('en-CA')
        : new Date(batch!.batch.periodStart).toLocaleDateString('en-CA');
      const periodEnd = batch!.batch.periodEnd instanceof Date
        ? batch!.batch.periodEnd.toLocaleDateString('en-CA')
        : new Date(batch!.batch.periodEnd).toLocaleDateString('en-CA');
      
      const data = await utils.client.payroll.getAttendanceForWorkerPeriod.query({
        workerId: worker.workerId,
        periodStart,
        periodEnd,
      });
      setDailyData(data);
      
      // Initialize override form
      const initialForm: any = {};
      data.forEach((day: any) => {
        initialForm[day.date] = {
          enabled: false,
          reason: "",
        };
      });
      setOverrideForm(initialForm);
    } catch (error: any) {
      toast.error(`خطأ في جلب البيانات: ${error.message}`);
    }
  };

  const handleOverrideChange = (workDate: string, enabled: boolean) => {
    setOverrideForm(prev => ({
      ...prev,
      [workDate]: {
        ...prev[workDate],
        enabled,
      },
    }));
  };

  const handleReasonChange = (workDate: string, reason: string) => {
    setOverrideForm(prev => ({
      ...prev,
      [workDate]: {
        ...prev[workDate],
        reason,
      },
    }));
  };

  const handleSaveOverride = (workDate: string) => {
    const form = overrideForm[workDate];
    
    if (form.enabled && !form.reason.trim()) {
      toast.error("يرجى إدخال سبب التصحيح");
      return;
    }

    // Feature removed
    toast.info("ميزة التصحيح اليومي غير متاحة حالياً");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="container py-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">لم يتم العثور على الدفعة</p>
            <Button className="mt-4" onClick={() => setLocation("/payroll/batches")}>
              العودة إلى القائمة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canEdit = batch.batch.status === "draft" || batch.batch.status === "returned_from_accountant" || batch.batch.status === "returned_from_financial_review";
  const canSubmit = batch.batch.status === "draft" || batch.batch.status === "returned_from_accountant" || batch.batch.status === "returned_from_financial_review";

  // Group items by groupId
  const groupedItems = batch.items?.reduce((acc: any, item: any) => {
    const groupKey = item.groupId || 'unknown';
    if (!acc[groupKey]) {
      acc[groupKey] = {
        groupId: item.groupId,
        groupName: item.groupName || 'مجموعة غير محددة',
        workers: [],
        summary: {
          count: 0,
          totalBase: 0,
          totalDeductions: 0,
          totalBonuses: 0,
          totalNet: 0,
        },
      };
    }
    acc[groupKey].workers.push(item);
    acc[groupKey].summary.count += 1;
    acc[groupKey].summary.totalBase += parseFloat(item.baseAmount || '0');
    acc[groupKey].summary.totalDeductions += parseFloat(item.totalDeductions || '0');
    acc[groupKey].summary.totalBonuses += parseFloat(item.totalBonuses || '0');
    acc[groupKey].summary.totalNet += parseFloat(item.netAmount || '0');
    return acc;
  }, {});

  const groups = Object.values(groupedItems || {});

  return (
    <>
    <div className="container py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setLocation("/payroll/batches")}>
            <ArrowLeft className="h-4 w-4 ml-2" />
            العودة
          </Button>
          <div>
            <h1 className="text-3xl font-bold">دفعة العمال #{batch.batch.batchCode}</h1>
            <p className="text-muted-foreground">
              {new Date(batch.batch.periodStart).toLocaleDateString("ar-SA")} -{" "}
              {new Date(batch.batch.periodEnd).toLocaleDateString("ar-SA")}
            </p>
          </div>
        </div>
        <StatusBadge status={batch.batch.status as any} />
      </div>

      {/* Approval Pipeline */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            {/* Step 1: Draft/Created */}
            {(() => {
              const status = batch.batch.status || "draft";
              const steps = [
                {
                  label: "إنشاء الدفعة",
                  sublabel: "الشؤون الإدارية",
                  done: status !== "draft",
                  active: status === "draft" || status === "returned_from_accountant" || status === "returned_from_financial_review",
                  rejected: status === "returned_from_accountant" || status === "returned_from_financial_review",
                },
                {
                  label: "مراجعة المحاسب",
                  sublabel: "المحاسب المالي",
                  done: ["under_financial_review", "under_accounts_manager_review", "approved", "paid"].includes(status),
                  active: status === "under_accountant_review",
                  rejected: false,
                },
                {
                  label: "المراجع المالي",
                  sublabel: "اعتماد أولي",
                  done: ["under_accounts_manager_review", "approved", "paid"].includes(status),
                  active: status === "under_financial_review",
                  rejected: false,
                },
                {
                  label: "المدير المالي",
                  sublabel: "اعتماد نهائي",
                  done: ["approved", "paid"].includes(status),
                  active: status === "under_accounts_manager_review",
                  rejected: false,
                },
              ];
              return steps.map((step, i) => (
                <div key={i} className="flex items-center flex-1">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                      step.done ? "bg-green-100 border-green-500 text-green-600" :
                      step.active && step.rejected ? "bg-red-100 border-red-500 text-red-600" :
                      step.active ? "bg-blue-100 border-blue-500 text-blue-600 animate-pulse" :
                      "bg-muted border-muted-foreground/30 text-muted-foreground"
                    }`}>
                      {step.done ? <CheckCircle className="h-5 w-5" /> :
                       step.active && step.rejected ? <XCircle className="h-5 w-5" /> :
                       step.active ? <Clock className="h-5 w-5" /> :
                       <span className="text-sm font-bold">{i + 1}</span>}
                    </div>
                    <span className={`text-xs mt-1 font-medium ${
                      step.done ? "text-green-600" :
                      step.active ? (step.rejected ? "text-red-600" : "text-blue-600") :
                      "text-muted-foreground"
                    }`}>{step.label}</span>
                    <span className="text-[10px] text-muted-foreground">{step.sublabel}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 ${
                      step.done ? "bg-green-500" : "bg-muted-foreground/20"
                    }`} />
                  )}
                </div>
              ));
            })()}
          </div>
          {batch.batch.status === "rejected_final" && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-950 rounded-lg text-center">
              <span className="text-red-600 font-medium">تم رفض الدفعة نهائيًا</span>
            </div>
          )}
          {batch.batch.status === "approved" && (
            <div className="mt-3 p-3 bg-green-50 dark:bg-green-950 rounded-lg text-center">
              <span className="text-green-600 font-medium">تم اعتماد الدفعة بنجاح من جميع المراحل</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              عدد العمال
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{batch.batch.totalWorkers || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              الصافي 
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(batch.items || []).reduce((sum: number, item: any) => sum + parseFloat(item.netAmount || '0'), 0).toLocaleString("ar-SA")} ر.س
            </div>
            <div className="text-xs text-muted-foreground mt-1 font-medium">
              {numberToArabicWords((batch.items || []).reduce((sum: number, item: any) => sum + parseFloat(item.netAmount || '0'), 0))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              المتوسط 
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(batch.batch.totalWorkers || 0) > 0
                ? (Number(batch.batch.totalAmount || 0) / (batch.batch.totalWorkers || 1)).toLocaleString("ar-SA", {
                    maximumFractionDigits: 0,
                  })
                : 0}{" "}
              ر.س
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              عدد الرفضات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{batch.batch.rejectionCount || 0} / 3</div>
          </CardContent>
        </Card>
      </div>

      {/* Workers Table - Grouped by Group */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>تفاصيل العمال حسب المجموعات</CardTitle>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handlePrint}
              >
                <Printer className="h-4 w-4 ml-2" />
                طباعة الكشف
              </Button>

              {canSubmit && (
                <Button onClick={handleSubmitForReview} disabled={submitMutation.isPending || isCheckingAssignments} className="text-black">
                  {isCheckingAssignments ? (
                    <>
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                      جاري فحص الانتدابات...
                    </>
                  ) : submitMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                      جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="h-4 w-4 ml-2" />
                      إرسال للمراجعة
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>اسم العامل / المجموعة</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>الخصومات</TableHead>
                <TableHead>الإضافات</TableHead>
                <TableHead>الصافي</TableHead>
                <TableHead>ملاحظات</TableHead>
                {canEdit && <TableHead>الإجراءات</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group: any) => (
                <>
                  {/* Group Summary Row */}
                  <TableRow key={`group-${group.groupId}`} className="bg-muted/50 font-semibold">
                    <TableCell className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      {group.groupName} ({group.summary.count} عامل)
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-6 px-2 mr-2 text-green-600 border-green-300 hover:bg-green-50 font-normal"
                          onClick={() => handleOpenAddWorker(group)}
                        >
                          + إضافة عامل
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-6 px-2 mr-1 text-blue-600 border-blue-300 hover:bg-blue-50 font-normal"
                          onClick={() => handleOpenAddFromOther(group)}
                        >
                          🔀 إضافة من مركز آخر
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {group.summary.totalBase.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س
                    </TableCell>
                    <TableCell className="text-red-600">
                      {group.summary.totalDeductions.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س
                    </TableCell>
                    <TableCell className="text-green-600">
                      {group.summary.totalBonuses.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س
                    </TableCell>
                    <TableCell className="font-bold">
                      {group.summary.totalNet.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س
                    </TableCell>
                    <TableCell></TableCell>
                    {canEdit && <TableCell></TableCell>}
                  </TableRow>

                  {/* Worker Rows */}
                  {group.workers.map((item: any) => (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="pl-12 font-medium">{item.workerName}</TableCell>
                      <TableCell>{Number(item.baseAmount).toLocaleString("ar-SA")} ر.س</TableCell>
                      <TableCell className="text-red-600">
                        {Number(item.totalDeductions).toLocaleString("ar-SA")} ر.س
                      </TableCell>
                      <TableCell className="text-green-600">
                        {Number(item.totalBonuses).toLocaleString("ar-SA")} ر.س
                      </TableCell>
                      <TableCell className="font-bold">
                        {Number(item.netAmount).toLocaleString("ar-SA")} ر.س
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground min-w-[160px]">
                        {item.restaurantNames ? (
                          <span className="text-foreground">🍽️ {item.restaurantNames}</span>
                        ) : canEdit && editingNoteItemId === item.id ? (
                          <div className="flex gap-1 items-center">
                            <input
                              autoFocus
                              className="border rounded px-2 py-1 text-sm w-full bg-background"
                              value={noteInputValue}
                              onChange={(e) => setNoteInputValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') updateWorkerNoteMutation.mutate({ itemId: item.id, note: noteInputValue });
                                if (e.key === 'Escape') setEditingNoteItemId(null);
                              }}
                            />
                            <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => updateWorkerNoteMutation.mutate({ itemId: item.id, note: noteInputValue })}>✓</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => setEditingNoteItemId(null)}>✕</Button>
                          </div>
                        ) : (
                          <span
                            className={canEdit ? "cursor-pointer hover:text-foreground hover:underline" : ""}
                            title={canEdit ? "اضغط لتعديل الملاحظة" : ""}
                            onClick={() => {
                              if (!canEdit) return;
                              setEditingNoteItemId(item.id);
                              setNoteInputValue(item.notes || "");
                            }}
                          >
                            {item.notes || (canEdit ? <span className="text-muted-foreground/50 italic">أضف ملاحظة...</span> : "-")}
                          </span>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 px-2 text-blue-600 border-blue-300 hover:bg-blue-50"
                              onClick={() => {
                                setAddAttendanceWorker(item);
                                setAddAttendanceForm({
                                  workDate: new Date(batch!.batch.periodStart).toLocaleDateString('en-CA'),
                                  eventType: "check_in",
                                  eventTime: "",
                                  note: "",
                                });
                                setAddAttendanceOpen(true);
                              }}
                              title="إضافة بصمة يدوية"
                            >
                              + تحضير
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenDailyDetails(item)}
                              title="تفاصيل الأيام وتعديل الأوقات"
                            >
                              <Calendar className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(item)}
                              title="تعديل المبالغ"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل بيانات العامل</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم العامل</Label>
              <Input value={editingItem?.workerName || ""} disabled />
            </div>
            <div>
              <Label htmlFor="baseAmount">المبلغ</Label>
              <Input
                id="baseAmount"
                type="number"
                step="0.01"
                value={editForm.baseAmount}
                onChange={(e) => setEditForm({ ...editForm, baseAmount: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="totalDeductions">الخصومات</Label>
              <Input
                id="totalDeductions"
                type="number"
                step="0.01"
                value={editForm.totalDeductions}
                onChange={(e) => setEditForm({ ...editForm, totalDeductions: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="totalBonuses">الإضافات</Label>
              <Input
                id="totalBonuses"
                type="number"
                step="0.01"
                value={editForm.totalBonuses}
                onChange={(e) => setEditForm({ ...editForm, totalBonuses: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="notes">ملاحظات</Label>
              <Input
                id="notes"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              إلغاء
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateItemMutation.isPending}>
              {updateItemMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                "حفظ"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Daily Details Dialog */}
      <Dialog open={dailyDetailsOpen} onOpenChange={setDailyDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              تفاصيل الأيام - {selectedWorker?.workerName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {dailyData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                لا توجد بيانات يومية لهذا العامل
              </p>
            ) : (
              <div className="space-y-3">
                {dailyData.map((day: any) => {
                  const form = overrideForm[day.date] || { enabled: false, reason: "" };
                  
                  // Format times
                  const checkInTime = day.checkIn 
                    ? new Date(day.checkIn.eventTime).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
                    : "-";
                  const checkOutTime = day.checkOut
                    ? new Date(day.checkOut.eventTime).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
                    : "-";
                  
                  return (
                    <Card key={day.date}>
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          {/* التاريخ والمعلومات الأساسية */}
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <h4 className="font-semibold text-lg">
                                {new Date(day.date).toLocaleDateString('ar-SA', {
                                  weekday: 'long',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                })}
                              </h4>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                <div>
                                  <span className="text-muted-foreground">الحضور:</span>{" "}
                                  <span className="font-medium">{checkInTime}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">الانصراف:</span>{" "}
                                  <span className="font-medium">{checkOutTime}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">دقائق العمل الفعلية:</span>{" "}
                                  <span className="font-medium font-mono text-primary">
                                    {day.actualWorkMinutes || 0} دقيقة
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">الحالة:</span>{" "}
                                  <span className="font-medium">
                                    {day.checkIn && day.checkOut ? "مكتمل" : day.checkIn ? "حضور فقط" : "لا يوجد"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">الطريقة:</span>{" "}
                                  <span className="font-medium">{day.checkIn?.method || "-"}</span>
                                </div>
                              </div>
                            </div>
                            <div className="text-left space-y-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingDay(day);
                                  setEditTimeForm({
                                    checkInTime: day.checkIn 
                                      ? new Date(day.checkIn.eventTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                                      : "",
                                    checkOutTime: day.checkOut
                                      ? new Date(day.checkOut.eventTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                                      : "",
                                  });
                                  setEditTimeDialogOpen(true);
                                }}
                              >
                                <Edit className="h-3 w-3 ml-1" />
                                تعديل الأوقات
                              </Button>
                            </div>
                          </div>


                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDailyDetailsOpen(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Time Dialog */}
      <Dialog open={editTimeDialogOpen} onOpenChange={setEditTimeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              تعديل أوقات الحضور والانصراف
            </DialogTitle>
          </DialogHeader>
          {editingDay && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {new Date(editingDay.date).toLocaleDateString('ar-SA', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
              
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="checkInTime">وقت الحضور</Label>
                  <Input
                    id="checkInTime"
                    type="time"
                    value={editTimeForm.checkInTime}
                    onChange={(e) => setEditTimeForm(prev => ({ ...prev, checkInTime: e.target.value }))}
                    placeholder="HH:MM"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="checkOutTime">وقت الانصراف</Label>
                  <Input
                    id="checkOutTime"
                    type="time"
                    value={editTimeForm.checkOutTime}
                    onChange={(e) => setEditTimeForm(prev => ({ ...prev, checkOutTime: e.target.value }))}
                    placeholder="HH:MM"
                  />
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
                <strong>ملاحظة:</strong> سيتم تحديث سجلات الحضور وإعادة حساب الدقائق والمبلغ تلقائياً بعد الحفظ.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTimeDialogOpen(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={async () => {
                if (!editingDay) return;
                try {
                  const date = new Date(editingDay.date).toLocaleDateString('en-CA');
                  if (editTimeForm.checkInTime && editingDay.checkIn) {
                    await updateAttendanceForBatchMutation.mutateAsync({
                      batchId,
                      eventId: editingDay.checkIn.id,
                      newTime: `${date}T${editTimeForm.checkInTime}:00`,
                      note: "تم التعديل من دفعة العمال",
                    });
                  }
                  if (editTimeForm.checkOutTime && editingDay.checkOut) {
                    await updateAttendanceForBatchMutation.mutateAsync({
                      batchId,
                      eventId: editingDay.checkOut.id,
                      newTime: `${date}T${editTimeForm.checkOutTime}:00`,
                      note: "تم التعديل من دفعة العمال",
                    });
                  }
                  toast.success("تم حفظ التعديلات بنجاح");
                  setEditTimeDialogOpen(false);
                } catch (error: any) {
                  toast.error(error.message || "حدث خطأ أثناء حفظ التعديلات");
                }
              }}
              disabled={updateAttendanceForBatchMutation.isPending}
            >
              {updateAttendanceForBatchMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                "حفظ التعديلات"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Notes Section */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>الملاحظات</CardTitle>
        </CardHeader>
        <CardContent>
          <BatchNotesSection batchId={batchId} />
        </CardContent>
      </Card>
    </div>

      {/* Add Worker To Batch Dialog */}
      <Dialog open={addWorkerOpen} onOpenChange={setAddWorkerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة عامل للدفعة — {addWorkerGroup?.groupName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>التاريخ</Label>
              <input
                type="date"
                className="border rounded px-3 py-2 text-sm w-full bg-background"
                value={addWorkerDate}
                min={batch?.batch.periodStart instanceof Date
                  ? batch.batch.periodStart.toLocaleDateString('en-CA')
                  : new Date(batch?.batch.periodStart || '').toLocaleDateString('en-CA')}
                max={batch?.batch.periodEnd instanceof Date
                  ? batch.batch.periodEnd.toLocaleDateString('en-CA')
                  : new Date(batch?.batch.periodEnd || '').toLocaleDateString('en-CA')}
                onChange={(e) => {
                  setAddWorkerDate(e.target.value);
                  setAbsentWorkers([]);
                  setSelectedAbsentWorker(null);
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!addWorkerDate || isLoadingAbsent}
                onClick={() => handleFetchAbsentWorkers(addWorkerDate, addWorkerGroup?.groupId)}
                className="w-full"
              >
                {isLoadingAbsent ? (
                  <><Loader2 className="h-4 w-4 ml-2 animate-spin" />جاري البحث...</>
                ) : ("عرض العمال الغائبين")}
              </Button>
            </div>

            {absentWorkers.length > 0 && (
              <div className="space-y-2">
                <Label>اختر العامل</Label>
                <select
                  className="border rounded px-3 py-2 text-sm w-full bg-background"
                  value={selectedAbsentWorker?.id || ""}
                  onChange={(e) => {
                    const w = absentWorkers.find((w: any) => w.id === Number(e.target.value));
                    setSelectedAbsentWorker(w || null);
                  }}
                >
                  <option value="">-- اختر عاملاً --</option>
                  {absentWorkers.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.fullName} — {w.code}</option>
                  ))}
                </select>
              </div>
            )}

            {absentWorkers.length === 0 && !isLoadingAbsent && addWorkerDate && (
              <p className="text-sm text-muted-foreground text-center py-2">
                اضغط "عرض العمال الغائبين" لجلب القائمة
              </p>
            )}

            {selectedAbsentWorker && (
              <>
                <div className="space-y-2">
                  <Label>وقت الحضور</Label>
                  <Input
                    type="time"
                    value={addWorkerForm.checkInTime}
                    onChange={(e) => setAddWorkerForm(p => ({ ...p, checkInTime: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>وقت الانصراف</Label>
                  <Input
                    type="time"
                    value={addWorkerForm.checkOutTime}
                    onChange={(e) => setAddWorkerForm(p => ({ ...p, checkOutTime: e.target.value }))}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddWorkerOpen(false)}>إلغاء</Button>
            <Button
              disabled={!selectedAbsentWorker || !addWorkerForm.checkInTime || !addWorkerForm.checkOutTime || addWorkerToBatchMutation.isPending}
              onClick={() => {
                if (!selectedAbsentWorker || !addWorkerDate || !addWorkerForm.checkInTime || !addWorkerForm.checkOutTime) return;
                addWorkerToBatchMutation.mutate({
                  batchId,
                  workerId: selectedAbsentWorker.id,
                  workDate: addWorkerDate,
                  checkInTime: `${addWorkerDate}T${addWorkerForm.checkInTime}:00`,
                  checkOutTime: `${addWorkerDate}T${addWorkerForm.checkOutTime}:00`,
                });
              }}
            >
              {addWorkerToBatchMutation.isPending ? (
                <><Loader2 className="h-4 w-4 ml-2 animate-spin" />جاري الإضافة...</>
              ) : ("إضافة للدفعة")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Worker From Other Cost Center/Group Dialog */}
      <Dialog open={addFromOtherOpen} onOpenChange={setAddFromOtherOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة عامل من مركز آخر — إلى {addFromOtherTargetGroup?.groupName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              يتم نقل العامل ليوم واحد فقط عبر انتداب مؤقت تلقائي. سيُحتسب أجر ذلك اليوم هنا، ولن يُحتسب له في مركزه الأصلي.
            </p>

            <div className="space-y-2">
              <Label>التاريخ</Label>
              <input
                type="date"
                className="border rounded px-3 py-2 text-sm w-full bg-background"
                value={addFromOtherDate}
                min={batch?.batch.periodStart instanceof Date
                  ? batch.batch.periodStart.toLocaleDateString('en-CA')
                  : new Date(batch?.batch.periodStart || '').toLocaleDateString('en-CA')}
                max={batch?.batch.periodEnd instanceof Date
                  ? batch.batch.periodEnd.toLocaleDateString('en-CA')
                  : new Date(batch?.batch.periodEnd || '').toLocaleDateString('en-CA')}
                onChange={(e) => {
                  setAddFromOtherDate(e.target.value);
                  setPresentWorkers([]);
                  setSelectedPresentWorker(null);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>مركز التكلفة</Label>
              <select
                className="border rounded px-3 py-2 text-sm w-full bg-background"
                value={addFromOtherCostCenterId}
                onChange={(e) => {
                  setAddFromOtherCostCenterId(e.target.value);
                  setAddFromOtherSourceGroupId("");
                  setPresentWorkers([]);
                  setSelectedPresentWorker(null);
                }}
              >
                <option value="">-- اختر مركز التكلفة --</option>
                {allCostCenters?.map((cc: any) => (
                  <option key={cc.id} value={cc.id}>{cc.name}</option>
                ))}
              </select>
            </div>

            {addFromOtherCostCenterId && (
              <div className="space-y-2">
                <Label>المجموعة</Label>
                <select
                  className="border rounded px-3 py-2 text-sm w-full bg-background"
                  value={addFromOtherSourceGroupId}
                  onChange={(e) => {
                    setAddFromOtherSourceGroupId(e.target.value);
                    setPresentWorkers([]);
                    setSelectedPresentWorker(null);
                  }}
                >
                  <option value="">-- اختر المجموعة --</option>
                  {otherCostCenterGroups?.map((g: any) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            )}

            {addFromOtherSourceGroupId && (
              <Button
                size="sm"
                variant="outline"
                disabled={!addFromOtherDate || isLoadingPresentWorkers}
                onClick={() => handleFetchPresentWorkers(addFromOtherDate, parseInt(addFromOtherSourceGroupId))}
                className="w-full"
              >
                {isLoadingPresentWorkers ? (
                  <><Loader2 className="h-4 w-4 ml-2 animate-spin" />جاري البحث...</>
                ) : ("عرض العمال الحاضرين")}
              </Button>
            )}

            {presentWorkers.length > 0 && (
              <div className="space-y-2">
                <Label>اختر العامل</Label>
                <select
                  className="border rounded px-3 py-2 text-sm w-full bg-background"
                  value={selectedPresentWorker?.id || ""}
                  onChange={(e) => {
                    const w = presentWorkers.find((w: any) => w.id === Number(e.target.value));
                    setSelectedPresentWorker(w || null);
                  }}
                >
                  <option value="">-- اختر عاملاً --</option>
                  {presentWorkers.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.fullName} — {w.code}</option>
                  ))}
                </select>
              </div>
            )}

            {addFromOtherSourceGroupId && presentWorkers.length === 0 && !isLoadingPresentWorkers && (
              <p className="text-sm text-muted-foreground text-center py-2">
                اضغط "عرض العمال الحاضرين" لجلب القائمة
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFromOtherOpen(false)}>إلغاء</Button>
            <Button
              disabled={!selectedPresentWorker || addWorkerFromOtherGroupMutation.isPending}
              onClick={handleConfirmAddFromOther}
            >
              {addWorkerFromOtherGroupMutation.isPending ? (
                <><Loader2 className="h-4 w-4 ml-2 animate-spin" />جاري النقل...</>
              ) : ("نقل وإضافة للدفعة")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Manual Attendance Dialog */}
      <Dialog open={addAttendanceOpen} onOpenChange={setAddAttendanceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة بصمة يدوية — {addAttendanceWorker?.workerName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>التاريخ</Label>
              <input
                type="date"
                className="border rounded px-3 py-2 text-sm w-full bg-background"
                value={addAttendanceForm.workDate}
                min={batch?.batch.periodStart instanceof Date
                  ? batch.batch.periodStart.toLocaleDateString('en-CA')
                  : new Date(batch?.batch.periodStart || '').toLocaleDateString('en-CA')}
                max={batch?.batch.periodEnd instanceof Date
                  ? batch.batch.periodEnd.toLocaleDateString('en-CA')
                  : new Date(batch?.batch.periodEnd || '').toLocaleDateString('en-CA')}
                onChange={(e) => setAddAttendanceForm(p => ({ ...p, workDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>نوع البصمة</Label>
              <div className="flex gap-3">
                <Button
                  variant={addAttendanceForm.eventType === 'check_in' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAddAttendanceForm(p => ({ ...p, eventType: 'check_in' }))}
                >
                  حضور
                </Button>
                <Button
                  variant={addAttendanceForm.eventType === 'check_out' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAddAttendanceForm(p => ({ ...p, eventType: 'check_out' }))}
                >
                  انصراف
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>الوقت</Label>
              <Input
                type="time"
                value={addAttendanceForm.eventTime}
                onChange={(e) => setAddAttendanceForm(p => ({ ...p, eventTime: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>ملاحظة (اختياري)</Label>
              <Input
                placeholder="سبب الإضافة اليدوية..."
                value={addAttendanceForm.note}
                onChange={(e) => setAddAttendanceForm(p => ({ ...p, note: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAttendanceOpen(false)}>إلغاء</Button>
            <Button
              disabled={!addAttendanceForm.workDate || !addAttendanceForm.eventTime || addManualAttendanceMutation.isPending}
              onClick={() => {
                if (!addAttendanceWorker || !addAttendanceForm.workDate || !addAttendanceForm.eventTime) return;
                addManualAttendanceMutation.mutate({
                  batchId,
                  workerId: addAttendanceWorker.workerId,
                  workDate: addAttendanceForm.workDate,
                  eventType: addAttendanceForm.eventType,
                  eventTime: `${addAttendanceForm.workDate}T${addAttendanceForm.eventTime}:00`,
                  note: addAttendanceForm.note || undefined,
                });
              }}
            >
              {addManualAttendanceMutation.isPending ? (
                <><Loader2 className="h-4 w-4 ml-2 animate-spin" />جاري الإضافة...</>
              ) : ("إضافة البصمة")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assignment Settlement Dialog */}
      <Dialog open={settlementDialogOpen} onOpenChange={setSettlementDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              تنبيه: يوجد عمال منتدبون في هذه الدفعة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              تم اكتشاف انتدابات نشطة لعمال في هذه الدفعة. هل تريد تطبيق تسوية الانتدابات؟
              سيتم خصم مبلغ أيام الانتداب من هذه الدفعة وإضافته لدفعة المركز المنتدب إليه.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={selectedAssignmentIds.length === pendingAssignments.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedAssignmentIds(pendingAssignments.map((a: any) => a.assignmentId));
                        } else {
                          setSelectedAssignmentIds([]);
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>العامل</TableHead>
                  <TableHead>منتدب إلى</TableHead>
                  <TableHead>الأيام</TableHead>
                  <TableHead>المبلغ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingAssignments.map((assignment: any) => (
                  <TableRow key={assignment.assignmentId}>
                    <TableCell>
                      <Checkbox
                        checked={selectedAssignmentIds.includes(assignment.assignmentId)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedAssignmentIds([...selectedAssignmentIds, assignment.assignmentId]);
                          } else {
                            setSelectedAssignmentIds(selectedAssignmentIds.filter(id => id !== assignment.assignmentId));
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{assignment.workerName}</TableCell>
                    <TableCell>
                      <span className="text-blue-600 font-medium">{assignment.toCostCenterName}</span>
                      <br />
                      <span className="text-xs text-muted-foreground">{assignment.toGroupName}</span>
                    </TableCell>
                    <TableCell>{assignment.days} يوم</TableCell>
                    <TableCell className="font-bold text-red-600">
                      {assignment.totalAmount.toLocaleString('ar-SA')} ر.س
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <p className="text-sm font-medium text-orange-800">
                إجمالي التسوية: {pendingAssignments
                  .filter((a: any) => selectedAssignmentIds.includes(a.assignmentId))
                  .reduce((sum: number, a: any) => sum + a.totalAmount, 0)
                  .toLocaleString('ar-SA')} ر.س
              </p>
              <p className="text-xs text-orange-600 mt-1">
                سيتم خصم هذا المبلغ من هذه الدفعة وإضافته لدفعة المركز المنتدب إليه
              </p>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handleSkipSettlements}>
              تجاهل وأرسل للمراجعة
            </Button>
            <Button
              onClick={handleApplySettlements}
              disabled={applySettlementsMutation.isPending || selectedAssignmentIds.length === 0}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {applySettlementsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري التطبيق...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 ml-2" />
                  نعم، طبّق التسوية
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Batch Notes Component
function BatchNotesSection({ batchId }: { batchId: number }) {
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<"info" | "warning" | "critical">("info");
  const utils = trpc.useUtils();

  const { data: notes, isLoading } = trpc.payroll.getBatchNotes.useQuery({ batchId });

  const addNoteMutation = trpc.payroll.addBatchNote.useMutation({
    onSuccess: () => {
      toast.success("تم إضافة الملاحظة بنجاح");
      setNoteText("");
      setNoteType("info");
      utils.payroll.getBatchNotes.invalidate({ batchId });
    },
    onError: (error) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  const handleAddNote = () => {
    if (!noteText.trim()) {
      toast.error("الرجاء كتابة ملاحظة");
      return;
    }

    addNoteMutation.mutate({
      batchId,
      noteType,
      note: noteText,
    });
  };

  const getNoteTypeColor = (type: string) => {
    switch (type) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-300";
      case "warning":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "info":
      default:
        return "bg-blue-100 text-blue-800 border-blue-300";
    }
  };

  const getNoteTypeLabel = (type: string) => {
    switch (type) {
      case "critical":
        return "هام";
      case "warning":
        return "تحذير";
      case "info":
      default:
        return "معلومة";
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add Note Form */}
      <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
        <div className="flex gap-2">
          <Button
            variant={noteType === "info" ? "default" : "outline"}
            size="sm"
            onClick={() => setNoteType("info")}
          >
            معلومة
          </Button>
          <Button
            variant={noteType === "warning" ? "default" : "outline"}
            size="sm"
            onClick={() => setNoteType("warning")}
          >
            تحذير
          </Button>
          <Button
            variant={noteType === "critical" ? "default" : "outline"}
            size="sm"
            onClick={() => setNoteType("critical")}
          >
            هام
          </Button>
        </div>
        <Textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="اكتب ملاحظتك هنا..."
          rows={3}
          className="resize-none"
        />
        <Button
          onClick={handleAddNote}
          disabled={addNoteMutation.isPending || !noteText.trim()}
        >
          {addNoteMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              جاري الإضافة...
            </>
          ) : (
            "إضافة ملاحظة"
          )}
        </Button>
      </div>

      {/* Notes List */}
      <div className="space-y-3">
        {notes && notes.length > 0 ? (
          notes.map((note: any) => (
            <div
              key={note.id}
              className={`border rounded-lg p-4 ${getNoteTypeColor(note.noteType)}`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-medium px-2 py-1 rounded bg-white/50">
                  {getNoteTypeLabel(note.noteType)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(note.createdAt).toLocaleString("ar-SA")}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{note.note}</p>
              <div className="mt-2 text-xs text-muted-foreground">
                بواسطة: {note.reviewerRole}
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-muted-foreground py-8">
            لا توجد ملاحظات حتى الآن
          </p>
        )}
      </div>
    </div>
  );
}
