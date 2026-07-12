import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Filter,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'مسودة', color: 'bg-gray-100 text-gray-800' },
  under_accountant_review: { label: 'قيد المراجعة المحاسبية', color: 'bg-blue-100 text-blue-800' },
  under_financial_review: { label: 'قيد المراجعة النهائية', color: 'bg-purple-100 text-purple-800' },
  under_accounts_manager_review: { label: 'في انتظار الاعتماد', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'معتمدة', color: 'bg-green-100 text-green-800' },
  rejected_final: { label: 'مرفوضة', color: 'bg-red-100 text-red-800' },
  paid: { label: 'مدفوعة', color: 'bg-teal-100 text-teal-800' },
};

export default function PayrollManagement() {
  const [activeTab, setActiveTab] = useState('list');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    costCenterId: undefined as number | undefined,
    groupId: undefined as number | undefined,
    startDate: '',
    endDate: '',
  });

  // Fetch data
  const { data: paginatedBatches, isLoading, refetch } = trpc.payroll.listBatches.useQuery({
    ...filters,
    page: 1,
    limit: 100,
  });
  
  const batches = paginatedBatches?.data || [];

  const { data: costCenters } = trpc.costCenters.list.useQuery();
  
  // Get groups filtered by cost center
  const { data: filteredGroups } = trpc.groups.listByCostCenter.useQuery(
    { costCenterId: filters.costCenterId },
    { enabled: true }
  );
  
  // Also keep allGroups for backward compatibility
  const allGroups = filteredGroups;

  // Create batch mutation
  const createBatchMutation = trpc.payroll.createBatch.useMutation({
    onSuccess: () => {
      toast.success('تم إنشاء دفعة الرواتب بنجاح');
      setShowCreateDialog(false);
      refetch();
    },
    onError: (error: any) => {
      toast.error(`خطأ: ${error?.message || 'خطأ غير معروف'}`);
    },
  });

  // Delete batch mutation
  const deleteBatchMutation = trpc.payroll.deleteBatch.useMutation({
    onSuccess: () => {
      toast.success('تم حذف دفعة الرواتب');
      refetch();
    },
    onError: (error: any) => {
      toast.error(`خطأ: ${error?.message || 'خطأ غير معروف'}`);
    },
  });

  const handleCreateBatch = () => {
    // Implementation for creating batch
    toast.info('سيتم تنفيذ إنشاء دفعة جديدة');
  };

  const handleViewDetails = (batchId: number) => {
    setSelectedBatchId(batchId);
    setShowDetailsDialog(true);
  };

  const handleDeleteBatch = (batchId: number) => {
    if (confirm('هل أنت متأكد من حذف هذه الدفعة؟')) {
      deleteBatchMutation.mutate({ batchId });
    }
  };

  const handleExportExcel = () => {
    toast.info('جاري تصدير البيانات...');
  };

  const handleApplyFilters = () => {
    refetch();
    toast.success('تم تطبيق الفلاتر');
  };

  const handleResetFilters = () => {
    setFilters({
      costCenterId: undefined,
      groupId: undefined,
      startDate: '',
      endDate: '',
    });
    setStatusFilter('all');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="w-8 h-8 text-blue-600" />
              إدارة الرواتب
            </h1>
            <p className="text-slate-600 mt-1">إنشاء وإدارة دفعات الرواتب</p>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            دفعة رواتب جديدة
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
            <TabsTrigger value="list">قائمة الدفعات</TabsTrigger>
            <TabsTrigger value="create">إنشاء دفعة</TabsTrigger>
            <TabsTrigger value="history">السجل</TabsTrigger>
            <TabsTrigger value="reports">التقارير</TabsTrigger>
          </TabsList>

          {/* List Tab */}
          <TabsContent value="list" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="w-5 h-5 text-slate-600" />
                    <h3 className="font-semibold text-slate-900">الفلاتر</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    {showFilters ? 'إخفاء' : 'إظهار'}
                  </Button>
                </div>
              </CardHeader>
              {showFilters && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Status Filter */}
                    <div>
                      <Label>الحالة</Label>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">جميع الحالات</SelectItem>
                          <SelectItem value="draft">مسودة</SelectItem>
                          <SelectItem value="under_accountant_review">قيد المراجعة</SelectItem>
                          <SelectItem value="approved">معتمدة</SelectItem>
                          <SelectItem value="paid">مدفوعة</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Cost Center Filter */}
                    <div>
                      <Label>مركز التكلفة</Label>
                      <Select
                        value={filters.costCenterId?.toString() || ''}
                        onValueChange={(val) =>
                          setFilters({
                            ...filters,
                            costCenterId: val ? parseInt(val) : undefined,
                            groupId: undefined,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="اختر مركز التكلفة" />
                        </SelectTrigger>
                        <SelectContent>
                          {costCenters?.map((cc) => (
                            <SelectItem key={cc.id} value={cc.id.toString()}>
                              {cc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Group Filter */}
                    <div>
                      <Label>المجموعة</Label>
                      <Select
                        value={filters.groupId?.toString() || ''}
                        onValueChange={(val) =>
                          setFilters({
                            ...filters,
                            groupId: val ? parseInt(val) : undefined,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="اختر المجموعة" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredGroups?.map((g) => (
                            <SelectItem key={g.id} value={g.id.toString()}>
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Date Range */}
                    <div>
                      <Label>نطاق التاريخ</Label>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={filters.startDate}
                          onChange={(e) =>
                            setFilters({ ...filters, startDate: e.target.value })
                          }
                          placeholder="من"
                        />
                        <Input
                          type="date"
                          value={filters.endDate}
                          onChange={(e) =>
                            setFilters({ ...filters, endDate: e.target.value })
                          }
                          placeholder="إلى"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Filter Buttons */}
                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={handleApplyFilters}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      تطبيق الفلاتر
                    </Button>
                    <Button
                      onClick={handleResetFilters}
                      variant="outline"
                    >
                      إعادة تعيين
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Batches Table */}
            <Card>
              <CardHeader>
                <CardTitle>دفعات الرواتب</CardTitle>
                <CardDescription>
                  {batches?.length || 0} دفعة
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">جاري التحميل...</div>
                ) : batches?.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    لا توجد دفعات رواتب
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>الرقم</TableHead>
                          <TableHead>الفترة</TableHead>
                          <TableHead>الحالة</TableHead>
                          <TableHead>عدد الموظفين</TableHead>
                          <TableHead>الإجمالي</TableHead>
                          <TableHead>الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batches?.map((batch: any) => (
                          <TableRow key={batch.id}>
                            <TableCell className="font-medium">
                              دفعة #{batch.id}
                            </TableCell>
                            <TableCell>
                              {new Date(batch.payPeriodStart).toLocaleDateString('ar-SA')} -{' '}
                              {new Date(batch.payPeriodEnd).toLocaleDateString('ar-SA')}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={STATUS_LABELS[batch.status]?.color}
                              >
                                {STATUS_LABELS[batch.status]?.label || batch.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{batch.workerCount || 0}</TableCell>
                            <TableCell>
                              {batch.totalAmount?.toLocaleString('ar-SA', {
                                style: 'currency',
                                currency: 'SAR',
                              })}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewDetails(batch.id)}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteBatch(batch.id)}
                                >
                                  <Trash2 className="w-4 h-4 text-red-600" />
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
          </TabsContent>

          {/* Create Tab */}
          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>إنشاء دفعة رواتب جديدة</CardTitle>
                <CardDescription>
                  ملء النموذج أدناه لإنشاء دفعة رواتب جديدة
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>اسم الدفعة</Label>
                      <Input placeholder="مثال: رواتب يناير 2026" />
                    </div>
                    <div>
                      <Label>مركز التكلفة</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر مركز التكلفة" />
                        </SelectTrigger>
                        <SelectContent>
                          {costCenters?.map((cc) => (
                            <SelectItem key={cc.id} value={cc.id.toString()}>
                              {cc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>تاريخ البداية</Label>
                      <Input type="date" />
                    </div>
                    <div>
                      <Label>تاريخ النهاية</Label>
                      <Input type="date" />
                    </div>
                  </div>

                  <div>
                    <Label>ملاحظات</Label>
                    <Textarea placeholder="أضف أي ملاحظات إضافية" />
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button className="bg-blue-600 hover:bg-blue-700">
                      إنشاء الدفعة
                    </Button>
                    <Button variant="outline">إلغاء</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>سجل الدفعات</CardTitle>
                <CardDescription>
                  عرض جميع دفعات الرواتب السابقة
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-slate-500">
                  سيتم عرض سجل الدفعات هنا
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <CardTitle>التقارير</CardTitle>
                <CardDescription>
                  تقارير شاملة عن الرواتب والدفعات
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button variant="outline" className="h-20 flex flex-col items-center justify-center gap-2">
                    <FileText className="w-6 h-6" />
                    <span>تقرير الرواتب</span>
                  </Button>
                  <Button variant="outline" className="h-20 flex flex-col items-center justify-center gap-2">
                    <Download className="w-6 h-6" />
                    <span>تصدير Excel</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
