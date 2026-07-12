import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { numberToArabicWords } from '@/lib/numberToArabicWords';
import { useAuth } from '@/_core/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Download, Printer, Eye, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  under_accountant_review: 'تحت مراجعة المحاسب',
  under_financial_review: 'تحت المراجعة المالية',
  under_manager_review: 'تحت مراجعة المدير',
  under_accounts_manager_review: 'في انتظار الاعتماد',
  approved: 'موافق عليها',
  paid: 'مدفوعة',
  rejected_final: 'مرفوضة نهائياً',
  returned_from_accountant: 'مرجوعة من المحاسب',
  returned_from_financial_review: 'مرجوعة من المراجعة المالية',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  under_accountant_review: 'bg-blue-100 text-blue-800',
  under_financial_review: 'bg-purple-100 text-purple-800',
  under_manager_review: 'bg-indigo-100 text-indigo-800',
  under_accounts_manager_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  paid: 'bg-emerald-100 text-emerald-800',
  rejected_final: 'bg-red-100 text-red-800',
  returned_from_accountant: 'bg-yellow-100 text-yellow-800',
  returned_from_financial_review: 'bg-orange-100 text-orange-800',
};

export default function PayrollBatchHistory() {
  const { user } = useAuth();
  const userRole = user?.role || '';
  const isSuperAdmin = userRole === 'super_admin';

  const [search, setSearch] = useState('');
  const [costCenterFilter, setCostCenterFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'batchId' | 'totalAmount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Details dialog state
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<number | null>(null);

  // Fetch cost centers for filter
  const { data: costCentersData } = trpc.costCenters.list.useQuery();

  // Fetch payroll batches
  const { data: batchesData, isLoading, refetch } = trpc.payroll.getPayrollBatches.useQuery({
    search: search || undefined,
    costCenterFilter: costCenterFilter ? parseInt(costCenterFilter) : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortBy,
    sortOrder,
    limit: itemsPerPage,
    offset: (currentPage - 1) * itemsPerPage,
  });

  const batches = batchesData?.batches || [];
  const total = batchesData?.total || 0;
  const totalPages = Math.ceil(total / itemsPerPage);

  // Fetch batch details when selected
  const { data: batchDetails } = trpc.payroll.getDetails.useQuery(
    { batchId: selectedBatchId! },
    { enabled: !!selectedBatchId && showDetailsDialog }
  );

  // Delete mutation
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

  const handleViewDetails = (batchId: number) => {
    setSelectedBatchId(batchId);
    setShowDetailsDialog(true);
  };

  const handleDeleteClick = (batchId: number) => {
    setBatchToDelete(batchId);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (batchToDelete) {
      deleteBatchMutation.mutate({ batchId: batchToDelete, forceDelete: true });
    }
  };

  // Print batch details
  const handlePrintBatch = (batchId: number) => {
    setSelectedBatchId(batchId);
    setShowDetailsDialog(true);
    // Print will be triggered from the details dialog
  };

  // Helper: group items by group name
  const groupItemsByGroup = (items: any[]) => {
    const grouped: Record<string, { groupName: string; items: any[] }> = {};
    items.forEach((item: any) => {
      const gName = item.groupName || 'بدون مجموعة';
      if (!grouped[gName]) {
        grouped[gName] = { groupName: gName, items: [] };
      }
      grouped[gName].items.push(item);
    });
    return Object.values(grouped);
  };

  // Memoized grouped items for details dialog
  const groupedItems = useMemo(() => {
    if (!batchDetails?.items) return [];
    return groupItemsByGroup(batchDetails.items);
  }, [batchDetails?.items]);

  const handlePrintFromDetails = () => {
    if (!batchDetails) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const groups = groupItemsByGroup(batchDetails.items || []);
    let counter = 0;

    const groupsHtml = groups.map(group => {
      const groupRows = group.items.map((item: any) => {
        counter++;
        return `
          <tr>
            <td>${counter}</td>
            <td>${item.workerName}</td>
            <td>${item.workerCode}</td>
            <td style="text-align:center">${item.daysWorked}</td>
            <td>${parseFloat(item.baseAmount?.toString() || '0').toFixed(2)}</td>
            <td style="color:red">${parseFloat(item.totalDeductions?.toString() || '0').toFixed(2)}</td>
            <td style="color:green">${parseFloat(item.totalBonuses?.toString() || '0').toFixed(2)}</td>
            <td style="font-weight:bold">${parseFloat(item.netAmount?.toString() || '0').toFixed(2)}</td>
            <td class="signature-col"></td>
          </tr>
        `;
      }).join('');

      const groupBase = group.items.reduce((s: number, i: any) => s + parseFloat(i.baseAmount?.toString() || '0'), 0);
      const groupDed = group.items.reduce((s: number, i: any) => s + parseFloat(i.totalDeductions?.toString() || '0'), 0);
      const groupBon = group.items.reduce((s: number, i: any) => s + parseFloat(i.totalBonuses?.toString() || '0'), 0);
      const groupNet = group.items.reduce((s: number, i: any) => s + parseFloat(i.netAmount?.toString() || '0'), 0);

      return `
        <tr class="group-header">
          <td colspan="9">${group.groupName} (${group.items.length} عامل)</td>
        </tr>
        ${groupRows}
        <tr class="group-total">
          <td colspan="4">إجمالي ${group.groupName}</td>
          <td>${groupBase.toFixed(2)}</td>
          <td style="color:red">${groupDed.toFixed(2)}</td>
          <td style="color:green">${groupBon.toFixed(2)}</td>
          <td style="font-weight:bold">${groupNet.toFixed(2)}</td>
          <td></td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html dir="rtl" lang="ar">
      <head>
        <title>كشف عمالة - ${batchDetails.batch.batchCode}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 20px; direction: rtl; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #333; padding: 8px; text-align: right; font-size: 13px; }
          th { background-color: #f0f0f0; font-weight: bold; }
          .header { text-align: center; margin-bottom: 20px; }
          .header h2 { margin: 5px 0; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
          .total-row { font-weight: bold; background-color: #e8e8e8; }
          .group-header { background-color: #d4e6f1; font-weight: bold; font-size: 14px; }
          .group-total { background-color: #eaf2f8; font-weight: bold; font-size: 12px; }
          .signature-col { width: 120px; min-height: 40px; }
          .footer { text-align: center; font-size: 11px; color: #666; margin-top: 30px; border-top: 1px solid #ccc; padding-top: 10px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>كشف العمالة اليومية</h2>
          <p>رمز الدفعة: ${batchDetails.batch.batchCode}</p>
        </div>
        <div class="info-row">
          <span>الفترة: ${new Date(batchDetails.batch.periodStart).toLocaleDateString('en-GB').replace(/\//g, '-')} إلى ${new Date(batchDetails.batch.periodEnd).toLocaleDateString('en-GB').replace(/\//g, '-')}</span>
          <span>الحالة: ${STATUS_LABELS[batchDetails.batch.status || 'draft'] || batchDetails.batch.status}</span>
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
              <th>الاضافي</th>
              <th>الصافي</th>
              <th>توقيع المستلم</th>
            </tr>
          </thead>
          <tbody>
            ${groupsHtml}
            <tr class="total-row">
              <td colspan="4">الإجمالي </td>
              <td>${parseFloat(batchDetails.batch.totalAmount?.toString() || '0').toFixed(2)}</td>
              <td>${parseFloat(batchDetails.batch.totalDeductions?.toString() || '0').toFixed(2)}</td>
              <td>${parseFloat(batchDetails.batch.totalBonuses?.toString() || '0').toFixed(2)}</td>
              <td>${(parseFloat(batchDetails.batch.totalAmount?.toString() || '0') - parseFloat(batchDetails.batch.totalDeductions?.toString() || '0') + parseFloat(batchDetails.batch.totalBonuses?.toString() || '0')).toFixed(2)}</td>
              <td></td>
            </tr>
            <tr>
              <td colspan="9" style="background:#f0f7ff;padding:10px 12px;font-size:13px;font-weight:600;color:#1a3c6e;border-top:2px solid #4a90d9;">المبلغ الإجمالي بالأحرف: ${numberToArabicWords(parseFloat(batchDetails.batch.totalAmount?.toString() || '0') - parseFloat(batchDetails.batch.totalDeductions?.toString() || '0') + parseFloat(batchDetails.batch.totalBonuses?.toString() || '0'))}</td>
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
  };

  // Export to Excel
  const handleExport = () => {
    const exportData = batches.map(batch => ({
      'رقم الدفعة': batch.batchCode,
      'تاريخ البداية': format(new Date(batch.periodStart), 'dd/MM/yyyy', { locale: ar }),
      'تاريخ النهاية': format(new Date(batch.periodEnd), 'dd/MM/yyyy', { locale: ar }),
      'الحالة': STATUS_LABELS[batch.status as string] || batch.status,
      'عدد العمال': batch.totalWorkers,
      'الإجمالي': parseFloat(batch.totalAmount as string).toLocaleString('ar-SA'),
      'الخصومات': parseFloat(batch.totalDeductions as string).toLocaleString('ar-SA'),
      'الحوافز': parseFloat(batch.totalBonuses as string).toLocaleString('ar-SA'),
      'تاريخ الإنشاء': format(new Date(batch.createdAt as any as string), 'dd/MM/yyyy HH:mm', { locale: ar }),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'دفعات العمالة');
    XLSX.writeFile(wb, `payroll-batches-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  // Print all batches list
  const handlePrintAll = () => {
    const printWindow = window.open('', '', 'height=600,width=800');
    if (!printWindow) return;

    const content = `
      <html>
        <head>
          <title>سجل دفعات العمالة</title>
          <style>
            body { font-family: Arial, sans-serif; direction: rtl; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
            th { background-color: #f2f2f2; }
            h1 { text-align: center; }
          </style>
        </head>
        <body>
          <h1>سجل دفعات العمالة</h1>
          <table>
            <thead>
              <tr>
                <th>رقم الدفعة</th>
                <th>تاريخ البداية</th>
                <th>تاريخ النهاية</th>
                <th>الحالة</th>
                <th>عدد العمال</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${batches.map(batch => `
                <tr>
                  <td>${batch.batchCode}</td>
                  <td>${format(new Date(batch.periodStart), 'dd/MM/yyyy', { locale: ar })}</td>
                  <td>${format(new Date(batch.periodEnd), 'dd/MM/yyyy', { locale: ar })}</td>
                  <td>${STATUS_LABELS[batch.status as string] || batch.status}</td>
                  <td>${batch.totalWorkers}</td>
                  <td>${parseFloat(batch.totalAmount as string).toLocaleString('ar-SA')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">سجل دفعات العمالة</h1>
        <div className="flex gap-2">
          <Button onClick={handleExport} variant="outline" size="sm">
            <Download className="w-4 h-4 ml-2" />
            تصدير Excel
          </Button>
          <Button onClick={handlePrintAll} variant="outline" size="sm">
            <Printer className="w-4 h-4 ml-2" />
            طباعة
          </Button>
        </div>
      </div>

      {/* Filters Card */}
      <Card>
        <CardHeader>
          <CardTitle>خيارات البحث والتصفية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Search by Batch ID */}
            <div>
              <label className="text-sm font-medium mb-2 block">البحث برقم الدفعة</label>
              <Input
                placeholder="مثال: PB-2026-001"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            {/* Cost Center Filter */}
            <div>
              <label className="text-sm font-medium mb-2 block">مركز التكلفة</label>
              <Select value={costCenterFilter} onValueChange={(value) => {
                setCostCenterFilter(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر مركز التكلفة" />
                </SelectTrigger>
                <SelectContent>
                  {costCentersData?.map(center => (
                    <SelectItem key={center.id} value={center.id.toString()}>
                      {center.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sort Options */}
            <div>
              <label className="text-sm font-medium mb-2 block">الترتيب</label>
              <div className="flex gap-2">
                <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">التاريخ</SelectItem>
                    <SelectItem value="batchId">رقم الدفعة</SelectItem>
                    <SelectItem value="totalAmount">الإجمالي</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortOrder} onValueChange={(value: any) => setSortOrder(value)}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">تصاعدي</SelectItem>
                    <SelectItem value="desc">تنازلي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">من التاريخ</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">إلى التاريخ</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-8">جاري التحميل...</div>
          ) : batches.length === 0 ? (
            <div className="text-center py-8 text-gray-500">لا توجد دفعات عمالة</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">رقم الدفعة</TableHead>
                      <TableHead className="text-right">الفترة</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">عدد العمال</TableHead>
                      <TableHead className="text-right">الإجمالي</TableHead>
                      <TableHead className="text-right">الخصومات</TableHead>
                      <TableHead className="text-right">الحوافز</TableHead>
                      <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map(batch => (
                      <TableRow key={batch.id}>
                        <TableCell className="font-medium">{batch.batchCode}</TableCell>
                        <TableCell>
                          {format(new Date(batch.periodStart), 'dd/MM', { locale: ar })} - {format(new Date(batch.periodEnd), 'dd/MM', { locale: ar })}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[batch.status as string]}>
                            {STATUS_LABELS[batch.status as string] || batch.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{batch.totalWorkers}</TableCell>
                        <TableCell>{parseFloat(batch.totalAmount as string).toLocaleString('ar-SA')}</TableCell>
                        <TableCell>{parseFloat(batch.totalDeductions as string).toLocaleString('ar-SA')}</TableCell>
                        <TableCell>{parseFloat(batch.totalBonuses as string).toLocaleString('ar-SA')}</TableCell>
                        <TableCell>{format(new Date(batch.createdAt), 'dd/MM/yyyy HH:mm', { locale: ar })}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {/* زر استعراض */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDetails(batch.id)}
                              title="استعراض التفاصيل"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {/* زر طباعة */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePrintBatch(batch.id)}
                              title="طباعة الكشف"
                            >
                              <Printer className="w-4 h-4" />
                            </Button>
                            {/* زر حذف نهائي - فقط لـ super_admin */}
                            {isSuperAdmin && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteClick(batch.id)}
                                title="حذف نهائي"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-gray-500">
                  عرض {(currentPage - 1) * itemsPerPage + 1} إلى {Math.min(currentPage * itemsPerPage, total)} من {total}
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
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                    if (pageNum > totalPages) return null;
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    التالي
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
                  <Badge className={STATUS_COLORS[batchDetails.batch.status || 'draft']}>
                    {STATUS_LABELS[batchDetails.batch.status || 'draft'] || batchDetails.batch.status}
                  </Badge>
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

              {/* Print Button */}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={handlePrintFromDetails}
                >
                  <Printer className="h-4 w-4 ml-2" />
                  طباعة الكشف
                </Button>
              </div>

              {/* Items Table - Grouped by Group */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">العامل</TableHead>
                    <TableHead className="text-right">أيام العمل</TableHead>
                    <TableHead className="text-right">المستحق</TableHead>
                    <TableHead className="text-right">الخصومات</TableHead>
                    <TableHead className="text-right">الاضافي</TableHead>
                    <TableHead className="text-right">الصافي</TableHead>
                    <TableHead className="text-right w-[120px]">توقيع المستلم</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedItems.map((group) => (
                    <>
                      {/* Group Header */}
                      <TableRow key={`group-${group.groupName}`} className="bg-blue-50 hover:bg-blue-50">
                        <TableCell colSpan={7} className="font-bold text-blue-800">
                          {group.groupName} ({group.items.length} عامل)
                        </TableCell>
                      </TableRow>
                      {/* Group Workers */}
                      {group.items.map((item: any) => (
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
                      {/* Group Subtotal */}
                      <TableRow key={`subtotal-${group.groupName}`} className="bg-gray-50 hover:bg-gray-50">
                        <TableCell className="font-semibold text-sm">إجمالي {group.groupName}</TableCell>
                        <TableCell></TableCell>
                        <TableCell className="font-mono font-semibold text-sm">
                          {group.items.reduce((s: number, i: any) => s + parseFloat(i.baseAmount?.toString() || '0'), 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="font-mono font-semibold text-sm text-red-600">
                          {group.items.reduce((s: number, i: any) => s + parseFloat(i.totalDeductions?.toString() || '0'), 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="font-mono font-semibold text-sm text-green-600">
                          {group.items.reduce((s: number, i: any) => s + parseFloat(i.totalBonuses?.toString() || '0'), 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="font-mono font-semibold text-sm">
                          {group.items.reduce((s: number, i: any) => s + parseFloat(i.netAmount?.toString() || '0'), 0).toFixed(2)}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الحذف النهائي</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this batch?
            </p>
            <div className="rounded-lg p-3 bg-red-50 border border-red-200">
              <p className="text-sm text-red-800">
                <strong>تحذير:</strong> سيتم حذف الدفعة وجميع البيانات المرتبطة بها بشكل نهائي ولا يمكن استرجاعها. هذا الإجراء متاح فقط للمسؤول الأعلى (Super Admin).
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
