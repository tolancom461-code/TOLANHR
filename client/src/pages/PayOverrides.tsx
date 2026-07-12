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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertCircle,
  Plus,
  RefreshCw,
  Check,
  X,
  Clock,
  DollarSign
} from 'lucide-react';
import { toast } from 'sonner';

const OVERRIDE_TYPES = [
  { value: 'bonus', label: 'مكافأة', color: 'bg-green-100 text-green-800' },
  { value: 'deduction', label: 'خصم', color: 'bg-red-100 text-red-800' },
  { value: 'advance', label: 'سلفة', color: 'bg-orange-100 text-orange-800' },
  { value: 'emergency_call', label: 'استدعاء طارئ', color: 'bg-blue-100 text-blue-800' },
];

export default function PayOverrides() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [formData, setFormData] = useState({
    groupId: '', // إضافة حقل المجموعة
    workerId: '',
    overrideDate: new Date().toLocaleDateString('en-CA'),
    overrideType: 'bonus' as 'bonus' | 'deduction' | 'advance' | 'emergency_call',
    amount: '',
    reason: '',
  });
  
  // Get all groups (PayOverrides page doesn't filter by cost center)
  const { data: groups } = trpc.groups.list.useQuery();
  const { data: workers } = trpc.workers.list.useQuery();
  const { data: pendingOverrides, refetch } = trpc.payOverrides.pending.useQuery({
    groupId: selectedGroup !== 'all' ? parseInt(selectedGroup) : undefined
  });
  
  const createMutation = trpc.payOverrides.create.useMutation({
    onSuccess: () => {
      toast.success('تم إنشاء الاستثناء بنجاح');
      refetch();
      setShowCreateDialog(false);
      setFormData({
        groupId: '',
        workerId: '',
        overrideDate: new Date().toLocaleDateString('en-CA'),
        overrideType: 'bonus',
        amount: '',
        reason: '',
      });
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ');
    }
  });
  
  const approveMutation = trpc.payOverrides.approve.useMutation({
    onSuccess: () => {
      toast.success('تم اعتماد الاستثناء');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ');
    }
  });
  
  const rejectMutation = trpc.payOverrides.reject.useMutation({
    onSuccess: () => {
      toast.success('تم رفض الاستثناء');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ');
    }
  });

  const handleCreate = () => {
    if (!formData.workerId || !formData.amount) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    createMutation.mutate({
      workerId: parseInt(formData.workerId),
      overrideDate: formData.overrideDate,
      overrideType: formData.overrideType,
      amount: parseFloat(formData.amount),
      reason: formData.reason,
    });
  };

  const getTypeBadge = (type: string) => {
    const typeInfo = OVERRIDE_TYPES.find(t => t.value === type);
    return (
      <Badge className={typeInfo?.color || 'bg-gray-100 text-gray-800'}>
        {typeInfo?.label || type}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50"><Clock className="h-3 w-3 ml-1" />معلق</Badge>;
      case 'approved':
        return <Badge className="bg-green-100 text-green-800"><Check className="h-3 w-3 ml-1" />معتمد</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800"><X className="h-3 w-3 ml-1" />مرفوض</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertCircle className="h-6 w-6" />
            الاستثناءات المالية
          </h1>
          <p className="text-muted-foreground">
            إدارة المكافآت والخصومات والسلف
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedGroup} onValueChange={setSelectedGroup}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="جميع المجموعات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع المجموعات</SelectItem>
              {groups?.map((group) => (
                <SelectItem key={group.id} value={group.id.toString()}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 ml-2" />
            إضافة استثناء
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingOverrides?.length || 0}</p>
                <p className="text-sm text-muted-foreground">معلق</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Overrides */}
      <Card>
        <CardHeader>
          <CardTitle>الاستثناءات المعلقة</CardTitle>
          <CardDescription>استثناءات تنتظر الاعتماد</CardDescription>
        </CardHeader>
        <CardContent>
          {!pendingOverrides?.length ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
              <p className="mt-2 text-muted-foreground">لا توجد استثناءات معلقة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">العامل</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">السبب</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingOverrides.map((override) => (
                    <TableRow key={override.id}>
                      <TableCell className="font-medium">
                        {override.workerName}
                        <span className="text-muted-foreground text-sm block">
                          {override.workerCode}
                        </span>
                      </TableCell>
                      <TableCell>
                        {new Date(override.overrideDate).toLocaleDateString('ar-SA')}
                      </TableCell>
                      <TableCell>
                        {getTypeBadge(override.overrideType)}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {parseFloat(override.amount?.toString() || '0').toFixed(2)} ر.س
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {override.reason || '-'}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(override.status || 'pending')}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => approveMutation.mutate({ overrideId: override.id })}
                            disabled={approveMutation.isPending}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => rejectMutation.mutate({ overrideId: override.id })}
                            disabled={rejectMutation.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
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
            <DialogTitle>إضافة استثناء جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* حقل اختيار المجموعة أولاً */}
            <div className="space-y-2">
              <Label>المجموعة *</Label>
              <Select 
                value={formData.groupId} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, groupId: v, workerId: '' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر المجموعة أولاً" />
                </SelectTrigger>
                <SelectContent>
                  {groups?.map((group) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* حقل اختيار العامل (مفلتر حسب المجموعة) */}
            <div className="space-y-2">
              <Label>العامل *</Label>
              <Select 
                value={formData.workerId} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, workerId: v }))}
                disabled={!formData.groupId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={
                    formData.groupId 
                      ? "اختر العامل" 
                      : "اختر المجموعة أولاً"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {workers
                    ?.filter(worker => worker.groupId === parseInt(formData.groupId))
                    .map((worker) => (
                      <SelectItem key={worker.id} value={worker.id.toString()}>
                        {worker.fullName} ({worker.code})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {formData.groupId && workers?.filter(w => w.groupId === parseInt(formData.groupId)).length === 0 && (
                <p className="text-sm text-muted-foreground">لا يوجد عمال في هذه المجموعة</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>التاريخ *</Label>
              <Input
                type="date"
                value={formData.overrideDate}
                onChange={(e) => setFormData(prev => ({ ...prev, overrideDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>نوع الاستثناء *</Label>
              <Select 
                value={formData.overrideType} 
                onValueChange={(v: any) => setFormData(prev => ({ ...prev, overrideType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OVERRIDE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المبلغ (ر.س) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>السبب</Label>
              <Textarea
                placeholder="أدخل سبب الاستثناء..."
                value={formData.reason}
                onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
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
    </div>
  );
}
