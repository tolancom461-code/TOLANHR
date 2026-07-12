import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  BarChart3, 
  Download,
  RefreshCw,
  Users,
  Clock,
  Calendar,
  TrendingUp,
  Printer,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { printPage } from '@/lib/exportUtils';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export default function AttendanceReports() {
  const currentDate = new Date();
  const todayStr = currentDate.toLocaleDateString('en-CA');
  
  // Filter mode: 'monthly' or 'dateRange'
  const [filterMode, setFilterMode] = useState<'monthly' | 'dateRange'>('monthly');
  
  // Monthly filter state
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  
  // Date range filter state
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  
  // Common filter
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  
  const { data: allGroups } = trpc.groups.list.useQuery();
  const groups = allGroups;
  
  // Monthly report query
  const { data: monthlyReport, isLoading: monthlyLoading, refetch: refetchMonthly } = trpc.attendance.monthlyReport.useQuery({
    year: selectedYear,
    month: selectedMonth,
    groupId: selectedGroup !== 'all' ? parseInt(selectedGroup) : undefined
  }, {
    enabled: filterMode === 'monthly',
  });

  // Date range report query
  const { data: dateRangeReport, isLoading: dateRangeLoading, refetch: refetchDateRange } = trpc.attendance.dateRangeReport.useQuery({
    startDate,
    endDate,
    groupId: selectedGroup !== 'all' ? parseInt(selectedGroup) : undefined
  }, {
    enabled: filterMode === 'dateRange',
  });

  // Active report data
  const report = filterMode === 'monthly' ? monthlyReport : dateRangeReport;
  const isLoading = filterMode === 'monthly' ? monthlyLoading : dateRangeLoading;
  const refetch = filterMode === 'monthly' ? refetchMonthly : refetchDateRange;

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (!report?.length) return null;
    
    const totalWorkers = report.length;
    const totalDays = report.reduce((sum, r) => sum + r.daysPresent, 0);
    const totalHours = report.reduce((sum, r) => sum + r.totalHours, 0);
    const avgDaysPerWorker = totalDays / totalWorkers;
    const avgHoursPerWorker = totalHours / totalWorkers;
    
    return {
      totalWorkers,
      totalDays,
      totalHours: Math.round(totalHours * 100) / 100,
      avgDaysPerWorker: Math.round(avgDaysPerWorker * 10) / 10,
      avgHoursPerWorker: Math.round(avgHoursPerWorker * 10) / 10,
    };
  }, [report]);

  const years = Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - i);

  const exportExcelMutation = trpc.export.attendanceReport.useMutation({
    onSuccess: (data) => {
      const byteCharacters = atob(data.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
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

  const exportToExcel = () => {
    if (!report?.length) {
      toast.error('لا توجد بيانات للتصدير');
      return;
    }

    exportExcelMutation.mutate({
      month: filterMode === 'monthly' ? MONTHS[selectedMonth - 1] : `${startDate} - ${endDate}`,
      year: selectedYear,
      groupId: selectedGroup !== 'all' ? parseInt(selectedGroup) : undefined,
    });
  };

  const exportToCSV = () => {
    if (!report?.length) {
      toast.error('لا توجد بيانات للتصدير');
      return;
    }

    const headers = ['اسم العامل', 'الرمز', 'أيام الحضور', 'إجمالي الساعات', 'متوسط الساعات/يوم'];
    const rows = report.map(r => [
      r.workerName,
      r.workerCode,
      r.daysPresent.toString(),
      r.totalHours.toString(),
      r.avgHoursPerDay.toString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const filename = filterMode === 'monthly' 
      ? `attendance-report-${selectedYear}-${selectedMonth}.csv`
      : `attendance-report-${startDate}-to-${endDate}.csv`;
    link.download = filename;
    link.click();
    
    toast.success('تم تصدير التقرير بنجاح');
  };

  // Report title
  const reportTitle = filterMode === 'monthly' 
    ? `تقرير ${MONTHS[selectedMonth - 1]} ${selectedYear}`
    : `تقرير من ${startDate} إلى ${endDate}`;

  return (
    <div className="space-y-6" id="attendance-report-content">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            تقارير الحضور
          </h1>
          <p className="text-muted-foreground">
            عرض وتحليل بيانات الحضور للعمال
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={exportToExcel} disabled={exportExcelMutation.isPending}>
            <Download className="h-4 w-4 ml-2" />
            {exportExcelMutation.isPending ? 'جاري التصدير...' : 'تصدير Excel'}
          </Button>
          <Button variant="outline" onClick={exportToCSV}>
            <Download className="h-4 w-4 ml-2" />
            تصدير CSV
          </Button>
          <Button variant="outline" onClick={() => printPage('attendance-report-content')}>
            <Printer className="h-4 w-4 ml-2" />
            طباعة
          </Button>
        </div>
      </div>

      {/* Filter Section */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={filterMode} onValueChange={(v) => setFilterMode(v as 'monthly' | 'dateRange')}>
            <TabsList className="mb-4">
              <TabsTrigger value="monthly">
                <Calendar className="h-4 w-4 ml-2" />
                فلترة شهرية
              </TabsTrigger>
              <TabsTrigger value="dateRange">
                <Calendar className="h-4 w-4 ml-2" />
                فلترة حسب التاريخ
              </TabsTrigger>
            </TabsList>

            <TabsContent value="monthly">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <Label className="text-sm text-muted-foreground mb-1 block">السنة</Label>
                  <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground mb-1 block">الشهر</Label>
                  <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month, index) => (
                        <SelectItem key={index} value={(index + 1).toString()}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground mb-1 block">المجموعة</Label>
                  <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                    <SelectTrigger className="w-44">
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
                </div>
              </div>
            </TabsContent>

            <TabsContent value="dateRange">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <Label className="text-sm text-muted-foreground mb-1 block">من تاريخ</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-44"
                  />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground mb-1 block">إلى تاريخ</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-44"
                  />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground mb-1 block">المجموعة</Label>
                  <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                    <SelectTrigger className="w-44">
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
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.totalWorkers}</p>
                  <p className="text-sm text-muted-foreground">عدد العمال</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <Calendar className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.totalDays}</p>
                  <p className="text-sm text-muted-foreground">إجمالي أيام الحضور</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <Clock className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.totalHours}</p>
                  <p className="text-sm text-muted-foreground">إجمالي الساعات</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.avgDaysPerWorker}</p>
                  <p className="text-sm text-muted-foreground">متوسط الأيام/عامل</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-100 dark:bg-cyan-900 rounded-lg">
                  <Clock className="h-5 w-5 text-cyan-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.avgHoursPerWorker}</p>
                  <p className="text-sm text-muted-foreground">متوسط الساعات/عامل</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Report Table */}
      <Card>
        <CardHeader>
          <CardTitle>{reportTitle}</CardTitle>
          <CardDescription>تفاصيل حضور العمال للفترة المحددة</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">جاري التحميل...</p>
            </div>
          ) : !report?.length ? (
            <div className="text-center py-8">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
              <p className="mt-2 text-muted-foreground">لا توجد بيانات للفترة المحددة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">#</TableHead>
                    <TableHead className="text-right">اسم العامل</TableHead>
                    <TableHead className="text-right">الرمز</TableHead>
                    <TableHead className="text-right">أيام الحضور</TableHead>
                    <TableHead className="text-right">تسجيلات الحضور</TableHead>
                    <TableHead className="text-right">تسجيلات الانصراف</TableHead>
                    <TableHead className="text-right">إجمالي الساعات</TableHead>
                    <TableHead className="text-right">متوسط الساعات/يوم</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.filter(r => r.daysPresent > 0).map((record, index) => (
                    <TableRow key={record.workerId}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">
                        {record.workerName}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {record.workerCode}
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-green-600">{record.daysPresent}</span>
                      </TableCell>
                      <TableCell>{record.totalCheckIns}</TableCell>
                      <TableCell>{record.totalCheckOuts}</TableCell>
                      <TableCell>
                        <span className="font-semibold">{record.totalHours}</span> ساعة
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">{record.avgHoursPerDay}</span> ساعة
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
