import { useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  RadarChart,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface PayrollChartProps {
  data?: any[];
  period?: 'daily' | 'weekly' | 'monthly';
}

interface GroupPayrollData {
  groupName: string;
  totalPayroll: number;
  totalEmployees: number;
  attendanceRate: number;
}

interface DisciplineData {
  day: string;
  onTime: number;
  late: number;
  absent: number;
}

interface PayrollTrendData {
  date: string;
  payroll: number;
  employees: number;
}

export function PayrollCharts({ data = [], period = 'weekly' }: PayrollChartProps) {
  // Mock data for demonstration
  const groupPayrollData: GroupPayrollData[] = useMemo(() => {
    return [
      { groupName: 'الفنيين', totalPayroll: 45000, totalEmployees: 15, attendanceRate: 95 },
      { groupName: 'الإداريين', totalPayroll: 38000, totalEmployees: 12, attendanceRate: 98 },
      { groupName: 'الأمن', totalPayroll: 32000, totalEmployees: 10, attendanceRate: 92 },
      { groupName: 'الصيانة', totalPayroll: 28000, totalEmployees: 8, attendanceRate: 90 },
      { groupName: 'المبيعات', totalPayroll: 52000, totalEmployees: 18, attendanceRate: 94 },
    ];
  }, []);

  const disciplineData: DisciplineData[] = useMemo(() => {
    return [
      { day: 'الأحد', onTime: 85, late: 12, absent: 3 },
      { day: 'الاثنين', onTime: 88, late: 10, absent: 2 },
      { day: 'الثلاثاء', onTime: 82, late: 15, absent: 3 },
      { day: 'الأربعاء', onTime: 90, late: 8, absent: 2 },
      { day: 'الخميس', onTime: 87, late: 11, absent: 2 },
      { day: 'الجمعة', onTime: 95, late: 4, absent: 1 },
      { day: 'السبت', onTime: 92, late: 6, absent: 2 },
    ];
  }, []);

  const payrollTrendData: PayrollTrendData[] = useMemo(() => {
    return [
      { date: '1 فبراير', payroll: 195000, employees: 63 },
      { date: '2 فبراير', payroll: 198000, employees: 64 },
      { date: '3 فبراير', payroll: 192000, employees: 62 },
      { date: '4 فبراير', payroll: 205000, employees: 65 },
      { date: '5 فبراير', payroll: 210000, employees: 66 },
      { date: '6 فبراير', payroll: 208000, employees: 65 },
      { date: '7 فبراير', payroll: 215000, employees: 67 },
    ];
  }, []);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="space-y-6">
      {/* Payroll by Group */}
      <Card>
        <CardHeader>
          <CardTitle>توزيع الرواتب حسب المجموعة</CardTitle>
          <CardDescription>إجمالي الرواتب المصروفة لكل مجموعة</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={groupPayrollData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="groupName" />
              <YAxis />
              <Tooltip formatter={(value) => `${value.toLocaleString()} ر.س`} />
              <Legend />
              <Bar dataKey="totalPayroll" fill="#3b82f6" name="إجمالي الراتب" />
              <Bar dataKey="totalEmployees" fill="#10b981" name="عدد الموظفين" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Attendance Rate by Group */}
      <Card>
        <CardHeader>
          <CardTitle>معدل الحضور حسب المجموعة</CardTitle>
          <CardDescription>نسبة الانضباط والالتزام</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={groupPayrollData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ groupName, attendanceRate }) => `${groupName}: ${attendanceRate}%`}
                outerRadius={120}
                fill="#8884d8"
                dataKey="attendanceRate"
              >
                {groupPayrollData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${value}%`} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Weekly Discipline Report */}
      <Card>
        <CardHeader>
          <CardTitle>تقرير الانضباط الأسبوعي</CardTitle>
          <CardDescription>نسبة الحضور في الوقت المحدد والتأخر والغياب</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={disciplineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="onTime" fill="#10b981" name="في الوقت المحدد" />
              <Bar dataKey="late" fill="#f59e0b" name="متأخر" />
              <Bar dataKey="absent" fill="#ef4444" name="غائب" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Payroll Trend */}
      <Card>
        <CardHeader>
          <CardTitle>اتجاه الرواتب والموظفين</CardTitle>
          <CardDescription>تطور الرواتب المصروفة وعدد الموظفين على مدار الأسبوع</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={payrollTrendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="payroll"
                stroke="#3b82f6"
                name="إجمالي الرواتب (ر.س)"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="employees"
                stroke="#10b981"
                name="عدد الموظفين"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Radar Chart - Group Performance */}
      <Card>
        <CardHeader>
          <CardTitle>مؤشرات الأداء حسب المجموعة</CardTitle>
          <CardDescription>مقارنة شاملة لأداء جميع المجموعات</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <RadarChart data={groupPayrollData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="groupName" />
              <PolarRadiusAxis angle={90} domain={[0, 100]} />
              <Radar
                name="معدل الحضور"
                dataKey="attendanceRate"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.6}
              />
              <Tooltip />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">إجمالي الرواتب الأسبوعية</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {groupPayrollData.reduce((sum, g) => sum + g.totalPayroll, 0).toLocaleString()} ر.س
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {groupPayrollData.reduce((sum, g) => sum + g.totalEmployees, 0)} موظف
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">متوسط معدل الحضور</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {(
                groupPayrollData.reduce((sum, g) => sum + g.attendanceRate, 0) /
                groupPayrollData.length
              ).toFixed(1)}
              %
            </div>
            <p className="text-xs text-gray-500 mt-2">عبر جميع المجموعات</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function AttendanceChart({ data = [] }: { data?: any[] }) {
  const chartData = useMemo(() => {
    return [
      { time: '08:00', present: 45, late: 8, absent: 5 },
      { time: '09:00', present: 52, late: 3, absent: 3 },
      { time: '10:00', present: 55, late: 1, absent: 2 },
      { time: '11:00', present: 56, late: 0, absent: 2 },
      { time: '12:00', present: 56, late: 0, absent: 2 },
    ];
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>حالة الحضور خلال اليوم</CardTitle>
        <CardDescription>تطور الحضور والتأخر والغياب</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="present" stroke="#10b981" name="حاضر" />
            <Line type="monotone" dataKey="late" stroke="#f59e0b" name="متأخر" />
            <Line type="monotone" dataKey="absent" stroke="#ef4444" name="غائب" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
