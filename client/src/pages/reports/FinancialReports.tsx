import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Calendar, TrendingUp, TrendingDown, DollarSign, Users, Building2, Printer, FileSpreadsheet } from 'lucide-react';
import { exportMultipleSheetsToExcel, prepareFinancialReportForExcel, printPage } from '@/lib/exportUtils';

export default function FinancialReports() {
  
  // Date range state
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDayOfMonth.toLocaleDateString('en-CA'));
  const [endDate, setEndDate] = useState(today.toLocaleDateString('en-CA'));
  
  // Filter states
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<number | null>(null);
  
  // Fetch data
  const { data: workers } = trpc.workers.list.useQuery();
  const { data: groups } = trpc.groups.list.useQuery();
  const { data: costCenters } = trpc.costCenters.list.useQuery();
  
  // Financial reports queries
  const { data: workerReport, isLoading: workerLoading } = trpc.financialReports.worker.useQuery(
    { workerId: selectedWorkerId!, startDate, endDate },
    { enabled: !!selectedWorkerId }
  );
  
  const { data: groupReport, isLoading: groupLoading } = trpc.financialReports.group.useQuery(
    { groupId: selectedGroupId!, startDate, endDate },
    { enabled: !!selectedGroupId }
  );
  
  const { data: costCenterReport, isLoading: costCenterLoading } = trpc.financialReports.costCenter.useQuery(
    { costCenterId: selectedCostCenterId!, startDate, endDate },
    { enabled: !!selectedCostCenterId }
  );
  
  const { data: summaryReport, isLoading: summaryLoading } = trpc.financialReports.summary.useQuery(
    { startDate, endDate }
  );
  
  // Quick date filters
  const setQuickDate = (type: 'today' | 'week' | 'month') => {
    const end = new Date();
    let start = new Date();
    
    if (type === 'today') {
      start = new Date();
    } else if (type === 'week') {
      start.setDate(end.getDate() - 7);
    } else if (type === 'month') {
      start = new Date(end.getFullYear(), end.getMonth(), 1);
    }
    
    setStartDate(start.toLocaleDateString('en-CA'));
    setEndDate(end.toLocaleDateString('en-CA'));
  };
  
  // Format currency
  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat('ar-SA', {
      style: 'currency',
      currency: 'SAR',
      minimumFractionDigits: 2,
    }).format(typeof amount === 'string' ? parseFloat(amount) : amount);
  };

  // Export handlers
  const handleExportSummary = () => {
    if (!summaryReport) return;
    const { filename, sheets } = prepareFinancialReportForExcel(summaryReport, 'summary');
    exportMultipleSheetsToExcel(sheets, filename);
  };

  const handleExportWorker = () => {
    if (!workerReport) return;
    const { filename, sheets } = prepareFinancialReportForExcel(workerReport, 'worker');
    exportMultipleSheetsToExcel(sheets, filename);
  };

  const handleExportGroup = () => {
    if (!groupReport) return;
    const { filename, sheets } = prepareFinancialReportForExcel(groupReport, 'group');
    exportMultipleSheetsToExcel(sheets, filename);
  };

  const handleExportCostCenter = () => {
    if (!costCenterReport) return;
    const { filename, sheets } = prepareFinancialReportForExcel(costCenterReport, 'costCenter');
    exportMultipleSheetsToExcel(sheets, filename);
  };

  // Print handler
  const handlePrint = () => {
    printPage('financial-report-content');
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">التقارير المالية</h1>
          <p className="text-muted-foreground">عرض تفصيلي للمبالغ الواجب دفعها للعمال</p>
        </div>
      </div>

      {/* Date Range Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            الفترة الزمنية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>من تاريخ</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>إلى تاريخ</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>فلاتر سريعة</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setQuickDate('today')}>
                  اليوم
                </Button>
                <Button variant="outline" size="sm" onClick={() => setQuickDate('week')}>
                  أسبوع
                </Button>
                <Button variant="outline" size="sm" onClick={() => setQuickDate('month')}>
                  شهر
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different report levels */}
      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="summary">الملخص العام</TabsTrigger>
          <TabsTrigger value="worker">تقرير عامل</TabsTrigger>
          <TabsTrigger value="group">تقرير مجموعة</TabsTrigger>
          <TabsTrigger value="costCenter">تقرير مركز تكلفة</TabsTrigger>
        </TabsList>

        {/* Summary Report Tab */}
        <TabsContent value="summary" className="space-y-4" id="financial-report-content">
          {/* Export & Print Buttons */}
          {summaryReport && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleExportSummary}>
                <FileSpreadsheet className="h-4 w-4 ml-2" />
                تصدير إلى Excel
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 ml-2" />
                طباعة
              </Button>
            </div>
          )}

          {summaryLoading ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-muted-foreground">جاري تحميل البيانات...</p>
              </CardContent>
            </Card>
          ) : summaryReport ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-blue-500" />
                      مراكز التكلفة
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{summaryReport.summary.totalCostCenters}</div>
                    <p className="text-xs text-muted-foreground">
                      {summaryReport.summary.totalGroups} مجموعة • {summaryReport.summary.totalWorkers} عامل
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      إجمالي الحضور
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(summaryReport.summary.totalBaseAmount)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {summaryReport.summary.totalDaysWorked} يوم عمل
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-red-500" />
                      إجمالي الخصومات
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">
                      {formatCurrency(summaryReport.summary.totalDeductions)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      + {formatCurrency(summaryReport.summary.totalBonuses)} إضافات
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-primary" />
                      الصافي النهائي
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      {formatCurrency(summaryReport.summary.totalNetAmount)}
                    </div>
                    <p className="text-xs text-muted-foreground">المبلغ الواجب دفعه</p>
                  </CardContent>
                </Card>
              </div>

              {/* Cost Centers Table */}
              <Card>
                <CardHeader>
                  <CardTitle>تفاصيل مراكز التكلفة</CardTitle>
                  <CardDescription>
                    التوزيع المالي حسب مراكز التكلفة للفترة من {startDate} إلى {endDate}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>مركز التكلفة</TableHead>
                        <TableHead className="text-center">المجموعات</TableHead>
                        <TableHead className="text-center">العمال</TableHead>
                        <TableHead className="text-right">الحضور</TableHead>
                        <TableHead className="text-right">الخصومات</TableHead>
                        <TableHead className="text-right">الإضافات</TableHead>
                        <TableHead className="text-right">الصافي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryReport.costCenterReports.map((cc) => (
                        <TableRow key={cc.costCenterId}>
                          <TableCell className="font-medium">{cc.costCenterName}</TableCell>
                          <TableCell className="text-center">{cc.totalGroups}</TableCell>
                          <TableCell className="text-center">{cc.totalWorkers}</TableCell>
                          <TableCell className="text-right text-green-600">
                            {formatCurrency(cc.totalBaseAmount)}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {formatCurrency(cc.totalDeductions)}
                          </TableCell>
                          <TableCell className="text-right text-blue-600">
                            {formatCurrency(cc.totalBonuses)}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {formatCurrency(cc.totalNetAmount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* Worker Report Tab */}
        <TabsContent value="worker" className="space-y-4">
          {/* Export & Print Buttons */}
          {workerReport && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleExportWorker}>
                <FileSpreadsheet className="h-4 w-4 ml-2" />
                تصدير إلى Excel
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 ml-2" />
                طباعة
              </Button>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>اختر عامل</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedWorkerId?.toString() || ''}
                onValueChange={(value) => setSelectedWorkerId(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر عامل..." />
                </SelectTrigger>
                <SelectContent>
                  {workers?.map((worker) => (
                    <SelectItem key={worker.id} value={worker.id.toString()}>
                      {worker.fullName} ({worker.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {workerLoading ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-muted-foreground">جاري تحميل البيانات...</p>
              </CardContent>
            </Card>
          ) : workerReport ? (
            <>
              {/* Worker Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">أيام العمل</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{workerReport.summary.totalDaysWorked}</div>
                    <p className="text-xs text-muted-foreground">يوم</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">إجمالي الحضور</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(workerReport.summary.totalBaseAmount)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">الخصومات والإضافات</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-red-600">خصومات:</span>
                        <span className="font-medium">{formatCurrency(workerReport.summary.totalDeductions)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-600">إضافات:</span>
                        <span className="font-medium">{formatCurrency(workerReport.summary.totalBonuses)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">الصافي النهائي</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      {formatCurrency(workerReport.summary.totalNetAmount)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Daily Records Table */}
              <Card>
                <CardHeader>
                  <CardTitle>السجلات اليومية</CardTitle>
                  <CardDescription>
                    تفاصيل الحضور اليومي للفترة من {startDate} إلى {endDate}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>التاريخ</TableHead>
                        <TableHead className="text-right">الأجر الأساسي</TableHead>
                        <TableHead className="text-right">الخصومات</TableHead>
                        <TableHead className="text-right">الإضافات</TableHead>
                        <TableHead className="text-right">الصافي</TableHead>
                        <TableHead>ملاحظات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workerReport.dailyRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>{new Date(record.workDate).toLocaleDateString('ar-SA')}</TableCell>
                          <TableCell className="text-right">{formatCurrency(record.baseAmount || '0')}</TableCell>
                          <TableCell className="text-right text-red-600">{formatCurrency(record.deductions || '0')}</TableCell>
                          <TableCell className="text-right text-green-600">{formatCurrency(record.bonuses || '0')}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(record.netAmount || '0')}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{record.notes || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : selectedWorkerId ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-muted-foreground">لا توجد بيانات مالية للعامل المحدد في هذه الفترة</p>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* Group Report Tab */}
        <TabsContent value="group" className="space-y-4">
          {/* Export & Print Buttons */}
          {groupReport && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleExportGroup}>
                <FileSpreadsheet className="h-4 w-4 ml-2" />
                تصدير إلى Excel
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 ml-2" />
                طباعة
              </Button>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>اختر مجموعة</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedGroupId?.toString() || ''}
                onValueChange={(value) => setSelectedGroupId(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر مجموعة..." />
                </SelectTrigger>
                <SelectContent>
                  {groups?.map((group) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.name} ({group.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {groupLoading ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-muted-foreground">جاري تحميل البيانات...</p>
              </CardContent>
            </Card>
          ) : groupReport ? (
            <>
              {/* Group Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">عدد العمال</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{groupReport.summary.totalWorkers}</div>
                    <p className="text-xs text-muted-foreground">عامل</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">إجمالي الحضور</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(groupReport.summary.totalBaseAmount)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">الخصومات والإضافات</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-red-600">خصومات:</span>
                        <span className="font-medium">{formatCurrency(groupReport.summary.totalDeductions)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-600">إضافات:</span>
                        <span className="font-medium">{formatCurrency(groupReport.summary.totalBonuses)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">الصافي النهائي</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      {formatCurrency(groupReport.summary.totalNetAmount)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Workers in Group Table */}
              <Card>
                <CardHeader>
                  <CardTitle>تفاصيل العمال</CardTitle>
                  <CardDescription>
                    التوزيع المالي لعمال المجموعة للفترة من {startDate} إلى {endDate}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>العامل</TableHead>
                        <TableHead className="text-center">أيام العمل</TableHead>
                        <TableHead className="text-right">الحضور</TableHead>
                        <TableHead className="text-right">الخصومات</TableHead>
                        <TableHead className="text-right">الإضافات</TableHead>
                        <TableHead className="text-right">الصافي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupReport.workerReports.map((worker) => (
                        <TableRow key={worker.workerId}>
                          <TableCell className="font-medium">
                            {worker.workerName}
                            <span className="text-sm text-muted-foreground ml-2">({worker.workerCode})</span>
                          </TableCell>
                          <TableCell className="text-center">{worker.totalDaysWorked}</TableCell>
                          <TableCell className="text-right text-green-600">
                            {formatCurrency(worker.totalBaseAmount || '0')}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {formatCurrency(worker.totalDeductions || '0')}
                          </TableCell>
                          <TableCell className="text-right text-blue-600">
                            {formatCurrency(worker.totalBonuses || '0')}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {formatCurrency(worker.totalNetAmount || '0')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : selectedGroupId ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-muted-foreground">لا توجد بيانات مالية للمجموعة المحددة في هذه الفترة</p>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* Cost Center Report Tab */}
        <TabsContent value="costCenter" className="space-y-4">
          {/* Export & Print Buttons */}
          {costCenterReport && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCostCenter}>
                <FileSpreadsheet className="h-4 w-4 ml-2" />
                تصدير إلى Excel
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 ml-2" />
                طباعة
              </Button>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>اختر مركز تكلفة</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedCostCenterId?.toString() || ''}
                onValueChange={(value) => setSelectedCostCenterId(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر مركز تكلفة..." />
                </SelectTrigger>
                <SelectContent>
                  {costCenters?.map((cc) => (
                    <SelectItem key={cc.id} value={cc.id.toString()}>
                      {cc.name} ({cc.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {costCenterLoading ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-muted-foreground">جاري تحميل البيانات...</p>
              </CardContent>
            </Card>
          ) : costCenterReport ? (
            <>
              {/* Cost Center Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">المجموعات</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{costCenterReport.summary.totalGroups}</div>
                    <p className="text-xs text-muted-foreground">
                      {costCenterReport.summary.totalWorkers} عامل
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">إجمالي الحضور</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(costCenterReport.summary.totalBaseAmount)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">الخصومات والإضافات</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-red-600">خصومات:</span>
                        <span className="font-medium">{formatCurrency(costCenterReport.summary.totalDeductions)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-600">إضافات:</span>
                        <span className="font-medium">{formatCurrency(costCenterReport.summary.totalBonuses)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">الصافي النهائي</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      {formatCurrency(costCenterReport.summary.totalNetAmount)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Groups in Cost Center Table */}
              <Card>
                <CardHeader>
                  <CardTitle>تفاصيل المجموعات</CardTitle>
                  <CardDescription>
                    التوزيع المالي لمجموعات مركز التكلفة للفترة من {startDate} إلى {endDate}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>المجموعة</TableHead>
                        <TableHead className="text-center">العمال</TableHead>
                        <TableHead className="text-right">الحضور</TableHead>
                        <TableHead className="text-right">الخصومات</TableHead>
                        <TableHead className="text-right">الإضافات</TableHead>
                        <TableHead className="text-right">الصافي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {costCenterReport.groupReports.map((group) => (
                        <TableRow key={group.groupId}>
                          <TableCell className="font-medium">
                            {group.groupName}
                            <span className="text-sm text-muted-foreground ml-2">({group.groupCode})</span>
                          </TableCell>
                          <TableCell className="text-center">{group.totalWorkers}</TableCell>
                          <TableCell className="text-right text-green-600">
                            {formatCurrency(group.totalBaseAmount)}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {formatCurrency(group.totalDeductions)}
                          </TableCell>
                          <TableCell className="text-right text-blue-600">
                            {formatCurrency(group.totalBonuses)}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {formatCurrency(group.totalNetAmount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : selectedCostCenterId ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-muted-foreground">لا توجد بيانات مالية لمركز التكلفة المحدد في هذه الفترة</p>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
