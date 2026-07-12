import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from 'sonner';
import { ClipboardCheck, CheckCircle, XCircle, Clock, Filter, FileText, AlertTriangle } from "lucide-react";

export default function OperationalNotesReview() {
  const [filterStatus, setFilterStatus] = useState<string>("pending");
  const [filterFlagType, setFilterFlagType] = useState<string | undefined>();
  const [filterGroupId, setFilterGroupId] = useState<number | undefined>();
  const [filterCostCenterId, setFilterCostCenterId] = useState<number | undefined>();

  // Review dialog
  const [reviewDialog, setReviewDialog] = useState<{
    open: boolean;
    flagId: number;
    action: 'approve' | 'reject';
    workerName: string;
    flagType: string;
    description: string;
  } | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const { data: groupsData } = trpc.groups.list.useQuery();
  const { data: costCentersData } = trpc.costCenters.list.useQuery();

  const { data: flags, isLoading } = trpc.operationalDashboard.getFlags.useQuery({
    status: filterStatus || undefined,
    flagType: filterFlagType,
    groupId: filterGroupId,
    costCenterId: filterCostCenterId,
  });

  const { data: pendingCount } = trpc.operationalDashboard.getPendingCount.useQuery();

  const utils = trpc.useUtils();

  const approveMutation = trpc.operationalDashboard.approveFlag.useMutation({
    onSuccess: () => {
      toast.success("تمت الموافقة بنجاح", { description: "تم اعتماد الملاحظة التشغيلية" });
      setReviewDialog(null);
      setReviewNote('');
      utils.operationalDashboard.invalidate();
    },
    onError: (error) => {
      toast.error("خطأ", { description: error.message });
    },
  });

  const rejectMutation = trpc.operationalDashboard.rejectFlag.useMutation({
    onSuccess: () => {
      toast.success("تم الرفض", { description: "تم رفض الملاحظة التشغيلية" });
      setReviewDialog(null);
      setReviewNote('');
      utils.operationalDashboard.invalidate();
    },
    onError: (error) => {
      toast.error("خطأ", { description: error.message });
    },
  });

  const handleReview = (flagId: number, action: 'approve' | 'reject', workerName: string, flagType: string, description: string) => {
    setReviewDialog({ open: true, flagId, action, workerName, flagType, description });
    setReviewNote('');
  };

  const submitReview = () => {
    if (!reviewDialog) return;
    if (reviewDialog.action === 'approve') {
      approveMutation.mutate({ flagId: reviewDialog.flagId, notes: reviewNote || undefined });
    } else {
      rejectMutation.mutate({ flagId: reviewDialog.flagId, notes: reviewNote || undefined });
    }
  };

  const getFlagTypeBadge = (flagType: string) => {
    switch (flagType) {
      case 'confirm_attendance':
        return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">تأكيد حضور</Badge>;
      case 'confirm_absence':
        return <Badge className="bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400">تأكيد غياب</Badge>;
      default:
        return <Badge variant="secondary">أخرى</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400"><Clock className="h-3 w-3 ml-1" />معلقة</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400"><CheckCircle className="h-3 w-3 ml-1" />موافق عليها</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-950/30 dark:text-red-400"><XCircle className="h-3 w-3 ml-1" />مرفوضة</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatDateTime = (date: string | Date | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ClipboardCheck className="h-7 w-7 text-primary" />
              معالجات الملاحظات التشغيلية
            </h1>
            <p className="text-muted-foreground mt-1">
              مراجعة واعتماد الملاحظات التشغيلية المرسلة من المشرفين
            </p>
          </div>
          {pendingCount !== undefined && pendingCount > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <span className="text-amber-700 dark:text-amber-400 font-medium">{pendingCount} ملاحظة معلقة</span>
            </div>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              الفلاتر
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Select
                value={filterStatus || "all"}
                onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="pending">معلقة</SelectItem>
                  <SelectItem value="approved">موافق عليها</SelectItem>
                  <SelectItem value="rejected">مرفوضة</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filterFlagType || "all"}
                onValueChange={(v) => setFilterFlagType(v === "all" ? undefined : v)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="نوع الملاحظة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  <SelectItem value="confirm_attendance">تأكيد حضور</SelectItem>
                  <SelectItem value="confirm_absence">تأكيد غياب</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filterGroupId ? String(filterGroupId) : "all"}
                onValueChange={(v) => setFilterGroupId(v === "all" ? undefined : Number(v))}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="المجموعة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المجموعات</SelectItem>
                  {groupsData?.map((g: any) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filterCostCenterId ? String(filterCostCenterId) : "all"}
                onValueChange={(v) => setFilterCostCenterId(v === "all" ? undefined : Number(v))}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="مركز التكلفة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل مراكز التكلفة</SelectItem>
                  {costCentersData?.map((cc: any) => (
                    <SelectItem key={cc.id} value={String(cc.id)}>{cc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Flags Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="mr-3 text-muted-foreground">جاري التحميل...</span>
              </div>
            ) : !flags || flags.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>لا توجد ملاحظات تشغيلية</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">#</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">العامل</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">المجموعة</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">مركز التكلفة</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">التاريخ</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">النوع</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">الوصف</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">الحالة</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">أنشئ بواسطة</th>
                      <th className="text-center py-3 px-4 font-medium text-muted-foreground">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flags.map((flag: any) => (
                      <tr key={flag.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 text-sm text-muted-foreground">{flag.id}</td>
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium">{flag.workerName}</p>
                            <p className="text-xs text-muted-foreground">{flag.workerCode}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{flag.groupName || '-'}</td>
                        <td className="py-3 px-4 text-muted-foreground">{flag.costCenterName || '-'}</td>
                        <td className="py-3 px-4 text-sm">{formatDate(flag.flagDate)}</td>
                        <td className="py-3 px-4">{getFlagTypeBadge(flag.flagType)}</td>
                        <td className="py-3 px-4 text-sm max-w-[200px] truncate">{flag.description}</td>
                        <td className="py-3 px-4">{getStatusBadge(flag.status)}</td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          <div>
                            <p>{flag.createdByName || '-'}</p>
                            <p className="text-xs">{formatDateTime(flag.createdAt)}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {flag.status === 'pending' ? (
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                                onClick={() => handleReview(flag.id, 'approve', flag.workerName, flag.flagType, flag.description)}
                              >
                                <CheckCircle className="h-4 w-4 ml-1" />
                                موافقة
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 border-red-300 hover:bg-red-50"
                                onClick={() => handleReview(flag.id, 'reject', flag.workerName, flag.flagType, flag.description)}
                              >
                                <XCircle className="h-4 w-4 ml-1" />
                                رفض
                              </Button>
                            </div>
                          ) : (
                            <div className="text-center text-sm text-muted-foreground">
                              {flag.approvalNotes && (
                                <p className="text-xs italic">"{flag.approvalNotes}"</p>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Review Dialog */}
        <Dialog open={!!reviewDialog?.open} onOpenChange={(open) => !open && setReviewDialog(null)}>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>
                {reviewDialog?.action === 'approve' ? (
                  <span className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle className="h-5 w-5" />
                    الموافقة على الملاحظة التشغيلية
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-red-600">
                    <XCircle className="h-5 w-5" />
                    رفض الملاحظة التشغيلية
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">العامل:</span>
                  <span className="font-medium">{reviewDialog?.workerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">النوع:</span>
                  <span>{reviewDialog?.flagType === 'confirm_attendance' ? 'تأكيد حضور' : 'تأكيد غياب'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">الوصف:</span>
                  <span className="text-sm">{reviewDialog?.description}</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">ملاحظات المراجعة (اختياري)</label>
                <Textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="أضف ملاحظة على قرارك..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setReviewDialog(null)}>
                إلغاء
              </Button>
              <Button
                onClick={submitReview}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                className={reviewDialog?.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
              >
                {(approveMutation.isPending || rejectMutation.isPending) ? 'جاري المعالجة...' : reviewDialog?.action === 'approve' ? 'تأكيد الموافقة' : 'تأكيد الرفض'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
