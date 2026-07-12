import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from 'sonner';
import { Users, UserX, Clock, CheckCircle, XCircle, ArrowRight, Filter, CalendarDays, ArrowLeftRight, AlertTriangle, ShieldCheck } from "lucide-react";

type TabType = 'present' | 'absent' | 'late';

export default function OperationalDashboard() {
  const [selectedDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  const [filterGroupId, setFilterGroupId] = useState<number | undefined>();
  const [filterCostCenterId, setFilterCostCenterId] = useState<number | undefined>();
  
  // Action dialog state (confirm attendance / confirm absence)
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    workerId: number;
    workerName: string;
    groupId?: number;
    costCenterId?: number;
    actionType: 'confirm_attendance' | 'confirm_absence';
  } | null>(null);
  const [actionNote, setActionNote] = useState('');

  // Transfer dialog state
  const [transferDialog, setTransferDialog] = useState<{
    open: boolean;
    workerId: number;
    workerName: string;
    groupId?: number;
    costCenterId?: number;
    step: 'notes' | 'confirm';
  } | null>(null);
  const [transferNote, setTransferNote] = useState('');
  const [transferNoteError, setTransferNoteError] = useState('');

  const { user } = useAuth();
  const isSupervisor = user?.role === 'supervisor_tolan' || user?.role === 'supervisor_malqa';
  const isSupervisorTolan = user?.role === 'supervisor_tolan';

  const { data: groupsData } = trpc.groups.list.useQuery();
  const { data: costCentersData } = trpc.costCenters.list.useQuery();
  const { data: userCostCenters } = trpc.costCenters.getUserCostCenters.useQuery(
    { userId: user?.id || 0 },
    { enabled: isSupervisor && !!user?.id }
  );

  // Auto-select cost center for Tolan supervisor
  const autoSelectedCostCenterId = useMemo(() => {
    if (isSupervisorTolan && userCostCenters && userCostCenters.length > 0) {
      return userCostCenters[0].costCenterId;
    }
    return undefined;
  }, [isSupervisorTolan, userCostCenters]);

  // Override filterCostCenterId for Tolan supervisor
  const effectiveCostCenterId = useMemo(() => {
    if (isSupervisorTolan && autoSelectedCostCenterId) {
      return autoSelectedCostCenterId;
    }
    return filterCostCenterId;
  }, [isSupervisorTolan, autoSelectedCostCenterId, filterCostCenterId]);

  const filteredGroups = useMemo(() => {
    if (!groupsData) return [];
    return groupsData;
  }, [groupsData]);

  const filteredCostCenters = useMemo(() => {
    if (!costCentersData) return [];
    return costCentersData;
  }, [costCentersData]);

  const { data: stats, isLoading: statsLoading } = trpc.operationalDashboard.getStats.useQuery({
    workDateStr: selectedDate,
    groupId: filterGroupId,
    costCenterId: effectiveCostCenterId,
  });

  const { data: presentWorkers, isLoading: presentLoading } = trpc.operationalDashboard.getPresentWorkers.useQuery(
    { workDateStr: selectedDate, groupId: filterGroupId, costCenterId: effectiveCostCenterId },
    { enabled: activeTab === 'present' }
  );

  const { data: absentWorkers, isLoading: absentLoading } = trpc.operationalDashboard.getAbsentWorkers.useQuery(
    { workDateStr: selectedDate, groupId: filterGroupId, costCenterId: effectiveCostCenterId },
    { enabled: activeTab === 'absent' }
  );

  const { data: lateWorkers, isLoading: lateLoading } = trpc.operationalDashboard.getLateWorkers.useQuery(
    { workDateStr: selectedDate, groupId: filterGroupId, costCenterId: effectiveCostCenterId },
    { enabled: activeTab === 'late' }
  );

  // جلب حالة تأكيد الحضور للعمال في هذا التاريخ
  const { data: confirmedWorkerIds } = trpc.operationalDashboard.getConfirmedWorkerIds.useQuery(
    { workDateStr: selectedDate },
    { enabled: activeTab === 'present' }
  );
  const confirmedSet = useMemo(() => new Set(confirmedWorkerIds || []), [confirmedWorkerIds]);

  const utils = trpc.useUtils();

  // Mutation لإنشاء بلاغات تلقائية للعمال غير المؤكدين
  const generateUnconfirmedMutation = trpc.operationalDashboard.generateUnconfirmedFlags.useMutation({
    onSuccess: (data) => {
      if (data.createdCount > 0) {
        toast.success(`تم إنشاء ${data.createdCount} ملاحظة تشغيلية`, { description: 'للعمال الحاضرين الذين لم يتم تأكيد حضورهم' });
      } else {
        toast.info('جميع العمال الحاضرين تم تأكيد حضورهم', { description: 'لا توجد ملاحظات جديدة' });
      }
      utils.operationalDashboard.invalidate();
    },
    onError: (error) => {
      toast.error('خطأ', { description: error.message });
    },
  });

  const createFlagMutation = trpc.operationalDashboard.createFlag.useMutation({
    onSuccess: (_, variables) => {
      if (variables.flagType === 'transfer') {
        toast.success("تم إرسال بلاغ النقل بنجاح", { description: "ستتم مراجعته من قبل المسؤول في معالجة الملاحظات" });
      } else {
        toast.success("تم إرسال الملاحظة التشغيلية بنجاح", { description: "ستتم مراجعتها من قبل المسؤول" });
      }
      setActionDialog(null);
      setTransferDialog(null);
      setActionNote('');
      setTransferNote('');
      setTransferNoteError('');
      utils.operationalDashboard.invalidate();
      utils.operationalDashboard.getConfirmedWorkerIds.invalidate();
    },
    onError: (error) => {
      toast.error("خطأ", { description: error.message });
    },
  });

  const handleAction = (
    workerId: number,
    workerName: string,
    actionType: 'confirm_attendance' | 'confirm_absence',
    groupId?: number | null,
    costCenterId?: number | null
  ) => {
    setActionDialog({
      open: true,
      workerId,
      workerName,
      groupId: groupId || undefined,
      costCenterId: costCenterId || undefined,
      actionType,
    });
    setActionNote('');
  };

  const handleTransfer = (
    workerId: number,
    workerName: string,
    groupId?: number | null,
    costCenterId?: number | null
  ) => {
    setTransferDialog({
      open: true,
      workerId,
      workerName,
      groupId: groupId || undefined,
      costCenterId: costCenterId || undefined,
      step: 'notes',
    });
    setTransferNote('');
    setTransferNoteError('');
  };

  const handleTransferSave = () => {
    if (!transferNote.trim()) {
      setTransferNoteError('يرجى كتابة ملاحظة توضح من أين تم نقل العامل وإلى أين');
      return;
    }
    setTransferNoteError('');
    // Move to confirmation step
    setTransferDialog(prev => prev ? { ...prev, step: 'confirm' } : null);
  };

  const handleTransferConfirm = () => {
    if (!transferDialog) return;
    createFlagMutation.mutate({
      workerId: transferDialog.workerId,
      groupId: transferDialog.groupId,
      costCenterId: transferDialog.costCenterId,
      flagDate: selectedDate,
      flagType: 'transfer',
      description: transferNote.trim(),
    });
  };

  const handleTransferBack = () => {
    setTransferDialog(prev => prev ? { ...prev, step: 'notes' } : null);
  };

  const submitAction = () => {
    if (!actionDialog) return;
    const description = actionNote.trim() || (actionDialog.actionType === 'confirm_attendance' ? 'تأكيد حضور العامل' : 'تأكيد غياب العامل');
    createFlagMutation.mutate({
      workerId: actionDialog.workerId,
      groupId: actionDialog.groupId,
      costCenterId: actionDialog.costCenterId,
      flagDate: selectedDate,
      flagType: actionDialog.actionType,
      description,
    });
  };

  const currentWorkers = useMemo(() => {
    if (activeTab === 'present') return presentWorkers || [];
    if (activeTab === 'absent') return absentWorkers || [];
    if (activeTab === 'late') return lateWorkers || [];
    return [];
  }, [activeTab, presentWorkers, absentWorkers, lateWorkers]);

  const isLoadingWorkers = activeTab === 'present' ? presentLoading : activeTab === 'absent' ? absentLoading : lateLoading;

  const tabTitle = activeTab === 'present' ? 'الحاضرون' : activeTab === 'absent' ? 'الغائبون' : activeTab === 'late' ? 'المتأخرون' : '';

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatTime = (date: Date | string | null) => {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">العمليات التشغيلية</h1>
            <p className="text-muted-foreground flex items-center gap-2 mt-1">
              <CalendarDays className="h-4 w-4" />
              {formatDate(selectedDate)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            className={`cursor-pointer transition-all duration-200 hover:shadow-lg border-2 ${activeTab === 'present' ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-transparent hover:border-emerald-200'}`}
            onClick={() => setActiveTab(activeTab === 'present' ? null : 'present')}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">الحاضرون</p>
                  <p className="text-3xl font-bold text-emerald-600 mt-1">
                    {statsLoading ? '...' : stats?.presentCount || 0}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <Users className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
              {activeTab === 'present' && (
                <div className="mt-3 flex items-center text-sm text-emerald-600">
                  <ArrowRight className="h-4 w-4 ml-1" />
                  عرض التفاصيل
                </div>
              )}
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-all duration-200 hover:shadow-lg border-2 ${activeTab === 'absent' ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20' : 'border-transparent hover:border-red-200'}`}
            onClick={() => setActiveTab(activeTab === 'absent' ? null : 'absent')}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">الغائبون</p>
                  <p className="text-3xl font-bold text-red-600 mt-1">
                    {statsLoading ? '...' : stats?.absentCount || 0}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <UserX className="h-6 w-6 text-red-600" />
                </div>
              </div>
              {activeTab === 'absent' && (
                <div className="mt-3 flex items-center text-sm text-red-600">
                  <ArrowRight className="h-4 w-4 ml-1" />
                  عرض التفاصيل
                </div>
              )}
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-all duration-200 hover:shadow-lg border-2 ${activeTab === 'late' ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20' : 'border-transparent hover:border-amber-200'}`}
            onClick={() => setActiveTab(activeTab === 'late' ? null : 'late')}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">المتأخرون</p>
                  <p className="text-3xl font-bold text-amber-600 mt-1">
                    {statsLoading ? '...' : stats?.lateCount || 0}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
              </div>
              {activeTab === 'late' && (
                <div className="mt-3 flex items-center text-sm text-amber-600">
                  <ArrowRight className="h-4 w-4 ml-1" />
                  عرض التفاصيل
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {activeTab && (
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  {tabTitle} - قائمة العمال
                </CardTitle>
                <div className="flex flex-wrap gap-3">
                  <Select
                    value={filterGroupId ? String(filterGroupId) : "all"}
                    onValueChange={(v) => setFilterGroupId(v === "all" ? undefined : Number(v))}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="كل المجموعات" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل المجموعات</SelectItem>
                      {filteredGroups.map((g: any) => (
                        <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {isSupervisorTolan ? (
                    <div className="w-[200px] px-3 py-2 border rounded-md bg-muted text-muted-foreground">
                      {autoSelectedCostCenterId && costCentersData
                        ? costCentersData.find((cc: any) => cc.id === autoSelectedCostCenterId)?.name || 'مركز التكلفة'
                        : 'مركز التكلفة'}
                    </div>
                  ) : (
                    <Select
                      value={filterCostCenterId ? String(filterCostCenterId) : "all"}
                      onValueChange={(v) => setFilterCostCenterId(v === "all" ? undefined : Number(v))}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="كل مراكز التكلفة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل مراكز التكلفة</SelectItem>
                        {filteredCostCenters.map((cc: any) => (
                          <SelectItem key={cc.id} value={String(cc.id)}>{cc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingWorkers ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <span className="mr-3 text-muted-foreground">جاري التحميل...</span>
                </div>
              ) : currentWorkers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>لا يوجد عمال في هذه الفئة</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">الكود</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">اسم العامل</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">المجموعة</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">مركز التكلفة</th>
                        {activeTab === 'present' && (
                          <>
                            <th className="text-right py-3 px-4 font-medium text-muted-foreground">وقت الحضور</th>
                            <th className="text-center py-3 px-4 font-medium text-muted-foreground">حالة التأكيد</th>
                          </>
                        )}
                        {activeTab === 'late' && (
                          <>
                            <th className="text-right py-3 px-4 font-medium text-muted-foreground">وقت الحضور</th>
                            <th className="text-right py-3 px-4 font-medium text-muted-foreground">دقائق التأخير</th>
                          </>
                        )}
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentWorkers.map((worker: any) => (
                        <tr key={worker.workerId} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 font-mono text-sm">{worker.workerCode}</td>
                          <td className="py-3 px-4 font-medium">{worker.workerName}</td>
                          <td className="py-3 px-4 text-muted-foreground">{worker.groupName || '-'}</td>
                          <td className="py-3 px-4 text-muted-foreground">{worker.costCenterName || '-'}</td>
                          {activeTab === 'present' && (
                            <>
                              <td className="py-3 px-4">
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                                  {formatTime(worker.checkInTime)}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 text-center">
                                {confirmedSet.has(worker.workerId) ? (
                                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 gap-1">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    مؤكد
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 gap-1 border-amber-300">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    غير مؤكد
                                  </Badge>
                                )}
                              </td>
                            </>
                          )}
                          {activeTab === 'late' && (
                            <>
                              <td className="py-3 px-4">
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                                  {formatTime(worker.checkInTime)}
                                </Badge>
                              </td>
                              <td className="py-3 px-4">
                                <Badge variant="destructive" className="bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400">
                                  {worker.lateMinutes} دقيقة
                                </Badge>
                              </td>
                            </>
                          )}
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-2 flex-wrap">
                              {activeTab === 'absent' ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAction(worker.workerId, worker.workerName, 'confirm_attendance', worker.groupId, worker.costCenterId);
                                    }}
                                  >
                                    <CheckCircle className="h-4 w-4 ml-1" />
                                    تأكيد حضور
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 border-red-300 hover:bg-red-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAction(worker.workerId, worker.workerName, 'confirm_absence', worker.groupId, worker.costCenterId);
                                    }}
                                  >
                                    <XCircle className="h-4 w-4 ml-1" />
                                    تأكيد غياب
                                  </Button>
                                </>
                              ) : activeTab === 'present' ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAction(worker.workerId, worker.workerName, 'confirm_attendance', worker.groupId, worker.costCenterId);
                                    }}
                                  >
                                    <CheckCircle className="h-4 w-4 ml-1" />
                                    تأكيد حضور
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 border-red-300 hover:bg-red-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAction(worker.workerId, worker.workerName, 'confirm_absence', worker.groupId, worker.costCenterId);
                                    }}
                                  >
                                    <XCircle className="h-4 w-4 ml-1" />
                                    تأكيد غياب
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAction(worker.workerId, worker.workerName, 'confirm_attendance', worker.groupId, worker.costCenterId);
                                    }}
                                  >
                                    <CheckCircle className="h-4 w-4 ml-1" />
                                    تأكيد حضور
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 border-red-300 hover:bg-red-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAction(worker.workerId, worker.workerName, 'confirm_absence', worker.groupId, worker.costCenterId);
                                    }}
                                  >
                                    <XCircle className="h-4 w-4 ml-1" />
                                    تأكيد غياب
                                  </Button>
                                </>
                              )}
                              {/* Transfer Button - بلون مميز */}
                              <Button
                                size="sm"
                                className="bg-violet-600 hover:bg-violet-700 text-white border-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTransfer(worker.workerId, worker.workerName, worker.groupId, worker.costCenterId);
                                }}
                              >
                                <ArrowLeftRight className="h-4 w-4 ml-1" />
                                Transfer
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* زر إنشاء ملاحظات تلقائية للعمال غير المؤكدين */}
              {activeTab === 'present' && currentWorkers.length > 0 && (
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span>
                      {currentWorkers.filter((w: any) => !confirmedSet.has(w.workerId)).length > 0
                        ? `${currentWorkers.filter((w: any) => !confirmedSet.has(w.workerId)).length} عامل لم يتم تأكيد حضورهم`
                        : 'جميع العمال تم تأكيد حضورهم ✅'
                      }
                    </span>
                  </div>
                  {currentWorkers.filter((w: any) => !confirmedSet.has(w.workerId)).length > 0 && (
                    <Button
                      variant="outline"
                      className="text-amber-600 border-amber-300 hover:bg-amber-50"
                      onClick={() => generateUnconfirmedMutation.mutate({
                        workDateStr: selectedDate,
                        groupId: filterGroupId,
                        costCenterId: effectiveCostCenterId,
                      })}
                      disabled={generateUnconfirmedMutation.isPending}
                    >
                      <AlertTriangle className="h-4 w-4 ml-1" />
                      {generateUnconfirmedMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء ملاحظات لغير المؤكدين'}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Dialog: Confirm Attendance / Absence */}
        <Dialog open={!!actionDialog?.open} onOpenChange={(open) => !open && setActionDialog(null)}>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>
                {actionDialog?.actionType === 'confirm_attendance' ? (
                  <span className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle className="h-5 w-5" />
                    تأكيد حضور العامل
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-red-600">
                    <XCircle className="h-5 w-5" />
                    تأكيد غياب العامل
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm text-muted-foreground">العامل</p>
                <p className="font-medium">{actionDialog?.workerName}</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">ملاحظات (اختياري)</label>
                <Textarea
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="أضف ملاحظة توضيحية..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setActionDialog(null)}>
                إلغاء
              </Button>
              <Button
                onClick={submitAction}
                disabled={createFlagMutation.isPending}
                className={actionDialog?.actionType === 'confirm_attendance' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
              >
                {createFlagMutation.isPending ? 'جاري الإرسال...' : 'تأكيد وإرسال'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Transfer - Step 1: Notes */}
        <Dialog
          open={!!transferDialog?.open && transferDialog?.step === 'notes'}
          onOpenChange={(open) => !open && setTransferDialog(null)}
        >
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>
                <span className="flex items-center gap-2 text-violet-600">
                  <ArrowLeftRight className="h-5 w-5" />
                  نقل العامل | Transfer Worker
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm text-muted-foreground">العامل</p>
                <p className="font-medium">{transferDialog?.workerName}</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  ملاحظات <span className="text-red-500">*</span>
                  <span className="text-xs text-muted-foreground mr-2">(من أين تم نقل العامل وإلى أين)</span>
                </label>
                <Textarea
                  value={transferNote}
                  onChange={(e) => {
                    setTransferNote(e.target.value);
                    if (e.target.value.trim()) setTransferNoteError('');
                  }}
                  placeholder="مثال: نقل من تولان إلى الملقا..."
                  rows={3}
                  className={transferNoteError ? 'border-red-500' : ''}
                />
                {transferNoteError && (
                  <p className="text-sm text-red-500 mt-1">{transferNoteError}</p>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setTransferDialog(null)}>
                إلغاء
              </Button>
              <Button
                onClick={handleTransferSave}
                className="bg-violet-600 hover:bg-violet-700"
              >
                SAVE
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Transfer - Step 2: Confirmation */}
        <Dialog
          open={!!transferDialog?.open && transferDialog?.step === 'confirm'}
          onOpenChange={(open) => !open && setTransferDialog(null)}
        >
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>
                <span className="flex items-center gap-2 text-violet-600">
                  <ArrowLeftRight className="h-5 w-5" />
                  تأكيد نقل العامل | Confirm Transfer
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-lg p-4 text-center">
                <p className="text-base font-medium text-violet-800 dark:text-violet-300 mb-2">
                  هل أنت متأكد من رغبتك في تحويل/انتداب هذا العامل؟
                </p>
                <p className="text-sm text-violet-600 dark:text-violet-400" dir="ltr">
                  Are you sure you want to transfer this worker?
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm text-muted-foreground">العامل</p>
                <p className="font-medium">{transferDialog?.workerName}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm text-muted-foreground">الملاحظات</p>
                <p className="text-sm">{transferNote}</p>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleTransferBack}>
                تراجع / Back
              </Button>
              <Button
                onClick={handleTransferConfirm}
                disabled={createFlagMutation.isPending}
                className="bg-violet-600 hover:bg-violet-700"
              >
                {createFlagMutation.isPending ? 'جاري الإرسال...' : 'تأكيد / Confirm'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
