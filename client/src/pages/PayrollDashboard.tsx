import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CheckCircle, DollarSign, Users, Clock } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { format } from 'date-fns';
import { PayrollCharts, AttendanceChart } from '@/components/PayrollCharts';

interface PayrollSummary {
  groupId: number;
  groupName: string;
  groupCode: string;
  workDate: string;
  totalEmployees: number;
  employeesCheckedIn: number;
  employeesCheckedOut: number;
  totalHoursWorked: number;
  totalPayroll: number;
  averageDailyPay: number;
  status: 'PENDING' | 'APPROVED' | 'PAID';
}

interface DailyPayrollItem {
  workerId: number;
  workerName: string;
  workerCode: string;
  groupName: string;
  workDate: string;
  scheduledHours: number;
  actualHours: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  dailyRate: number;
  calculatedPay: number;
  status: 'COMPLETED' | 'PENDING_REVIEW';
  isAutoCompleted: boolean;
}

export function PayrollDashboard() {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);

  // Fetch data
  const { data: groups } = trpc.groups.list.useQuery();
  const { data: groupPayrollData, isLoading: groupPayrollLoading } = trpc.payrollFunctions.getGroupPayrollSummary.useQuery(
    { workDateStr: selectedDate },
    { enabled: !!selectedDate }
  );

  const { data: dailyPayrollData, isLoading: dailyPayrollLoading } = trpc.payrollFunctions.getDailyPayrollSummary.useQuery(
    {
      workDateStr: selectedDate,
      groupId: selectedGroupId ? parseInt(selectedGroupId) : undefined,
    },
    { enabled: !!selectedDate }
  );

  // Filter group payroll data
  const filteredGroupPayroll = useMemo(() => {
    if (!groupPayrollData?.summary) return [];
    if (!selectedGroupId || selectedGroupId === 'all') return groupPayrollData.summary;
    return groupPayrollData.summary.filter(
      (item: PayrollSummary) => item.groupId === parseInt(selectedGroupId)
    );
  }, [groupPayrollData, selectedGroupId]);

  const handleApprovePayroll = async (groupId: number) => {
    setApprovalLoading(true);
    setError(null);

    try {
    } catch (err) {
      setError(`Failed to approve payroll: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setApprovalLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'PENDING_REVIEW':
        return 'bg-yellow-100 text-yellow-800';
      case 'PAID':
        return 'bg-blue-100 text-blue-800';
      case 'APPROVED':
        return 'bg-emerald-100 text-emerald-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
      case 'APPROVED':
      case 'PAID':
        return <CheckCircle className="h-4 w-4" />;
      case 'PENDING_REVIEW':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const totalPayroll = filteredGroupPayroll.reduce((sum: number, item: PayrollSummary) => sum + item.totalPayroll, 0);
  const totalEmployees = filteredGroupPayroll.reduce((sum: number, item: PayrollSummary) => sum + item.totalEmployees, 0);
  const totalHours = filteredGroupPayroll.reduce((sum: number, item: PayrollSummary) => sum + item.totalHoursWorked, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">لوحة تحكم الرواتب</h1>
        <p className="text-gray-600 mt-2">عرض وإدارة رواتب الموظفين والمجموعات</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>الفلاتر</CardTitle>
          <CardDescription>اختر التاريخ والمجموعة للفلترة</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">التاريخ</Label>
              <Input
                id="date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="group">المجموعة</Label>
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger id="group" className="mt-1">
                  <SelectValue placeholder="اختر مجموعة (اختياري)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المجموعات</SelectItem>
                  {groups?.map((group: any) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.name} ({group.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">إجمالي الرواتب</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{totalPayroll.toFixed(2)}</p>
                <p className="text-xs text-gray-500">ريال سعودي</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">إجمالي الموظفين</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{totalEmployees}</p>
                <p className="text-xs text-gray-500">موظف</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">إجمالي الساعات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-8 w-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
                <p className="text-xs text-gray-500">ساعة</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">الرسوم البيانية والتحليلات</h2>
        <PayrollCharts />
        <div className="mt-6">
          <AttendanceChart />
        </div>
      </div>

      {/* Group Payroll Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>ملخص رواتب المجموعات</CardTitle>
          <CardDescription>عرض ملخص الرواتب لكل مجموعة</CardDescription>
        </CardHeader>
        <CardContent>
          {groupPayrollLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : filteredGroupPayroll.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              لا توجد بيانات للعرض
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المجموعة</TableHead>
                    <TableHead className="text-right">الموظفين</TableHead>
                    <TableHead className="text-right">الحاضرين</TableHead>
                    <TableHead className="text-right">الساعات</TableHead>
                    <TableHead className="text-right">إجمالي الراتب</TableHead>
                    <TableHead className="text-right">متوسط الراتب</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroupPayroll.map((item: PayrollSummary) => (
                    <TableRow key={`${item.groupId}-${item.workDate}`}>
                      <TableCell className="font-medium">
                        {item.groupName}
                        <br />
                        <span className="text-xs text-gray-500">{item.groupCode}</span>
                      </TableCell>
                      <TableCell className="text-right">{item.totalEmployees}</TableCell>
                      <TableCell className="text-right">{item.employeesCheckedIn}</TableCell>
                      <TableCell className="text-right">{item.totalHoursWorked.toFixed(1)}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {item.totalPayroll.toFixed(2)} ر.س
                      </TableCell>
                      <TableCell className="text-right">{item.averageDailyPay.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Badge className={getStatusColor(item.status)}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => handleApprovePayroll(item.groupId)}
                          disabled={approvalLoading || item.status === 'PAID'}
                          variant={item.status === 'PENDING' ? 'default' : 'outline'}
                        >
                          {approvalLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'اعتماد'
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Payroll Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>ملخص الرواتب اليومية</CardTitle>
          <CardDescription>عرض تفاصيل رواتب الموظفين</CardDescription>
        </CardHeader>
        <CardContent>
          {dailyPayrollLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : dailyPayrollData?.summary && dailyPayrollData.summary.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              لا توجد بيانات للعرض
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الموظف</TableHead>
                    <TableHead>المجموعة</TableHead>
                    <TableHead className="text-right">الساعات المطلوبة</TableHead>
                    <TableHead className="text-right">الساعات الفعلية</TableHead>
                    <TableHead className="text-right">التأخر (دقيقة)</TableHead>
                    <TableHead className="text-right">الراتب</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyPayrollData?.summary?.map((item: DailyPayrollItem) => (
                    <TableRow key={`${item.workerId}-${item.workDate}`}>
                      <TableCell className="font-medium">
                        {item.workerName}
                        <br />
                        <span className="text-xs text-gray-500">{item.workerCode}</span>
                      </TableCell>
                      <TableCell>{item.groupName}</TableCell>
                      <TableCell className="text-right">{item.scheduledHours.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{item.actualHours.toFixed(1)}</TableCell>
                      <TableCell className="text-right">
                        {item.lateMinutes > 0 ? (
                          <span className="text-red-600 font-semibold">{item.lateMinutes}</span>
                        ) : (
                          <span className="text-green-600">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {item.calculatedPay.toFixed(2)} ر.س
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(item.status)}
                          <Badge className={getStatusColor(item.status)}>
                            {item.status === 'COMPLETED' ? 'مكتمل' : 'قيد المراجعة'}
                          </Badge>
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

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">ملاحظات مهمة</CardTitle>
        </CardHeader>
        <CardContent className="text-blue-800 space-y-2">
          <p>• الرسوم البيانية تعرض ملخص شامل لأداء جميع المجموعات</p>
          <p>• يمكنك فلترة البيانات حسب التاريخ والمجموعة</p>
          <p>• زر الاعتماد يقوم بتثبيت الرواتب في النظام</p>
          <p>• جميع البيانات محدثة في الوقت الفعلي</p>
        </CardContent>
      </Card>
    </div>
  );
}
