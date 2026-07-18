import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Receipt,
  Plus,
  RefreshCw,
  Check,
  Trash2,
  Clock,
  CheckCircle2,
  ArrowUpRightFromCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_TABS = [
  { value: 'all', label: 'الكل' },
  { value: 'pending', label: 'معلّق' },
  { value: 'approved', label: 'معتمد' },
  { value: 'posted', label: 'مُرحّل' },
] as const;

export default function Deductions() {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'posted'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    costCenterId: '',
    groupId: '',
    workerId: '',
    amount: '',
    dueDate: new Date().toLocaleDateString('en-CA'),
    reason: '',
  });

  const { data: costCenters } = trpc.costCenters.list.useQuery();
  const { data: groups } = trpc.groups.list.useQuery();
  const { data: workers } = trpc.workers.list.useQuery();

  // مجموعات مركز التكلفة المختار فقط
  const filteredGroups = (groups || []).filter(
    (g: any) => formData.costCenterId && g.costCenterId === parseInt(formData.costCenterId)
  );

  // عمال المجموعة المختارة فقط، مرتبين أبجديًا حسب الاسم
  const filteredWorkers = (workers || [])
    .filter((w: any) => formData.groupId && w.groupId === parseInt(formData.groupId))
    .sort((a: any, b: any) => (a.fullName || '').localeCompare(b.fullName || '', 'ar'));
  const { data: deductions, isLoading, refetch } = trpc.deductions.list.useQuery(
    statusFilter === 'all' ? {} : { status: statusFilter }
  );

  const createMutation = trpc.deductions.create.useMutation({
    onSuccess: () => {
      toast.success('تم إضافة الحسم بنجاح — بانتظار الاعتماد');
      refetch();
      setShowCreateDialog(false);
      setFormData({ costCenterId: '', groupId: '', workerId: '', amount: '', dueDate: new Date().toLocaleDateString('en-CA'), reason: '' });
    },
    onError: (error) => toast.error(error.message || 'حدث خطأ'),
  });

  const approveMutation = trpc.deductions.approve.useMutation({
    onSuccess: () => {
      toast.success('تم اعتماد الحسم — سيُرحَّل تلقائياً لدفعة العمال عند إنشاء الدفعة المطابقة لتاريخه');
      refetch();
    },
    onError: (error) => toast.error(error.message || 'حدث خطأ'),
  });

  const deleteMutation = trpc.deductions.delete.useMutation({
    onSuccess: () => {
      toast.success('تم حذف الحسم');
      refetch();
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ');
      setDeleteTarget(null);
    },
  });

  const handleCreate = () => {
    if (!formData.workerId || !formData.amount || !formData.dueDate) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    if (!formData.reason.trim()) {
      toast.error('يرجى كتابة سبب الحسم');
      return;
    }
    createMutation.mutate({
      workerId: parseInt(formData.workerId),
      amount: formData.amount,
      dueDate: formData.dueDate,
      reason: formData.reason,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50"><Clock className="h-3 w-3 ml-1" />معلّق</Badge>;
      case 'approved':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 ml-1" />معتمد</Badge>;
      case 'posted':
        return <Badge className="bg-blue-100 text-blue-800"><ArrowUpRightFromCircle className="h-3 w-3 ml-1" />مُرحّل</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingCount = deductions?.filter((d: any) => d.status === 'pending').length || 0;
  const approvedCount = deductions?.filter((d: any) => d.status === 'approved').length || 0;
  const postedCount = deductions?.filter((d: any) => d.status === 'posted').length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            الحسومات
          </h1>
          <p className="text-muted-foreground">
            حسومات إدارية تُعتمد ثم تترحّل تلقائياً لدفعة العمال المطابقة لتاريخ استحقاقها
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 ml-2" />
          إضافة حسم
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">معلّق</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{approvedCount}</p>
                <p className="text-sm text-muted-foreground">معتمد (بانتظار الترحيل)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <ArrowUpRightFromCircle className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{postedCount}</p>
                <p className="text-sm text-muted-foreground">مُرحّل لدفعة عمال</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-2 border-b">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === tab.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة الحسومات</CardTitle>
          <CardDescription>كل حسم يظهر مع تاريخ استحقاقه وحالته الحالية</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">جاري التحميل...</p>
            </div>
          ) : !deductions?.length ? (
            <div className="text-center py-8">
              <Receipt className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
              <p className="mt-2 text-muted-foreground">لا توجد حسومات</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">العامل</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">تاريخ الاستحقاق</TableHead>
                    <TableHead className="text-right">السبب</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">اعتمده</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deductions.map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        {d.workerName}
                        <span className="text-muted-foreground text-sm block">{d.workerCode}</span>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {parseFloat(d.amount?.toString() || '0').toFixed(2)} ر.س
                      </TableCell>
                      <TableCell>{new Date(d.dueDate).toLocaleDateString('ar-SA')}</TableCell>
                      <TableCell className="max-w-xs truncate" title={d.reason}>{d.reason || '-'}</TableCell>
                      <TableCell>{getStatusBadge(d.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.approverFullName || '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {d.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 hover:text-green-700"
                              onClick={() => approveMutation.mutate({ id: d.id })}
                              disabled={approveMutation.isPending}
                              title="اعتماد"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          {d.status !== 'posted' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => setDeleteTarget(d.id)}
                              title="حذف"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة حسم جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>مركز التكلفة *</Label>
              <Select
                value={formData.costCenterId}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, costCenterId: v, groupId: '', workerId: '' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر مركز التكلفة" />
                </SelectTrigger>
                <SelectContent>
                  {costCenters?.map((cc: any) => (
                    <SelectItem key={cc.id} value={cc.id.toString()}>
                      {cc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المجموعة *</Label>
              <Select
                value={formData.groupId}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, groupId: v, workerId: '' }))}
                disabled={!formData.costCenterId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={formData.costCenterId ? 'اختر المجموعة' : 'اختر مركز التكلفة أولاً'} />
                </SelectTrigger>
                <SelectContent>
                  {filteredGroups.map((group: any) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.costCenterId && filteredGroups.length === 0 && (
                <p className="text-sm text-muted-foreground">لا توجد مجموعات لهذا المركز</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>العامل *</Label>
              <Select
                value={formData.workerId}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, workerId: v }))}
                disabled={!formData.groupId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={formData.groupId ? 'اختر العامل' : 'اختر المجموعة أولاً'} />
                </SelectTrigger>
                <SelectContent>
                  {filteredWorkers.map((worker: any) => (
                    <SelectItem key={worker.id} value={worker.id.toString()}>
                      {worker.fullName} ({worker.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.groupId && filteredWorkers.length === 0 && (
                <p className="text-sm text-muted-foreground">لا يوجد عمال في هذه المجموعة</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>قيمة الحسم (ر.س) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>تاريخ الحسم (تاريخ الاستحقاق) *</Label>
              <Input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                عند اعتماد الحسم، سيُرحَّل تلقائياً لدفعة العمال اللي فترتها تغطي هذا التاريخ
              </p>
            </div>
            <div className="space-y-2">
              <Label>سبب الحسم *</Label>
              <Textarea
                placeholder="أدخل سبب الحسم..."
                value={formData.reason}
                onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Plus className="h-4 w-4 ml-2" />
              )}
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">هل أنت متأكد من حذف هذا الحسم؟ لا يمكن التراجع بعد الحذف.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Trash2 className="h-4 w-4 ml-2" />}
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
