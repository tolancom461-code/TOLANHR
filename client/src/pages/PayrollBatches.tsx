import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { PERMISSIONS } from '../../../shared/permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Wallet,
  Plus,
  RefreshCw,
  Eye,
  FileText,
  Calendar,
  Users,
  DollarSign,
  Download,
  Trash2,
  Unlock,
  Lock,
  Printer
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyGroupsMessage } from '@/components/EmptyGroupsMessage';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'مسودة', color: 'bg-gray-100 text-gray-800' },
  under_accountant_review: { label: 'قيد المراجعة المحاسبية', color: 'bg-blue-100 text-blue-800' },
  under_financial_review: { label: 'قيد المراجعة النهائية', color: 'bg-purple-100 text-purple-800' },
  under_accounts_manager_review: { label: 'في انتظار الاعتماد', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'معتمدة', color: 'bg-green-100 text-green-800' },
  rejected_final: { label: 'مرفوضة', color: 'bg-red-100 text-red-800' },
  paid: { label: 'مدفوعة', color: 'bg-teal-100 text-teal-800' },
};

export default function PayrollBatches() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const userRole = user?.role || '';
  // صلاحيات حسب الدور
  const canCreateBatch = userRole === 'super_admin' || userRole === 'admin_affairs';
  const canDeleteBatch = userRole === 'super_admin' || userRole === 'admin_affairs';
  const canSubmitDraft = userRole === 'super_admin' || userRole === 'admin_affairs'; // إرسال المسودة للمحاسب
  const canReviewAsAccountant = userRole === 'super_admin' || userRole === 'accountant'; // المحاسب يعتمد/يرفض
  const canReviewAsAuditor = userRole === 'super_admin' || userRole === 'auditor'; // المراجع يعتمد/يرفض
  const canApproveAsFM = userRole === 'super_admin' || userRole === 'finance_manager'; // المدير المالي يعتمد/يرفض
  const hasPermission = () => canCreateBatch; // للتوافق مع الكود القديم
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [unlockReason, setUnlockReason] = useState('');
  
  // Workflow dialogs state
  const [showSubmitToAccountingDialog, setShowSubmitToAccountingDialog] = useState(false);
  const [showSubmitToFinalReviewDialog, setShowSubmitToFinalReviewDialog] = useState(false);
  const [showSubmitForApprovalDialog, setShowSubmitForApprovalDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [workflowReason, setWorkflowReason] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<number | null>(null);
  
  const exportExcelMutation = trpc.export.payrollReport.useMutation({
    onSuccess: (data) => {
      // Convert base64 to blob
      const byteCharacters = atob(data.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      // Download file
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('تم تصدير التقرير بنجاح');
    },
    onError: (error) => {
      toast.error('فشل تصدير التقرير: ' + error.message);
    },
  });
  
  // Form state
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // Get groups filtered by selected cost center
  const costCenterId = selectedCostCenter !== 'all' ? parseInt(selectedCostCenter) : undefined;
  const { data: groups } = trpc.groups.listByCostCenter.useQuery(
    { costCenterId },
    { enabled: true }
  );
  const { data: costCenters } = trpc.costCenters.list.useQuery();
  const { data: paginatedBatches, refetch } = trpc.payroll.listBatches.useQuery({
    page: currentPage,
    limit: pageSize,
  });
  
  const batches = paginatedBatches?.data || [];
  const { data: batchDetails } = trpc.payroll.getDetails.useQuery(
    { batchId: selectedBatchId! },
    { enabled: !!selectedBatchId }
  );
  
  const createMutation = trpc.payroll.createBatch.useMutation({
    onSuccess: (result) => {
      toast.success(`تم إنشاء الدفعة ${result.batchCode} بنجاح`);
      refetch();
      setShowCreateDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ');
    }
  });

  const deleteMutation = trpc.payroll.deleteBatch.useMutation({
    onSuccess: () => {
      toast.success('تم حذف المسودة بنجاح');
      refetch();
      setShowDetailsDialog(false);
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ في حذف المسودة');
    }
  });

  const handleDeleteDraft = (batchId: number) => {
    if (confirm('هل أنت متأكد من حذف هذه المسودة؟ سيتم إلغاء قفل جميع سجلات الحضور المرتبطة.')) {
      deleteMutation.mutate({ batchId });
    }
  };

  const forceUnlockMutation = trpc.payroll.forceUnlock.useMutation({
    onSuccess: () => {
      toast.success('تم إلغاء قفل الدفعة بنجاح');
      refetch();
      setShowUnlockDialog(false);
      setUnlockReason('');
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ في إلغاء القفل');
    }
  });

  const relockMutation = trpc.payroll.relock.useMutation({
    onSuccess: () => {
      toast.success('تم إعادة قفل الدفعة بنجاح');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ في إعادة القفل');
    }
  });

  const handleForceUnlock = () => {
    if (!unlockReason || unlockReason.length < 10) {
      toast.error('يجب إدخال سبب واضح (10 أحرف على الأقل)');
      return;
    }
    forceUnlockMutation.mutate({ batchId: selectedBatchId!, reason: unlockReason });
  };
  
  // Workflow mutations
  const submitToAccountingMutation = trpc.payroll.submitToAccounting.useMutation({
    onSuccess: () => {
      toast.success('تم إرسال الدفعة للمحاسب المالي بنجاح');
      refetch();
      setShowSubmitToAccountingDialog(false);
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ');
    }
  });
  
  const submitToFinalReviewMutation = trpc.payroll.submitToFinalReview.useMutation({
    onSuccess: () => {
      toast.success('تم إرسال الدفعة للمراجع بنجاح');
      refetch();
      setShowSubmitToFinalReviewDialog(false);
      setWorkflowReason('');
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ');
    }
  });
  
  const submitForApprovalMutation = trpc.payroll.submitForApproval.useMutation({
    onSuccess: () => {
      toast.success('تم إرسال الدفعة للمدير المالي بنجاح');
      refetch();
      setShowSubmitForApprovalDialog(false);
      setWorkflowReason('');
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ');
    }
  });
  
  const approveBatchMutation = trpc.payroll.approveBatchFinal.useMutation({
    onSuccess: () => {
      toast.success('تم اعتماد الدفعة بنجاح');
      refetch();
      setShowApproveDialog(false);
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ');
    }
  });
  
  const rejectBatchMutation = trpc.payroll.rejectBatchFinal.useMutation({
    onSuccess: () => {
      toast.success('تم رفض الدفعة وإرجاعها كمسودة للشؤون الإدارية');
      refetch();
      setShowRejectDialog(false);
      setWorkflowReason('');
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ');
    }
  });
  
  const handleSubmitToAccounting = () => {
    submitToAccountingMutation.mutate({ batchId: selectedBatchId! });
  };
  
  const handleSubmitToFinalReview = () => {
    submitToFinalReviewMutation.mutate({ batchId: selectedBatchId!, reason: workflowReason });
  };
  
  const handleSubmitForApproval = () => {
    submitForApprovalMutation.mutate({ batchId: selectedBatchId!, reason: workflowReason });
  };
  
  const handleApproveBatch = () => {
    approveBatchMutation.mutate({ batchId: selectedBatchId! });
  };
  
  const handleRejectBatch = () => {
    if (!workflowReason || workflowReason.length < 10) {
      toast.error('يجب إدخال سبب الرفض (10 أحرف على الأقل)');
      return;
    }
    rejectBatchMutation.mutate({ batchId: selectedBatchId!, reason: workflowReason });
  };

  const resetForm = () => {
    setPeriodStart('');
    setPeriodEnd('');
    setSelectedGroup('all');
    setSelectedCostCenter('all');
  };

  const handleCreate = async () => {
    if (!periodStart || !periodEnd) {
      toast.error('يرجى تحديد فترة الرواتب');
      return;
    }
    
    // Check if selected group has schedules
    if (selectedGroup !== 'all') {
      const groupId = parseInt(selectedGroup);
      const hasSchedules = await utils.groups.checkHasSchedules.fetch({ groupId });
      
      if (!hasSchedules) {
        toast.error('المجموعة المختارة لا تحتوي على جدول أسبوعي. يرجى إضافة جدول أولاً.', {
          action: {
            label: 'إضافة جدول',
            onClick: () => window.location.href = '/schedules/weekly'
          },
          duration: 5000,
        });
        return;
      }
    }
    
    createMutation.mutate({
      periodStart,
      periodEnd,
      groupId: selectedGroup !== 'all' ? parseInt(selectedGroup) : undefined,
      costCenterId: selectedCostCenter !== 'all' ? parseInt(selectedCostCenter) : undefined,
      items: [], // Empty items - will be populated later
    });
  };

  const handleViewDetails = (batchId: number) => {
    setSelectedBatchId(batchId);
    setShowDetailsDialog(true);
  };

  const [isForceDelete, setIsForceDelete] = useState(false);

  const handleDeleteBatch = (batchId: number, force: boolean = false) => {
    setBatchToDelete(batchId);
    setIsForceDelete(force);
    setShowDeleteDialog(true);
  };

  const deleteBatchMutation = trpc.payroll.deleteBatch.useMutation({
    onSuccess: () => {
      toast.success('تم حذف الدفعة بنجاح');
      setShowDeleteDialog(false);
      setBatchToDelete(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`فشل حذف الدفعة: ${error.message}`);
    },
  });

  const confirmDelete = () => {
    if (batchToDelete) {
      deleteBatchMutation.mutate({ batchId: batchToDelete, forceDelete: isForceDelete || undefined });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusInfo = STATUS_LABELS[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
    return <Badge className={statusInfo.color}>{statusInfo.label}</Badge>;
  };

  // Calculate totals
  const totalAmount = batches?.reduce((sum: number, b: any) => sum + parseFloat(b.totalAmount?.toString() || '0'), 0) || 0;
  const draftCount = batches?.filter((b: any) => b.status === 'draft').length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6" />
            دفعات الرواتب
          </h1>
          <p className="text-muted-foreground">
            إنشاء وإدارة دفعات الرواتب
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission() && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 ml-2" />
              إنشاء دفعة
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{batches?.length || 0}</p>
                <p className="text-sm text-muted-foreground">إجمالي الدفعات</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <FileText className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{draftCount}</p>
                <p className="text-sm text-muted-foreground">مسودات</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalAmount.toFixed(2)} ر.س</p>
                <p className="text-sm text-muted-foreground">إجمالي المبالغ</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Batches Table */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة الدفعات</CardTitle>
          <CardDescription>جميع دفعات الرواتب المنشأة</CardDescription>
        </CardHeader>
        <CardContent>
          {!batches?.length ? (
            <div className="text-center py-8">
              <Wallet className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
              <p className="mt-2 text-muted-foreground">لا توجد دفعات رواتب</p>
              <Button variant="outline" className="mt-4" onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 ml-2" />
                إنشاء أول دفعة
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رمز الدفعة</TableHead>
                    <TableHead className="text-right">الفترة</TableHead>
                    <TableHead className="text-right">المجموع</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch: any) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-mono font-medium">
                        {batch.batchCode}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {new Date(batch.periodStart).toLocaleDateString('ar-SA')} - {new Date(batch.periodEnd).toLocaleDateString('ar-SA')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {parseFloat(batch.totalAmount?.toString() || '0').toFixed(2)} ر.س
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(batch.status || 'draft')}
                      </TableCell>
                      <TableCell>
                        {new Date(batch.createdAt).toLocaleDateString('ar-SA')}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetails(batch.id)}
                          >
                            <Eye className="h-4 w-4 ml-1" />
                            استعراض
                          </Button>
                          {batch.status === 'draft' && canDeleteBatch && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteBatch(batch.id)}
                            >
                              <Trash2 className="h-4 w-4 ml-1" />
                              حذف
                            </Button>
                          )}
                          {batch.status !== 'draft' && userRole === 'super_admin' && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteBatch(batch.id, true)}
                            >
                              <Trash2 className="h-4 w-4 ml-1" />
                              حذف نهائي
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {/* Pagination Controls */}
              {paginatedBatches && paginatedBatches.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    عرض {((currentPage - 1) * pageSize) + 1} إلى {Math.min(currentPage * pageSize, paginatedBatches.total)} من {paginatedBatches.total}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      السابق
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: paginatedBatches.totalPages }, (_, i) => i + 1).map(page => (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                          className="w-8 h-8 p-0"
                        >
                          {page}
                        </Button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(paginatedBatches.totalPages, prev + 1))}
                      disabled={currentPage === paginatedBatches.totalPages}
                    >
                      التالي
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إنشاء دفعة رواتب جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>بداية الفترة *</Label>
                <Input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>نهاية الفترة *</Label>
                <Input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>المجموعة (اختياري)</Label>
              {groups && groups.length === 0 && selectedCostCenter !== 'all' ? (
                <EmptyGroupsMessage 
                  costCenterName={costCenters?.find(cc => cc.id.toString() === selectedCostCenter)?.name || 'مركز التكلفة'}
                />
              ) : (
                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                  <SelectTrigger>
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
              )}
            </div>
            <div className="space-y-2">
              <Label>مركز التكلفة (اختياري)</Label>
              <Select value={selectedCostCenter} onValueChange={setSelectedCostCenter}>
                <SelectTrigger>
                  <SelectValue placeholder="جميع مراكز التكلفة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع مراكز التكلفة</SelectItem>
                  {costCenters?.map((cc) => (
                    <SelectItem key={cc.id} value={cc.id.toString()}>
                      {cc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              إنشاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              تفاصيل الدفعة: {batchDetails?.batch?.batchCode}
            </DialogTitle>
          </DialogHeader>
          {batchDetails && (
            <div className="space-y-4">
              {/* Batch Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">الفترة</p>
                  <p className="font-medium">
                    {new Date(batchDetails.batch.periodStart).toLocaleDateString('ar-SA')} - {new Date(batchDetails.batch.periodEnd).toLocaleDateString('ar-SA')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">الحالة</p>
                  <p>{getStatusBadge(batchDetails.batch.status || 'draft')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">عدد العمال</p>
                  <p className="font-medium">{batchDetails.items?.length || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">المجموع</p>
                  <p className="font-bold text-lg">
                    {parseFloat(batchDetails.batch.totalAmount?.toString() || '0').toFixed(2)} ر.س
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center gap-2">
                <div className="flex gap-2 flex-wrap">
                  {/* Draft Stage: الشؤون الإدارية فقط - حذف + إرسال للمحاسب */}
                  {batchDetails.batch.status === 'draft' && (
                    <>
                      {canDeleteBatch && (
                        <Button 
                          variant="destructive"
                          onClick={() => handleDeleteDraft(selectedBatchId!)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 ml-2" />
                          {deleteMutation.isPending ? 'جاري الحذف...' : 'حذف المسودة'}
                        </Button>
                      )}
                      {canSubmitDraft && (
                        <Button 
                          onClick={() => {
                            setSelectedBatchId(batchDetails.batch.id);
                            setShowSubmitToAccountingDialog(true);
                          }}
                        >
                          إرسال للمحاسب
                        </Button>
                      )}
                    </>
                  )}
                  
                  {/* Accountant Review Stage: المحاسب فقط - اعتماد (إرسال للمراجع) + رفض (تعود draft) */}
                  {batchDetails.batch.status === 'under_accountant_review' && canReviewAsAccountant && (
                    <>
                      <Button 
                        onClick={() => {
                          setSelectedBatchId(batchDetails.batch.id);
                          setShowSubmitToFinalReviewDialog(true);
                        }}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        اعتماد وإرسال للمراجع
                      </Button>
                      <Button 
                        variant="destructive"
                        onClick={() => {
                          setSelectedBatchId(batchDetails.batch.id);
                          setShowRejectDialog(true);
                        }}
                      >
                        رفض (إرجاع للشؤون الإدارية)
                      </Button>
                    </>
                  )}
                  
                  {/* Financial Review Stage: المراجع فقط - اعتماد (إرسال للمدير المالي) + رفض (تعود draft) */}
                  {batchDetails.batch.status === 'under_financial_review' && canReviewAsAuditor && (
                    <>
                      <Button 
                        onClick={() => {
                          setSelectedBatchId(batchDetails.batch.id);
                          setShowSubmitForApprovalDialog(true);
                        }}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        اعتماد وإرسال للمدير المالي
                      </Button>
                      <Button 
                        variant="destructive"
                        onClick={() => {
                          setSelectedBatchId(batchDetails.batch.id);
                          setShowRejectDialog(true);
                        }}
                      >
                        رفض (إرجاع للشؤون الإدارية)
                      </Button>
                    </>
                  )}
                  
                  {/* Manager Approval Stage: المدير المالي فقط - اعتماد نهائي + رفض (تعود draft) */}
                  {batchDetails.batch.status === 'under_accounts_manager_review' && canApproveAsFM && (
                    <>
                      <Button 
                        onClick={() => {
                          setSelectedBatchId(batchDetails.batch.id);
                          setShowApproveDialog(true);
                        }}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        اعتماد نهائي
                      </Button>
                      <Button 
                        variant="destructive"
                        onClick={() => {
                          setSelectedBatchId(batchDetails.batch.id);
                          setShowRejectDialog(true);
                        }}
                      >
                        رفض (إرجاع للشؤون الإدارية)
                      </Button>
                    </>
                  )}
                  
                  {/* Unlock/Relock Buttons (for non-draft batches) */}
                  {batchDetails.batch.status !== 'draft' && batchDetails.batch.status !== 'approved' && (
                    <>
                      {batchDetails.batch.isUnlocked ? (
                        <Button 
                          variant="outline"
                          onClick={() => relockMutation.mutate({ batchId: selectedBatchId! })}
                          disabled={relockMutation.isPending}
                        >
                          <Lock className="h-4 w-4 ml-2" />
                          {relockMutation.isPending ? 'جاري إعادة القفل...' : 'إعادة القفل'}
                        </Button>
                      ) : (
                        <Button 
                          variant="outline"
                          onClick={() => {
                            setSelectedBatchId(batchDetails.batch.id);
                            setShowUnlockDialog(true);
                          }}
                        >
                          <Unlock className="h-4 w-4 ml-2" />
                          إلغاء القفل
                        </Button>
                      )}
                    </>
                  )}
                </div>
                
                {/* Export Button */}
                {hasPermission() && (                  <Button 
                    onClick={() => exportExcelMutation.mutate({ batchId: selectedBatchId! })}
                    disabled={exportExcelMutation.isPending}
                  >
                    <Download className="h-4 w-4 ml-2" />
                  {exportExcelMutation.isPending ? 'جاري التصدير...' : 'تصدير Excel'}
                </Button>
                )}
              </div>

              {/* Print Button */}
              <div className="flex justify-end print:hidden">
                <Button
                  variant="outline"
                  onClick={() => {
                    const printContent = document.getElementById('batch-details-print');
                    if (printContent) {
                      const printWindow = window.open('', '_blank');
                      if (printWindow) {
                        printWindow.document.write(`
                          <html dir="rtl" lang="ar">
                          <head>
                            <title>كشف رواتب - ${batchDetails.batch.batchCode}</title>
                            <style>
                              body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 20px; direction: rtl; }
                              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                              th, td { border: 1px solid #333; padding: 8px; text-align: right; font-size: 13px; }
                              th { background-color: #f0f0f0; font-weight: bold; }
                              .header { text-align: center; margin-bottom: 20px; }
                              .header h2 { margin: 5px 0; }
                              .info-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
                              .total-row { font-weight: bold; background-color: #f9f9f9; }
                              .signature-col { width: 120px; min-height: 40px; }
                              .footer { text-align: center; font-size: 11px; color: #666; margin-top: 30px; border-top: 1px solid #ccc; padding-top: 10px; }
                              @media print { body { padding: 0; } }
                            </style>
                          </head>
                          <body>
                            <div class="header">
                              <h2>كشف رواتب العمال اليومية</h2>
                              <p>رمز الدفعة: ${batchDetails.batch.batchCode}</p>
                            </div>
                            <div class="info-row">
                              <span>الفترة: ${new Date(batchDetails.batch.periodStart).toLocaleDateString('en-GB').replace(/\//g, '-')} إلى ${new Date(batchDetails.batch.periodEnd).toLocaleDateString('en-GB').replace(/\//g, '-')}</span>
                              <span>الحالة: ${STATUS_LABELS[batchDetails.batch.status || 'draft']?.label || batchDetails.batch.status}</span>
                            </div>
                            <table>
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>العامل</th>
                                  <th>الرمز</th>
                                  <th>أيام العمل</th>
                                  <th>المستحق</th>
                                  <th>الخصومات</th>
                                  <th>المكافآت</th>
                                  <th>الصافي</th>
                                  <th>توقيع المستلم</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${batchDetails.items?.map((item, idx) => `
                                  <tr>
                                    <td>${idx + 1}</td>
                                    <td>${item.workerName}</td>
                                    <td>${item.workerCode}</td>
                                    <td style="text-align:center">${item.daysWorked}</td>
                                    <td>${parseFloat(item.baseAmount?.toString() || '0').toFixed(2)}</td>
                                    <td style="color:red">${parseFloat(item.totalDeductions?.toString() || '0').toFixed(2)}</td>
                                    <td style="color:green">${parseFloat(item.totalBonuses?.toString() || '0').toFixed(2)}</td>
                                    <td style="font-weight:bold">${parseFloat(item.netAmount?.toString() || '0').toFixed(2)}</td>
                                    <td class="signature-col"></td>
                                  </tr>
                                `).join('') || ''}
                                <tr class="total-row">
                                  <td colspan="4">الإجمالي</td>
                                  <td>${parseFloat(batchDetails.batch.totalAmount?.toString() || '0').toFixed(2)}</td>
                                  <td>${parseFloat(batchDetails.batch.totalDeductions?.toString() || '0').toFixed(2)}</td>
                                  <td>${parseFloat(batchDetails.batch.totalBonuses?.toString() || '0').toFixed(2)}</td>
                                  <td>${(parseFloat(batchDetails.batch.totalAmount?.toString() || '0') - parseFloat(batchDetails.batch.totalDeductions?.toString() || '0') + parseFloat(batchDetails.batch.totalBonuses?.toString() || '0')).toFixed(2)}</td>
                                  <td></td>
                                </tr>
                              </tbody>
                            </table>
                            <div class="footer">
                              <p>تم إنشاء هذا الكشف بواسطة نظام إدارة العمالة اليومية — تاريخ الطباعة: ${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')} | وقت الطباعة: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} — تمت الطباعة بواسطة: ${user?.fullName || user?.username || 'غير معروف'}</p>
                            </div>
                          </body>
                          </html>
                        `);
                        printWindow.document.close();
                        printWindow.print();
                      }
                    }
                  }}
                >
                  <Printer className="h-4 w-4 ml-2" />
                  طباعة الكشف
                </Button>
              </div>

              {/* Items Table */}
              <div id="batch-details-print">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">العامل</TableHead>
                    <TableHead className="text-right">أيام العمل</TableHead>
                    <TableHead className="text-right">المستحق</TableHead>
                    <TableHead className="text-right">الخصومات</TableHead>
                    <TableHead className="text-right">المكافآت</TableHead>
                    <TableHead className="text-right">الصافي</TableHead>
                    <TableHead className="text-right w-[120px]">توقيع المستلم</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchDetails.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.workerName}</p>
                          <p className="text-sm text-muted-foreground">{item.workerCode}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{item.daysWorked}</TableCell>
                      <TableCell className="font-mono">
                        {parseFloat(item.baseAmount?.toString() || '0').toFixed(2)}
                      </TableCell>
                      <TableCell className="font-mono text-red-600">
                        {parseFloat(item.totalDeductions?.toString() || '0').toFixed(2)}
                      </TableCell>
                      <TableCell className="font-mono text-green-600">
                        {parseFloat(item.totalBonuses?.toString() || '0').toFixed(2)}
                      </TableCell>
                      <TableCell className="font-mono font-semibold">
                        {parseFloat(item.netAmount?.toString() || '0').toFixed(2)}
                      </TableCell>
                      <TableCell className="w-[120px]">
                        {/* عمود فارغ للتوقيع اليدوي */}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Unlock Dialog */}
      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إلغاء قفل دفعة الراتب</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ تحذير: إلغاء القفل سيسمح بتعديل سجلات الحضور والمالية المرتبطة بهذه الدفعة. هذه العملية لحالات الطوارئ فقط.
              </p>
            </div>
            <div className="space-y-2">
              <Label>سبب إلغاء القفل * (10 أحرف على الأقل)</Label>
              <Textarea
                value={unlockReason}
                onChange={(e) => setUnlockReason(e.target.value)}
                placeholder="مثال: تم اكتشاف خطأ في حساب راتب أحد العمال ويجب تصحيحه"
                rows={4}
                className="resize-none"
              />
              <p className="text-sm text-muted-foreground">
                عدد الأحرف: {unlockReason.length}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowUnlockDialog(false);
                setUnlockReason('');
              }}
            >
              إلغاء
            </Button>
            <Button 
              onClick={handleForceUnlock}
              disabled={forceUnlockMutation.isPending || unlockReason.length < 10}
            >
              {forceUnlockMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Unlock className="h-4 w-4 ml-2" />
              )}
              إلغاء القفل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Submit to Accounting Dialog */}
      <Dialog open={showSubmitToAccountingDialog} onOpenChange={setShowSubmitToAccountingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إرسال للمحاسب المالي</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من إرسال هذه الدفعة للمحاسب المالي للمراجعة؟
          </p>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowSubmitToAccountingDialog(false)}
            >
              إلغاء
            </Button>
            <Button 
              onClick={handleSubmitToAccounting}
              disabled={submitToAccountingMutation.isPending}
            >
              {submitToAccountingMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-2" />
              ) : null}
              إرسال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Submit to Final Review Dialog */}
      <Dialog open={showSubmitToFinalReviewDialog} onOpenChange={setShowSubmitToFinalReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إرسال للمراجع</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              سيتم اعتماد الدفعة من المحاسب وإرسالها للمراجع المالي.
            </p>
            <div>
              <Label>ملاحظات المحاسب (اختياري)</Label>
              <Textarea 
                value={workflowReason}
                onChange={(e) => setWorkflowReason(e.target.value)}
                placeholder="أدخل أي ملاحظات أو تعديلات تمت..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowSubmitToFinalReviewDialog(false);
                setWorkflowReason('');
              }}
            >
              إلغاء
            </Button>
            <Button 
              onClick={handleSubmitToFinalReview}
              disabled={submitToFinalReviewMutation.isPending}
            >
              {submitToFinalReviewMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-2" />
              ) : null}
              إرسال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Submit for Approval Dialog */}
      <Dialog open={showSubmitForApprovalDialog} onOpenChange={setShowSubmitForApprovalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إرسال للمدير المالي</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              سيتم اعتماد الدفعة من المراجع وإرسالها للمدير المالي للاعتماد النهائي.
            </p>
            <div>
              <Label>ملاحظات المراجع (اختياري)</Label>
              <Textarea 
                value={workflowReason}
                onChange={(e) => setWorkflowReason(e.target.value)}
                placeholder="أدخل أي ملاحظات أو تعديلات تمت..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowSubmitForApprovalDialog(false);
                setWorkflowReason('');
              }}
            >
              إلغاء
            </Button>
            <Button 
              onClick={handleSubmitForApproval}
              disabled={submitForApprovalMutation.isPending}
            >
              {submitForApprovalMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-2" />
              ) : null}
              إرسال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>اعتماد الدفعة</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من اعتماد هذه الدفعة؟ لن تتمكن من التعديل بعد الاعتماد.
          </p>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowApproveDialog(false)}
            >
              إلغاء
            </Button>
            <Button 
              onClick={handleApproveBatch}
              disabled={approveBatchMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {approveBatchMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-2" />
              ) : null}
              اعتماد
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
            <p className="text-sm text-muted-foreground">
              سيتم إرجاع الدفعة كمسودة للشؤون الإدارية لإعادة التعديل والإرسال من جديد.
            </p>
            <div>
              <Label>سبب الرفض *</Label>
              <Textarea 
                value={workflowReason}
                onChange={(e) => setWorkflowReason(e.target.value)}
                placeholder="يجب إدخال سبب واضح للرفض (10 أحرف على الأقل)"
                rows={3}
                className={workflowReason.length > 0 && workflowReason.length < 10 ? 'border-red-500' : ''}
              />
              {workflowReason.length > 0 && workflowReason.length < 10 && (
                <p className="text-xs text-red-500 mt-1">
                  يجب أن يكون السبب 10 أحرف على الأقل
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowRejectDialog(false);
                setWorkflowReason('');
              }}
            >
              إلغاء
            </Button>
            <Button 
              onClick={handleRejectBatch}
              disabled={rejectBatchMutation.isPending || workflowReason.length < 10}
              variant="destructive"
            >
              {rejectBatchMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-2" />
              ) : null}
              رفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد حذف الدفعة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isForceDelete 
                ? 'Are you sure you want to delete this batch? This is a permanent deletion and cannot be undone.'
                : 'هل أنت متأكد من حذف هذه المسودة؟'}
            </p>
            <div className={`rounded-lg p-3 ${isForceDelete ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}>
              <p className={`text-sm ${isForceDelete ? 'text-red-800' : 'text-yellow-800'}`}>
                <strong>{isForceDelete ? 'تحذير:' : 'ملاحظة:'}</strong> {isForceDelete 
                  ? 'سيتم حذف الدفعة وجميع البيانات المرتبطة بها بشكل نهائي ولا يمكن استرجاعها. هذا الإجراء متاح فقط للمسؤول الأعلى (Super Admin).'
                  : 'سيتم حذف المسودة وإلغاء قفل سجلات الحضور المرتبطة.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowDeleteDialog(false);
                setBatchToDelete(null);
              }}
              disabled={deleteBatchMutation.isPending}
            >
              إلغاء
            </Button>
            <Button 
              onClick={confirmDelete}
              disabled={deleteBatchMutation.isPending}
              variant="destructive"
            >
              {deleteBatchMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-2" />
              ) : null}
              حذف نهائياً
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
