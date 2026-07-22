import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  Plus,
  RefreshCw,
  Check,
  X,
  Clock,
  Users,
  ArrowRight,
  Save,
  Archive,
  Pencil,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

const OVERRIDE_TYPES = [
  { value: 'bonus', label: 'مكافأة', color: 'bg-green-100 text-green-800', border: 'border-green-400' },
  { value: 'deduction', label: 'خصم', color: 'bg-red-100 text-red-800', border: 'border-red-400' },
  { value: 'advance', label: 'سلفة', color: 'bg-orange-100 text-orange-800', border: 'border-orange-400' },
  { value: 'emergency_call', label: 'استدعاء طارئ', color: 'bg-blue-100 text-blue-800', border: 'border-blue-400' },
] as const;

type OverrideType = typeof OVERRIDE_TYPES[number]['value'];

// من يملك صلاحية التعديل/الحذف/الطباعة الكاملة على الأرشيف
const FULL_ACCESS_ROLES = ['admin_affairs', 'super_admin'];
// من يملك صلاحية استعراض الأرشيف (استعراض فقط لغير الروليْن أعلاه)
const ARCHIVE_VIEW_ROLES = ['admin_affairs', 'super_admin', 'accountant', 'auditor', 'finance_manager'];

export default function PayOverrides() {
  const { user } = useAuth();
  const userRole = (user as any)?.role as string | undefined;
  const canManageArchive = !!userRole && FULL_ACCESS_ROLES.includes(userRole);
  const canViewArchive = !!userRole && ARCHIVE_VIEW_ROLES.includes(userRole);

  const [activeTab, setActiveTab] = useState<'add' | 'archive'>('add');

  // ===== الخطوة 1: نافذة اختيار النوع والتاريخ =====
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [step, setStep] = useState<'idle' | 'fill-amounts'>('idle');
  const [overrideDate, setOverrideDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [overrideType, setOverrideType] = useState<OverrideType>('bonus');
  const [reason, setReason] = useState('');

  // ===== الخطوة 2: اختيار مركز التكلفة والمجموعة وتعبئة المبالغ والملاحظات =====
  const [costCenterId, setCostCenterId] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [amounts, setAmounts] = useState<Record<number, string>>({}); // workerId -> amount
  const [workerNotes, setWorkerNotes] = useState<Record<number, string>>({}); // workerId -> note
  const [groupBulkValue, setGroupBulkValue] = useState<string>('');
  const [groupBulkNote, setGroupBulkNote] = useState<string>('');
  const [filledGroupIds, setFilledGroupIds] = useState<Set<number>>(new Set());

  // ===== فلترة الأرشيف =====
  const [archiveGroupFilter, setArchiveGroupFilter] = useState<string>('all');

  // ===== نافذة تعديل سجل من الأرشيف =====
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    overrideDate: '',
    overrideType: 'bonus' as OverrideType,
    amount: '',
    notes: '',
    reason: '',
  });

  // ===== تأكيد الحذف =====
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);


  const { data: costCenters } = trpc.costCenters.list.useQuery();
  const { data: costCenterGroups } = trpc.groups.listByCostCenter.useQuery(
    { costCenterId: costCenterId ? parseInt(costCenterId) : undefined },
    { enabled: !!costCenterId }
  );
  const { data: allGroups } = trpc.groups.list.useQuery();
  const { data: workersInGroup, isFetching: isFetchingWorkers } = trpc.payOverrides.workersWithAttendance.useQuery(
    { groupId: selectedGroupId || 0, date: overrideDate },
    { enabled: !!selectedGroupId && step === 'fill-amounts' }
  );

  const { data: archiveData, refetch: refetchArchive, isFetching: isFetchingArchive } = trpc.payOverrides.archive.useQuery(
    { groupId: archiveGroupFilter !== 'all' ? parseInt(archiveGroupFilter) : undefined },
    { enabled: canViewArchive }
  );

  const createBulkMutation = trpc.payOverrides.createBulk.useMutation({
    onSuccess: (data) => {
      if (data.blocked.length === 0) {
        toast.success(`تم حفظ ${data.createdCount} استثناء بنجاح${data.updatedBatches > 0 ? ` (وتحديث ${data.updatedBatches} دفعة مسودة تلقائياً)` : ''}`);
      } else {
        toast.warning(
          `تم حفظ ${data.createdCount} استثناء، وتم تجاوز ${data.blocked.length} عامل لوجود دفعة غير قابلة للتعديل (${data.blocked.map((b) => `${b.workerName}: ${b.batchCode}`).join('، ')})`
        );
      }
      refetchArchive();
      setAmounts({});
      setWorkerNotes({});
      setFilledGroupIds(new Set());
      setSelectedGroupId(null);
      setGroupBulkValue('');
      setGroupBulkNote('');
      setStep('idle');
      setReason('');
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ أثناء الحفظ');
    },
  });

  const approveMutation = trpc.payOverrides.approve.useMutation({
    onSuccess: () => {
      toast.success('تم اعتماد الاستثناء');
      refetchArchive();
    },
    onError: (error) => toast.error(error.message || 'حدث خطأ'),
  });

  const rejectMutation = trpc.payOverrides.reject.useMutation({
    onSuccess: () => {
      toast.success('تم رفض الاستثناء');
      refetchArchive();
    },
    onError: (error) => toast.error(error.message || 'حدث خطأ'),
  });

  const updateMutation = trpc.payOverrides.update.useMutation({
    onSuccess: () => {
      toast.success('تم تحديث الاستثناء بنجاح');
      setEditingRecord(null);
      refetchArchive();
    },
    onError: (error) => toast.error(error.message || 'تعذر تحديث الاستثناء'),
  });

  const deleteMutation = trpc.payOverrides.delete.useMutation({
    onSuccess: () => {
      toast.success('تم حذف الاستثناء بنجاح');
      setDeleteTarget(null);
      refetchArchive();
    },
    onError: (error) => toast.error(error.message || 'تعذر حذف الاستثناء'),
  });

  // بدء الخطوة الثانية بعد تأكيد النوع والتاريخ
  const handleConfirmTypeAndDate = () => {
    setShowTypeDialog(false);
    setStep('fill-amounts');
  };

  const handleSelectGroup = (groupId: number) => {
    setSelectedGroupId(groupId);
    setGroupBulkValue('');
    setGroupBulkNote('');
  };

  // تطبيق مبلغ واحد على كل عمال المجموعة الحالية المعروضين
  const handleApplyAmountToGroup = () => {
    if (!workersInGroup || !groupBulkValue || parseFloat(groupBulkValue) <= 0) {
      toast.error('يرجى كتابة مبلغ صحيح أولاً');
      return;
    }
    setAmounts((prev) => {
      const next = { ...prev };
      for (const w of workersInGroup) next[w.workerId] = groupBulkValue;
      return next;
    });
    if (selectedGroupId) setFilledGroupIds((prev) => new Set(prev).add(selectedGroupId));
    toast.success(`تم تعبئة المبلغ لـ ${workersInGroup.length} عامل`);
  };

  // تطبيق ملاحظة واحدة على كل عمال المجموعة الحالية المعروضين
  const handleApplyNoteToGroup = () => {
    if (!workersInGroup || !groupBulkNote.trim()) {
      toast.error('يرجى كتابة ملاحظة أولاً');
      return;
    }
    setWorkerNotes((prev) => {
      const next = { ...prev };
      for (const w of workersInGroup) next[w.workerId] = groupBulkNote;
      return next;
    });
    toast.success(`تم تعميم الملاحظة على ${workersInGroup.length} عامل`);
  };

  const handleWorkerAmountChange = (workerId: number, value: string) => {
    setAmounts((prev) => ({ ...prev, [workerId]: value }));
    if (selectedGroupId) setFilledGroupIds((prev) => new Set(prev).add(selectedGroupId));
  };

  const handleWorkerNoteChange = (workerId: number, value: string) => {
    setWorkerNotes((prev) => ({ ...prev, [workerId]: value }));
  };

  const validEntriesCount = useMemo(
    () => Object.values(amounts).filter((v) => parseFloat(v) > 0).length,
    [amounts]
  );

  const handleSaveAll = () => {
    const entries = Object.entries(amounts)
      .filter(([, amount]) => parseFloat(amount) > 0)
      .map(([workerId, amount]) => ({
        workerId: parseInt(workerId),
        amount: parseFloat(amount),
        notes: workerNotes[parseInt(workerId)] || undefined,
      }));

    if (entries.length === 0) {
      toast.error('لم تُدخل أي مبالغ بعد');
      return;
    }

    createBulkMutation.mutate({
      overrideDate,
      overrideType,
      reason: reason || undefined,
      entries,
    });
  };

  const handleCancelFillStep = () => {
    setStep('idle');
    setSelectedGroupId(null);
    setAmounts({});
    setWorkerNotes({});
    setFilledGroupIds(new Set());
    setCostCenterId('');
    setGroupBulkValue('');
    setGroupBulkNote('');
  };

  const getTypeBadge = (type: string) => {
    const typeInfo = OVERRIDE_TYPES.find((t) => t.value === type);
    return <Badge className={typeInfo?.color || 'bg-gray-100 text-gray-800'}>{typeInfo?.label || type}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="outline" className="bg-yellow-50">
            <Clock className="h-3 w-3 ml-1" />
            معلق
          </Badge>
        );
      case 'approved':
        return (
          <Badge className="bg-green-100 text-green-800">
            <Check className="h-3 w-3 ml-1" />
            معتمد
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-red-100 text-red-800">
            <X className="h-3 w-3 ml-1" />
            مرفوض
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const currentTypeInfo = OVERRIDE_TYPES.find((t) => t.value === overrideType);

  const handleOpenEdit = (record: any) => {
    setEditingRecord(record);
    setEditForm({
      overrideDate: record.overrideDate,
      overrideType: record.overrideType,
      amount: record.amount?.toString() || '',
      notes: record.notes || '',
      reason: record.reason || '',
    });
  };

  const handleSaveEdit = () => {
    if (!editingRecord) return;
    if (!editForm.amount || parseFloat(editForm.amount) <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح');
      return;
    }
    updateMutation.mutate({
      overrideId: editingRecord.id,
      overrideDate: editForm.overrideDate,
      overrideType: editForm.overrideType,
      amount: parseFloat(editForm.amount),
      notes: editForm.notes || undefined,
      reason: editForm.reason || undefined,
    });
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
          <p className="text-muted-foreground">إدارة المكافآت والخصومات والسلف</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'add' | 'archive')}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList>
            <TabsTrigger value="add">إضافة استثناء</TabsTrigger>
            {canViewArchive && (
              <TabsTrigger value="archive">
                <Archive className="h-4 w-4 ml-1" />
                أرشيف الاستثناءات
              </TabsTrigger>
            )}
          </TabsList>
          {activeTab === 'add' && step === 'idle' && (
            <Button onClick={() => setShowTypeDialog(true)}>
              <Plus className="h-4 w-4 ml-2" />
              إضافة استثناء
            </Button>
          )}
        </div>

        {/* ===================== تبويب: إضافة استثناء ===================== */}
        <TabsContent value="add" className="space-y-4 mt-4">
          {step === 'fill-amounts' && (
            <Card className="border-primary/40">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <CardTitle>تعبئة مبالغ الاستثناء</CardTitle>
                    {currentTypeInfo && <Badge className={currentTypeInfo.color}>{currentTypeInfo.label}</Badge>}
                    <span className="text-sm text-muted-foreground">
                      بتاريخ {new Date(overrideDate).toLocaleDateString('ar-SA')}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setShowTypeDialog(true)}>
                      تعديل النوع/التاريخ
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCancelFillStep}>
                    <X className="h-4 w-4 ml-1" />
                    إلغاء والبدء من جديد
                  </Button>
                </div>
                <CardDescription>
                  اختر مركز التكلفة، ثم المجموعة، وعبّئ المبالغ والملاحظات لكل عامل — أو استخدم حقلي "تعميم" لتعبئة الجميع دفعة واحدة. يمكنك التنقل بين عدة مجموعات قبل الحفظ النهائي.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>مركز التكلفة</Label>
                  <Select value={costCenterId} onValueChange={(v) => { setCostCenterId(v); setSelectedGroupId(null); }}>
                    <SelectTrigger className="max-w-sm">
                      <SelectValue placeholder="اختر مركز التكلفة" />
                    </SelectTrigger>
                    <SelectContent>
                      {costCenters?.map((cc: any) => (
                        <SelectItem key={cc.id} value={cc.id.toString()}>{cc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {costCenterId && (
                  <div className="space-y-2">
                    <Label>المجموعة</Label>
                    <div className="flex flex-wrap gap-2">
                      {costCenterGroups?.map((group: any) => {
                        const isFilled = filledGroupIds.has(group.id);
                        const isActive = selectedGroupId === group.id;
                        return (
                          <Button
                            key={group.id}
                            type="button"
                            variant={isActive ? 'default' : 'outline'}
                            size="sm"
                            className={isFilled && !isActive ? 'border-green-400 text-green-700' : ''}
                            onClick={() => handleSelectGroup(group.id)}
                          >
                            <Users className="h-4 w-4 ml-1" />
                            {group.name}
                            {isFilled && <Check className="h-3 w-3 mr-1" />}
                          </Button>
                        );
                      })}
                      {costCenterGroups?.length === 0 && (
                        <p className="text-sm text-muted-foreground">لا توجد مجموعات في مركز التكلفة هذا</p>
                      )}
                    </div>
                  </div>
                )}

                {selectedGroupId && (
                  <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                    {isFetchingWorkers ? (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" /> جاري تحميل العمال...
                      </p>
                    ) : !workersInGroup?.length ? (
                      <p className="text-sm text-muted-foreground">
                        لا يوجد عمال لديهم حضور مسجّل في هذا التاريخ ضمن هذه المجموعة
                      </p>
                    ) : (
                      <>
                        {/* تعميم المبلغ */}
                        <div className="flex items-center gap-2 flex-wrap pb-2">
                          <Label className="whitespace-nowrap font-semibold">
                            تعميم مبلغ على كل عمال المجموعة ({workersInGroup.length} عامل):
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            className="max-w-[140px]"
                            value={groupBulkValue}
                            onChange={(e) => setGroupBulkValue(e.target.value)}
                          />
                          <Button type="button" size="sm" onClick={handleApplyAmountToGroup}>
                            تطبيق المبلغ
                          </Button>
                        </div>

                        {/* تعميم الملاحظة */}
                        <div className="flex items-center gap-2 flex-wrap pb-3 border-b">
                          <Label className="whitespace-nowrap font-semibold">تعميم ملاحظة على كل عمال المجموعة:</Label>
                          <Input
                            type="text"
                            placeholder="ملاحظة..."
                            className="max-w-[220px]"
                            value={groupBulkNote}
                            onChange={(e) => setGroupBulkNote(e.target.value)}
                          />
                          <Button type="button" size="sm" variant="outline" onClick={handleApplyNoteToGroup}>
                            تطبيق الملاحظة
                          </Button>
                        </div>

                        {/* حقول فردية لكل عامل: المبلغ + الملاحظة */}
                        <div className="space-y-2">
                          {workersInGroup.map((w: any) => (
                            <div key={w.workerId} className="grid grid-cols-1 md:grid-cols-[1fr_120px_1fr] gap-2 items-center border-b pb-2 last:border-b-0">
                              <Label className="text-sm truncate">
                                {w.fullName} <span className="text-muted-foreground text-xs">({w.code})</span>
                              </Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="المبلغ"
                                value={amounts[w.workerId] || ''}
                                onChange={(e) => handleWorkerAmountChange(w.workerId, e.target.value)}
                              />
                              <Input
                                type="text"
                                placeholder="ملاحظة (اختياري)"
                                value={workerNotes[w.workerId] || ''}
                                onChange={(e) => handleWorkerNoteChange(w.workerId, e.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>السبب (اختياري، يُطبَّق على كل الاستثناءات المُدخلة هنا)</Label>
                  <Textarea placeholder="أدخل سبب الاستثناء..." value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
                </div>

                <div className="flex justify-end pt-2 border-t">
                  <Button onClick={handleSaveAll} disabled={createBulkMutation.isPending || validEntriesCount === 0}>
                    {createBulkMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin ml-2" />
                    ) : (
                      <Save className="h-4 w-4 ml-2" />
                    )}
                    حفظ ({validEntriesCount} عامل)
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 'idle' && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-40" />
                اضغط "إضافة استثناء" أعلاه للبدء، أو انتقل لتبويب "أرشيف الاستثناءات" لاستعراض كل السجلات السابقة.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===================== تبويب: أرشيف الاستثناءات ===================== */}
        {canViewArchive && (
          <TabsContent value="archive" className="space-y-4 mt-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                {canManageArchive ? 'يمكنك التعديل والحذف والطباعة.' : 'استعراض فقط — لا تملك صلاحية التعديل أو الحذف.'}
              </p>
              <Select value={archiveGroupFilter} onValueChange={setArchiveGroupFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="جميع المجموعات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المجموعات</SelectItem>
                  {allGroups?.map((group: any) => (
                    <SelectItem key={group.id} value={group.id.toString()}>{group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="pt-6">
                {isFetchingArchive ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2 justify-center py-8">
                    <RefreshCw className="h-4 w-4 animate-spin" /> جاري التحميل...
                  </p>
                ) : !archiveData?.length ? (
                  <div className="text-center py-8">
                    <Archive className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
                    <p className="mt-2 text-muted-foreground">لا توجد استثناءات في الأرشيف</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">العامل</TableHead>
                          <TableHead className="text-right">المجموعة</TableHead>
                          <TableHead className="text-right">التاريخ</TableHead>
                          <TableHead className="text-right">النوع</TableHead>
                          <TableHead className="text-right">المبلغ</TableHead>
                          <TableHead className="text-right">الملاحظات</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right">إجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {archiveData.map((record: any) => (
                          <TableRow key={record.id}>
                            <TableCell className="font-medium">
                              {record.workerName}
                              <span className="text-muted-foreground text-sm block">{record.workerCode}</span>
                            </TableCell>
                            <TableCell>{record.groupName || '-'}</TableCell>
                            <TableCell>{new Date(record.overrideDate).toLocaleDateString('ar-SA')}</TableCell>
                            <TableCell>{getTypeBadge(record.overrideType)}</TableCell>
                            <TableCell className="font-semibold">
                              {parseFloat(record.amount?.toString() || '0').toFixed(2)} ر.س
                            </TableCell>
                            <TableCell className="max-w-[180px] truncate">{record.notes || '-'}</TableCell>
                            <TableCell>{getStatusBadge(record.status || 'pending')}</TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {record.status === 'pending' && canManageArchive && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-green-600 hover:text-green-700"
                                      onClick={() => approveMutation.mutate({ overrideId: record.id })}
                                      disabled={approveMutation.isPending}
                                      title="اعتماد"
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-600 hover:text-red-700"
                                      onClick={() => rejectMutation.mutate({ overrideId: record.id })}
                                      disabled={rejectMutation.isPending}
                                      title="رفض"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                                {canManageArchive && (
                                  <>
                                    <Button size="sm" variant="outline" onClick={() => handleOpenEdit(record)} title="تعديل">
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-600 hover:text-red-700"
                                      onClick={() => setDeleteTarget(record)}
                                      title="حذف"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
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
          </TabsContent>
        )}
      </Tabs>

      {/* ===== الخطوة 1: نافذة اختيار النوع والتاريخ ===== */}
      <Dialog open={showTypeDialog} onOpenChange={setShowTypeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة استثناء جديد — تحديد النوع والتاريخ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>تاريخ الاستثناء *</Label>
              <Input type="date" value={overrideDate} onChange={(e) => setOverrideDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>نوع الاستثناء * (اختيار واحد)</Label>
              <div className="grid grid-cols-2 gap-2">
                {OVERRIDE_TYPES.map((type) => {
                  const isSelected = overrideType === type.value;
                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setOverrideType(type.value)}
                      className={`flex items-center gap-2 border-2 rounded-lg p-3 text-sm transition-colors ${
                        isSelected ? `${type.border} ${type.color}` : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <span className={`flex items-center justify-center h-4 w-4 rounded border-2 ${isSelected ? 'bg-primary border-primary' : 'border-gray-400'}`}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </span>
                      {type.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTypeDialog(false)}>إلغاء</Button>
            <Button onClick={handleConfirmTypeAndDate}>
              <ArrowRight className="h-4 w-4 ml-2" />
              متابعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== نافذة تعديل سجل من الأرشيف ===== */}
      <Dialog open={!!editingRecord} onOpenChange={(open) => !open && setEditingRecord(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل الاستثناء — {editingRecord?.workerName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>التاريخ</Label>
              <Input type="date" value={editForm.overrideDate} onChange={(e) => setEditForm((p) => ({ ...p, overrideDate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>النوع</Label>
              <Select value={editForm.overrideType} onValueChange={(v: any) => setEditForm((p) => ({ ...p, overrideType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OVERRIDE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المبلغ (ر.س)</Label>
              <Input type="number" step="0.01" min="0" value={editForm.amount} onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>الملاحظات</Label>
              <Input value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>السبب</Label>
              <Textarea rows={2} value={editForm.reason} onChange={(e) => setEditForm((p) => ({ ...p, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRecord(null)}>إلغاء</Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
              حفظ التعديل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== تأكيد الحذف ===== */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            هل أنت متأكد من حذف استثناء "{deleteTarget?.workerName}" بمبلغ {parseFloat(deleteTarget?.amount?.toString() || '0').toFixed(2)} ر.س؟
            {deleteTarget?.status === 'approved' && ' سيتم تحديث الإضافي في أي مسودة قائمة تلقائياً (سينقص المبلغ).'}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate({ overrideId: deleteTarget.id })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Trash2 className="h-4 w-4 ml-2" />}
              حذف نهائي
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
