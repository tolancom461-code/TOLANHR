import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Save, DollarSign, AlertTriangle } from "lucide-react";

interface FinanceEntry {
  id: number;
  workerId: number;
  workerName?: string;
  workerCode?: string;
  entryType?: "deduction" | "bonus";
  amount?: number;
  reason?: string;
  date?: string;
  status?: "pending" | "approved" | "rejected";
  workDate: Date;
  baseAmount: string | null;
  deductions: string | null;
  bonuses: string | null;
  netAmount: string | null;
  notes: string | null;
}

export default function FinanceEntry() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FinanceEntry | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    workerId: 0,
    workerName: "",
    entryType: "bonus" as const,
    amount: 0,
    reason: "",
  });

  // Queries
  const { data: workers = [] } = trpc.workers.list.useQuery({} as any);
  const { data: entries = [], isLoading, refetch } = trpc.dailyFinance.getRecords.useQuery(
    selectedWorkerId ? {
      workerId: selectedWorkerId,
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('en-CA'),
      endDate: new Date().toLocaleDateString('en-CA'),
    } : undefined as any
  );

  // Mutations
  const createEntryMutation = trpc.dailyFinance.addEntry.useMutation({
    onSuccess: () => {
      toast.success("تم إضافة الإدخال المالي بنجاح");
      setIsAddDialogOpen(false);
      setFormData({ workerId: 0, workerName: "", entryType: "bonus", amount: 0, reason: "" });
      refetch();
    },
    onError: (error: any) => {
      toast.error(`فشل الإضافة: ${error?.message || 'خطأ غير معروف'}`);
    },
  });

  const updateEntryMutation = trpc.dailyFinance.update.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث الإدخال بنجاح");
      setIsEditDialogOpen(false);
      setEditingEntry(null);
      refetch();
    },
    onError: (error: any) => {
      toast.error(`فشل التحديث: ${error?.message || 'خطأ غير معروف'}`);
    },
  });

  const deleteEntryMutation = trpc.dailyFinance.update.useMutation({
    onSuccess: () => {
      toast.success("تم حذف الإدخال بنجاح");
      refetch();
    },
    onError: (error: any) => {
      toast.error(`فشل الحذف: ${error?.message || 'خطأ غير معروف'}`);
    },
  });

   const filteredEntries = (entries || []).filter((entry: any) =>
    (entry?.workerName || '').includes(searchQuery) || (entry?.workerCode || '').includes(searchQuery)
  );

  const handleAddEntry = () => {
    if (!formData.workerId || !formData.amount || !formData.reason) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    createEntryMutation.mutate({
      workerId: formData.workerId,
      entryType: formData.entryType,
      amount: formData.amount,
      reason: formData.reason,
    } as any);
  };

  const handleEditEntry = (entry: any) => {
    setEditingEntry(entry);
    setFormData({
      workerId: entry.workerId,
      workerName: entry.workerName,
      entryType: entry.entryType,
      amount: entry.amount,
      reason: entry.reason,
    });
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingEntry) return;

    updateEntryMutation.mutate({
      entryId: editingEntry.id,
      amount: formData.amount,
      reason: formData.reason,
    } as any);
  };

  const handleDeleteEntry = (id: number) => {
    if (confirm("هل تريد حذف هذا الإدخال؟")) {
      deleteEntryMutation.mutate({ entryId: id } as any);
    }
  };

  const handlePrintEntry = (entry: any) => {
    // Print entry implementation
  };

  const getEntryTypeBadge = (type: string) => {
    return type === "deduction" ? (
      <Badge className="bg-red-500 text-white">خصم</Badge>
    ) : (
      <Badge className="bg-green-500 text-white">إضافة</Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      pending: { label: "بانتظار", color: "bg-yellow-500" },
      approved: { label: "موافق عليه", color: "bg-green-500" },
      rejected: { label: "مرفوض", color: "bg-red-500" },
    };
    const info = statusMap[status] || { label: status, color: "bg-gray-500" };
    return <Badge className={`${info.color} text-white`}>{info.label}</Badge>;
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <DollarSign className="h-8 w-8 text-green-500" />
            الإدخالات المالية
          </h1>
          <p className="text-muted-foreground mt-2">
            إدارة الخصومات والإضافات المالية للعمال
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          إضافة إدخال مالي
        </Button>
      </div>

      {/* Info Alert */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          يمكنك إضافة خصومات أو إضافات مالية للعمال بناءً على البلاغات التشغيلية أو الحاجة الإدارية
        </AlertDescription>
      </Alert>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>البحث</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="ابحث بالاسم أو الكود..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle>الإدخالات المالية</CardTitle>
          <CardDescription>
            {filteredEntries.length} إدخال مالي
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد إدخالات مالية
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">الكود</TableHead>
                    <TableHead className="text-center">الاسم</TableHead>
                    <TableHead className="text-center">النوع</TableHead>
                    <TableHead className="text-center">المبلغ</TableHead>
                    <TableHead className="text-center">السبب</TableHead>
                    <TableHead className="text-center">التاريخ</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry: any) => {
                    const worker = workers.find(w => w.id === entry.workerId);
                    return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-center font-mono text-sm">
                        {worker?.code || '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="font-medium">{worker?.fullName || '-'}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge>مسجل</Badge>
                      </TableCell>
                      <TableCell className="text-center font-bold">
                        {entry.netAmount ? Number(entry.netAmount).toLocaleString('ar-SA') : '0'} ر.س
                      </TableCell>
                      <TableCell>
                        <div className="truncate" title={entry.notes || ''}>
                          {entry.notes || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {new Date(entry.workDate).toLocaleDateString('ar-SA')}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge>مسجل</Badge>
                      </TableCell>
                      <TableCell className="text-center space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditEntry(entry)}
                          className="gap-2"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="gap-2"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Entry Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة إدخال مالي جديد</DialogTitle>
            <DialogDescription>
              أضف خصم أو إضافة مالية للعامل
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Worker Selection */}
            <div className="space-y-2">
              <Label htmlFor="worker">العامل</Label>
              <Select
                value={formData.workerId.toString()}
                onValueChange={(value) => {
                  const worker = workers.find(w => w.id === parseInt(value));
                  setFormData({
                    ...formData,
                    workerId: parseInt(value),
                    workerName: worker?.fullName || "",
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر العامل" />
                </SelectTrigger>
                <SelectContent>
                  {workers.map((worker) => (
                    <SelectItem key={worker.id} value={worker.id.toString()}>
                      {worker.fullName} ({worker.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Entry Type */}
            <div className="space-y-2">
              <Label htmlFor="entryType">النوع</Label>
              <Select
                value={formData.entryType}
                onValueChange={(value) =>
                  setFormData({ ...formData, entryType: value as any })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bonus">إضافة</SelectItem>
                  <SelectItem value="deduction">خصم</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">المبلغ (ر.س)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="أدخل المبلغ"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })
                }
              />
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="reason">السبب</Label>
              <Textarea
                id="reason"
                placeholder="أدخل سبب الإدخال المالي"
                value={formData.reason}
                onChange={(e) =>
                  setFormData({ ...formData, reason: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleAddEntry}
              disabled={createEntryMutation.isPending}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Entry Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل الإدخال المالي</DialogTitle>
            <DialogDescription>
              {editingEntry && `${editingEntry.workerName} - ${editingEntry.workerCode}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="edit-amount">المبلغ (ر.س)</Label>
              <Input
                id="edit-amount"
                type="number"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })
                }
              />
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="edit-reason">السبب</Label>
              <Textarea
                id="edit-reason"
                value={formData.reason}
                onChange={(e) =>
                  setFormData({ ...formData, reason: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateEntryMutation.isPending}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              حفظ التغييرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
