import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/payroll/StatusBadge";
import { 
  ArrowLeft, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  AlertCircle,
  AlertTriangle,
  Info
} from "lucide-react";
import { toast } from "sonner";

type ReviewRole = "accountant" | "financial_reviewer" | "accounts_manager";
type NoteType = "critical" | "warning" | "info";

interface PayrollBatchReviewProps {
  role: ReviewRole;
}

export default function PayrollBatchReview({ role }: PayrollBatchReviewProps) {
  const [, setLocation] = useLocation();
  
  // Try to match any of the review routes
  const [matchAccountant, paramsAccountant] = useRoute("/payroll/batches/:id/accountant-review");
  const [matchFinancial, paramsFinancial] = useRoute("/payroll/batches/:id/financial-review");
  const [matchManager, paramsManager] = useRoute("/payroll/batches/:id/manager-review");
  
  const params = paramsAccountant || paramsFinancial || paramsManager;
  const batchId = Number(params?.id);

  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("warning");

  const utils = trpc.useUtils();
  const { data: batch, isLoading } = trpc.payroll.getDetails.useQuery({ batchId });

  const approveMutation = trpc.payroll[
    role === "accountant" ? "accountantApprove" :
    role === "financial_reviewer" ? "financialReviewerApprove" :
    "accountsManagerApprove"
  ].useMutation({
    onSuccess: () => {
      toast.success("تم اعتماد الدفعة بنجاح");
      setShowApproveDialog(false);
      utils.payroll.getDetails.invalidate({ batchId });
      utils.payroll.listBatches.invalidate();
      setLocation("/payroll/batches");
    },
    onError: (error) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  const rejectMutation = trpc.payroll[
    role === "accountant" ? "accountantReject" :
    role === "financial_reviewer" ? "financialReviewerReject" :
    "accountsManagerReject"
  ].useMutation({
    onSuccess: () => {
      toast.success("تم رفض الدفعة وإعادتها للتصحيح");
      setShowRejectDialog(false);
      utils.payroll.getDetails.invalidate({ batchId });
      utils.payroll.listBatches.invalidate();
      setLocation("/payroll/batches");
    },
    onError: (error) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  const handleApprove = () => {
    approveMutation.mutate({ batchId });
  };

  const handleReject = () => {
    if (!rejectNote.trim()) {
      toast.error("يرجى إدخال سبب الرفض");
      return;
    }

    rejectMutation.mutate({
      batchId,
      note: rejectNote,
      noteType,
    });
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

  const roleTitle = 
    role === "accountant" ? "مراجعة المحاسب" :
    role === "financial_reviewer" ? "مراجعة المراجع المالي" :
    "اعتماد مدير الحسابات";

  // ✅ تجميع العمال حسب المجموعة (نفس نظام صفحة المسودة)
  const groupedItems = (batch.items || []).reduce((acc: any, item: any) => {
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
          totalLateMinutes: 0,
          totalEarlyLeaveMinutes: 0,
        },
      };
    }
    acc[groupKey].workers.push(item);
    acc[groupKey].summary.count += 1;
    acc[groupKey].summary.totalBase += parseFloat(item.baseAmount || '0');
    acc[groupKey].summary.totalDeductions += parseFloat(item.totalDeductions || '0');
    acc[groupKey].summary.totalBonuses += parseFloat(item.totalBonuses || '0');
    acc[groupKey].summary.totalNet += parseFloat(item.netAmount || '0');
    acc[groupKey].summary.totalLateMinutes += Number(item.lateMinutes || 0);
    acc[groupKey].summary.totalEarlyLeaveMinutes += Number(item.earlyLeaveMinutes || 0);
    return acc;
  }, {});

  const groupedList: any[] = Object.values(groupedItems || {});

  const getNoteIcon = (type: NoteType) => {
    switch (type) {
      case "critical":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "info":
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getNoteColor = (type: NoteType) => {
    switch (type) {
      case "critical":
        return "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800";
      case "warning":
        return "bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800";
      case "info":
        return "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800";
    }
  };

  return (
    <div className="container py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setLocation("/payroll/batches")}>
            <ArrowLeft className="h-4 w-4 ml-2" />
            العودة
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{roleTitle}</h1>
            <p className="text-muted-foreground">
              دفعة اليومية #{batch.batch.batchCode}
            </p>
          </div>
        </div>
        <StatusBadge status={batch.batch.status as any} />
      </div>

      {/* Warning for rejection count */}
      {(batch.batch.rejectionCount || 0) >= 2 && (
        <Card className="mb-6 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                تحذير: تم رفض هذه الدفعة {batch.batch.rejectionCount} مرات. 
                {(batch.batch.rejectionCount || 0) >= 3 && " الرفض القادم سيكون نهائياً."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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
              إجمالي المبلغ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(batch.items || []).reduce((sum: number, item: any) => sum + parseFloat(item.netAmount || '0'), 0).toLocaleString("ar-SA")} ر.س
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
                ? ((batch.items || []).reduce((sum: number, item: any) => sum + parseFloat(item.netAmount || '0'), 0) / (batch.batch.totalWorkers || 1)).toLocaleString("ar-SA", {
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
              الفترة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {new Date(batch.batch.periodStart).toLocaleDateString("ar-SA", { day: "numeric", month: "short" })} -{" "}
              {new Date(batch.batch.periodEnd).toLocaleDateString("ar-SA", { day: "numeric", month: "short" })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Previous Notes */}
      {batch.notes && batch.notes.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>الملاحظات السابقة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {batch.notes.map((note: any) => (
                <div
                  key={note.id}
                  className={`p-4 rounded-lg border ${getNoteColor(note.noteType)}`}
                >
                  <div className="flex items-start gap-3">
                    {getNoteIcon(note.noteType)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{note.reviewerName}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(note.createdAt).toLocaleString("ar-SA")}
                        </span>
                      </div>
                      <p className="text-sm">{note.note}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Workers Table */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>تفاصيل العمال</CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="text-center">
            <TableHeader>
              <TableRow>
                <TableHead>اسم العامل</TableHead>
                <TableHead> المبلغ</TableHead>
                <TableHead>الخصومات</TableHead>
                <TableHead>الإضافات</TableHead>
                <TableHead>الصافي</TableHead>
                <TableHead>دقائق التأخير</TableHead>
                <TableHead>ناقص الدوام</TableHead>
                <TableHead>ملاحظات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedList.map((group: any) => (
                <>
                  <TableRow key={`group-${group.groupId}`} className="bg-muted/50 font-semibold">
                    <TableCell colSpan={8}>
                      {group.groupName} ({group.summary.count} عامل)
                    </TableCell>
                  </TableRow>
                  {group.workers.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.workerName}</TableCell>
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
                      <TableCell className={Number(item.lateMinutes || 0) > 0 ? "text-red-600" : ""}>
                        {Number(item.lateMinutes || 0)} دقيقة
                      </TableCell>
                      <TableCell className={Number(item.earlyLeaveMinutes || 0) > 0 ? "text-red-600" : ""}>
                        {Number(item.earlyLeaveMinutes || 0)} دقيقة
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.restaurantNames || item.notes || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow key={`total-${group.groupId}`} className="bg-muted/30 font-semibold border-t-2">
                    <TableCell>إجمالي {group.groupName}</TableCell>
                    <TableCell>{group.summary.totalBase.toLocaleString("ar-SA")} ر.س</TableCell>
                    <TableCell className="text-red-600">
                      {group.summary.totalDeductions.toLocaleString("ar-SA")} ر.س
                    </TableCell>
                    <TableCell className="text-green-600">
                      {group.summary.totalBonuses.toLocaleString("ar-SA")} ر.س
                    </TableCell>
                    <TableCell>{group.summary.totalNet.toLocaleString("ar-SA")} ر.س</TableCell>
                    <TableCell>{group.summary.totalLateMinutes} دقيقة</TableCell>
                    <TableCell>{group.summary.totalEarlyLeaveMinutes} دقيقة</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Review Actions */}
      <Card>
        <CardHeader>
          <CardTitle>إجراءات المراجعة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              className="text-red-600 border-red-600 hover:bg-red-50"
              onClick={() => setShowRejectDialog(true)}
            >
              <XCircle className="h-4 w-4 ml-2" />
              رفض الدفعة
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => setShowApproveDialog(true)}
            >
              <CheckCircle className="h-4 w-4 ml-2" />
              اعتماد الدفعة
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الاعتماد</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من اعتماد دفعة العمال #{batch.batch.batchCode}؟
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              إلغاء
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={handleApprove}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الاعتماد...
                </>
              ) : (
                "تأكيد الاعتماد"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض الدفعة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="noteType">نوع الملاحظة</Label>
              <Select value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
                <SelectTrigger id="noteType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">خطيرة (Critical)</SelectItem>
                  <SelectItem value="warning">تحذيرية (Warning)</SelectItem>
                  <SelectItem value="info">معلوماتية (Info)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rejectNote">سبب الرفض</Label>
              <Textarea
                id="rejectNote"
                placeholder="اذكر سبب الرفض والتصحيحات المطلوبة..."
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الرفض...
                </>
              ) : (
                "تأكيد الرفض"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
