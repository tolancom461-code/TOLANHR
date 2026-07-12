import { useState } from "react";
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
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftRight, Plus, X, Filter, RefreshCw, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function TemporaryAssignments() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filterCostCenter, setFilterCostCenter] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("active");

  // Form state for create
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("");
  const [toCostCenterId, setToCostCenterId] = useState<string>("");
  const [toGroupId, setToGroupId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  // Edit dialog state
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    id: number;
    workerName: string;
    toCostCenterId: string;
    toGroupId: string;
    startDate: string;
    endDate: string;
    notes: string;
  } | null>(null);
  const [editError, setEditError] = useState("");

  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    id: number;
    workerName: string;
  } | null>(null);

  // Queries
  const { data: assignments, refetch, isLoading } = trpc.temporaryAssignments.list.useQuery({
    costCenterId: filterCostCenter ? parseInt(filterCostCenter) : undefined,
    status: filterStatus || undefined,
  });
  const { data: costCenters } = trpc.costCenters.list.useQuery();
  const { data: allGroups } = trpc.groups.list.useQuery();
  const { data: allWorkers } = trpc.workers.list.useQuery();

  // Mutations
  const createMutation = trpc.temporaryAssignments.create.useMutation({
    onSuccess: () => {
      toast.success("تم إنشاء الانتداب بنجاح");
      setIsCreateOpen(false);
      resetForm();
      refetch();
    },
    onError: (err) => {
      setFormError(err.message);
    },
  });

  const cancelMutation = trpc.temporaryAssignments.cancel.useMutation({
    onSuccess: () => {
      toast.success("تم إلغاء الانتداب بنجاح");
      refetch();
    },
    onError: (err) => {
      toast.error("خطأ", { description: err.message });
    },
  });

  const updateMutation = trpc.temporaryAssignments.update.useMutation({
    onSuccess: () => {
      toast.success("تم تعديل الانتداب بنجاح");
      setEditDialog(null);
      setEditError("");
      refetch();
    },
    onError: (err) => {
      setEditError(err.message);
    },
  });

  const deleteMutation = trpc.temporaryAssignments.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف الانتداب بنجاح");
      setDeleteDialog(null);
      refetch();
    },
    onError: (err) => {
      toast.error("خطأ في الحذف", { description: err.message });
    },
  });

  const resetForm = () => {
    setSelectedGroupId("");
    setSelectedWorkerId("");
    setToCostCenterId("");
    setToGroupId("");
    setStartDate("");
    setEndDate("");
    setNotes("");
    setFormError("");
  };

  // Filter workers by selected group
  const filteredWorkers = selectedGroupId
    ? (allWorkers || []).filter((w: any) => w.groupId === parseInt(selectedGroupId))
    : [];

  // Get the selected worker's cost center to exclude from "to" options
  const selectedWorker = selectedWorkerId
    ? (allWorkers || []).find((w: any) => w.id === parseInt(selectedWorkerId))
    : null;
  const selectedGroup = selectedWorker
    ? (allGroups || []).find((g: any) => g.id === selectedWorker.groupId)
    : null;
  const workerCostCenterId = selectedGroup?.costCenterId;

  // Available cost centers for "to" (exclude worker's current)
  const availableToCostCenters = (costCenters || []).filter(
    (cc: any) => cc.id !== workerCostCenterId
  );

  // Filter groups by selected "to" cost center
  const availableToGroups = toCostCenterId
    ? (allGroups || []).filter((g: any) => g.costCenterId === parseInt(toCostCenterId))
    : [];

  const handleCreate = () => {
    setFormError("");
    if (!selectedWorkerId || !toCostCenterId || !toGroupId || !startDate || !endDate) {
      setFormError("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setFormError("تاريخ النهاية يجب أن يكون بعد تاريخ البداية");
      return;
    }
    createMutation.mutate({
      workerId: parseInt(selectedWorkerId),
      toCostCenterId: parseInt(toCostCenterId),
      toGroupId: parseInt(toGroupId),
      startDate,
      endDate,
      notes: notes || undefined,
    });
  };

  const handleCancel = (id: number) => {
    if (window.confirm("هل أنت متأكد من إلغاء هذا الانتداب؟")) {
      cancelMutation.mutate({ id });
    }
  };

  const handleEditOpen = (assignment: any) => {
    const sd = assignment.startDate ? new Date(assignment.startDate).toLocaleDateString('en-CA') : '';
    const ed = assignment.endDate ? new Date(assignment.endDate).toLocaleDateString('en-CA') : '';
    setEditDialog({
      open: true,
      id: assignment.id,
      workerName: assignment.workerName || '',
      toCostCenterId: assignment.toCostCenterId ? assignment.toCostCenterId.toString() : '',
      toGroupId: assignment.toGroupId ? assignment.toGroupId.toString() : '',
      startDate: sd,
      endDate: ed,
      notes: assignment.notes || '',
    });
    setEditError("");
  };

  const handleEditSave = () => {
    if (!editDialog) return;
    setEditError("");
    if (!editDialog.toCostCenterId || !editDialog.toGroupId || !editDialog.startDate || !editDialog.endDate) {
      setEditError("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    if (new Date(editDialog.endDate) < new Date(editDialog.startDate)) {
      setEditError("تاريخ النهاية يجب أن يكون بعد تاريخ البداية");
      return;
    }
    updateMutation.mutate({
      id: editDialog.id,
      toCostCenterId: parseInt(editDialog.toCostCenterId),
      toGroupId: parseInt(editDialog.toGroupId),
      startDate: editDialog.startDate,
      endDate: editDialog.endDate,
      notes: editDialog.notes || undefined,
    });
  };

  const handleDeleteOpen = (assignment: any) => {
    setDeleteDialog({
      open: true,
      id: assignment.id,
      workerName: assignment.workerName || '',
    });
  };

  const handleDeleteConfirm = () => {
    if (!deleteDialog) return;
    deleteMutation.mutate({ id: deleteDialog.id });
  };

  const formatDate = (date: any) => {
    if (!date) return "-";
    const d = new Date(date);
    return d.toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  const calculateDays = (start: any, end: any) => {
    if (!start || !end) return 0;
    const s = new Date(start);
    const e = new Date(end);
    const diff = e.getTime() - s.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">الانتدابات المؤقتة</h1>
            <p className="text-sm text-muted-foreground">
              إدارة انتداب العمال بين مراكز التكلفة المختلفة
            </p>
          </div>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              انتداب جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]" dir="rtl">
            <DialogHeader>
              <DialogTitle>إنشاء انتداب مؤقت</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                  {formError}
                </div>
              )}

              {/* Group Selection */}
              <div className="space-y-2">
                <Label>المجموعة</Label>
                <Select value={selectedGroupId} onValueChange={(val) => {
                  setSelectedGroupId(val);
                  setSelectedWorkerId("");
                  setToCostCenterId("");
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المجموعة" />
                  </SelectTrigger>
                  <SelectContent>
                    {(allGroups || []).map((g: any) => (
                      <SelectItem key={g.id} value={g.id.toString()}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Worker Selection */}
              <div className="space-y-2">
                <Label>العامل *</Label>
                <Select value={selectedWorkerId} onValueChange={(val) => {
                  setSelectedWorkerId(val);
                  setToCostCenterId("");
                }} disabled={!selectedGroupId}>
                  <SelectTrigger>
                    <SelectValue placeholder={selectedGroupId ? "اختر العامل" : "اختر المجموعة أولاً"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredWorkers.map((w: any) => (
                      <SelectItem key={w.id} value={w.id.toString()}>
                        {w.fullName} ({w.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedGroup && (
                  <p className="text-xs text-muted-foreground">
                    مركز التكلفة الحالي: <strong>{(costCenters || []).find((cc: any) => cc.id === workerCostCenterId)?.name || "غير محدد"}</strong>
                  </p>
                )}
              </div>

              {/* To Cost Center */}
              <div className="space-y-2">
                <Label>مركز التكلفة المنتدب إليه *</Label>
                <Select value={toCostCenterId} onValueChange={(val) => { setToCostCenterId(val); setToGroupId(""); }} disabled={!selectedWorkerId}>
                  <SelectTrigger>
                    <SelectValue placeholder={selectedWorkerId ? "اختر مركز التكلفة" : "اختر العامل أولاً"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableToCostCenters.map((cc: any) => (
                      <SelectItem key={cc.id} value={cc.id.toString()}>
                        {cc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* To Group */}
              <div className="space-y-2">
                <Label>المجموعة المنتدب إليها *</Label>
                <Select value={toGroupId} onValueChange={setToGroupId} disabled={!toCostCenterId}>
                  <SelectTrigger>
                    <SelectValue placeholder={toCostCenterId ? "اختر المجموعة" : "اختر مركز التكلفة أولاً"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableToGroups.map((g: any) => (
                      <SelectItem key={g.id} value={g.id.toString()}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>تاريخ البداية *</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>تاريخ النهاية *</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              {startDate && endDate && new Date(endDate) >= new Date(startDate) && (
                <p className="text-xs text-blue-600">
                  مدة الانتداب: <strong>{calculateDays(startDate, endDate)} يوم</strong>
                </p>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label>ملاحظات</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="سبب الانتداب أو أي ملاحظات..."
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <DialogClose asChild>
                <Button variant="outline">إلغاء</Button>
              </DialogClose>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "جاري الإنشاء..." : "إنشاء الانتداب"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">تصفية:</span>
            </div>
            <Select value={filterCostCenter} onValueChange={setFilterCostCenter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="كل مراكز التكلفة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل مراكز التكلفة</SelectItem>
                {(costCenters || []).map((cc: any) => (
                  <SelectItem key={cc.id} value={cc.id.toString()}>
                    {cc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
              <RefreshCw className="h-3 w-3" />
              تحديث
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">
                {(assignments || []).filter((a: any) => a.status === "active").length}
              </p>
              <p className="text-sm text-muted-foreground">انتدابات نشطة</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-500">
                {(assignments || []).filter((a: any) => a.status === "cancelled").length}
              </p>
              <p className="text-sm text-muted-foreground">انتدابات ملغاة</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">
                {(assignments || []).length}
              </p>
              <p className="text-sm text-muted-foreground">إجمالي الانتدابات</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assignments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">سجل الانتدابات</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              جاري التحميل...
            </div>
          ) : !assignments || assignments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد انتدابات مسجلة
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">#</TableHead>
                    <TableHead className="text-right">العامل</TableHead>
                    <TableHead className="text-right">المجموعة</TableHead>
                    <TableHead className="text-right">من مركز</TableHead>
                    <TableHead className="text-right">إلى مركز</TableHead>
                    <TableHead className="text-right">من تاريخ</TableHead>
                    <TableHead className="text-right">إلى تاريخ</TableHead>
                    <TableHead className="text-right">المدة</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">ملاحظات</TableHead>
                    <TableHead className="text-right">بواسطة</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a: any, idx: number) => (
                    <TableRow key={a.id} className={a.status === "cancelled" ? "opacity-50" : ""}>
                      <TableCell className="font-medium">{idx + 1}</TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{a.workerName}</span>
                          {a.workerCode && (
                            <span className="text-xs text-muted-foreground mr-1">
                              ({a.workerCode})
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{a.groupName || "-"}</TableCell>
                      <TableCell>{a.fromCostCenterName || "-"}</TableCell>
                      <TableCell>
                        <span className="font-medium text-blue-600">
                          {a.toCostCenterName || "-"}
                        </span>
                      </TableCell>
                      <TableCell>{formatDate(a.startDate)}</TableCell>
                      <TableCell>{formatDate(a.endDate)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {calculateDays(a.startDate, a.endDate)} يوم
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {a.status === "active" ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                            نشط
                          </Badge>
                        ) : (
                          <Badge variant="secondary">ملغي</Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {a.notes || "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {a.createdByName || "-"}
                      </TableCell>
                      <TableCell>
                        {a.status === "active" && (
                          <div className="flex items-center gap-1">
                            {/* Edit Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-1 h-8 px-2"
                              onClick={() => handleEditOpen(a)}
                            >
                              <Pencil className="h-3 w-3" />
                              تعديل
                            </Button>
                            {/* Cancel Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 gap-1 h-8 px-2"
                              onClick={() => handleCancel(a.id)}
                              disabled={cancelMutation.isPending}
                            >
                              <X className="h-3 w-3" />
                              إلغاء
                            </Button>
                            {/* Delete Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1 h-8 px-2"
                              onClick={() => handleDeleteOpen(a)}
                            >
                              <Trash2 className="h-3 w-3" />
                              حذف
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog?.open} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent className="sm:max-w-[500px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" />
              تعديل الانتداب
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                {editError}
              </div>
            )}

            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">العامل</p>
              <p className="font-medium">{editDialog?.workerName}</p>
            </div>

            {/* To Cost Center */}
            <div className="space-y-2">
              <Label>مركز التكلفة المنتدب إليه *</Label>
              <Select
                value={editDialog?.toCostCenterId || ""}
                onValueChange={(val) => setEditDialog(prev => prev ? { ...prev, toCostCenterId: val, toGroupId: "" } : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر مركز التكلفة" />
                </SelectTrigger>
                <SelectContent>
                  {(costCenters || []).map((cc: any) => (
                    <SelectItem key={cc.id} value={cc.id.toString()}>
                      {cc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* To Group */}
            <div className="space-y-2">
              <Label>المجموعة المنتدب إليها *</Label>
              <Select
                value={editDialog?.toGroupId || ""}
                onValueChange={(val) => setEditDialog(prev => prev ? { ...prev, toGroupId: val } : null)}
                disabled={!editDialog?.toCostCenterId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={editDialog?.toCostCenterId ? "اختر المجموعة" : "اختر مركز التكلفة أولاً"} />
                </SelectTrigger>
                <SelectContent>
                  {(allGroups || []).filter((g: any) => g.costCenterId === parseInt(editDialog?.toCostCenterId || "0")).map((g: any) => (
                    <SelectItem key={g.id} value={g.id.toString()}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>تاريخ البداية *</Label>
                <Input
                  type="date"
                  value={editDialog?.startDate || ""}
                  onChange={(e) => setEditDialog(prev => prev ? { ...prev, startDate: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>تاريخ النهاية *</Label>
                <Input
                  type="date"
                  value={editDialog?.endDate || ""}
                  onChange={(e) => setEditDialog(prev => prev ? { ...prev, endDate: e.target.value } : null)}
                />
              </div>
            </div>
            {editDialog?.startDate && editDialog?.endDate && new Date(editDialog.endDate) >= new Date(editDialog.startDate) && (
              <p className="text-xs text-blue-600">
                مدة الانتداب: <strong>{calculateDays(editDialog.startDate, editDialog.endDate)} يوم</strong>
              </p>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={editDialog?.notes || ""}
                onChange={(e) => setEditDialog(prev => prev ? { ...prev, notes: e.target.value } : null)}
                placeholder="سبب الانتداب أو أي ملاحظات..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditDialog(null)}>
              إلغاء
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={updateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateMutation.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialog?.open} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              تأكيد حذف الانتداب
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
              <p className="text-base font-medium text-red-800 dark:text-red-300">
                هل أنت متأكد من حذف هذا الانتداب نهائياً؟
              </p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                لا يمكن التراجع عن هذا الإجراء
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">العامل</p>
              <p className="font-medium">{deleteDialog?.workerName}</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              تراجع
            </Button>
            <Button
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
              variant="destructive"
            >
              {deleteMutation.isPending ? "جاري الحذف..." : "حذف نهائي"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
