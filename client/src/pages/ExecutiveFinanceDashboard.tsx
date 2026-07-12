import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, Building2, UsersRound, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COST_CENTER_COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#1d4ed8'];
const GROUP_COLORS = ['#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#047857'];

type PeriodType = 'last_week' | 'last_month' | 'custom';

function getLastWeekRange(): { start: string; end: string } {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun
  // Last week: previous Sunday to Saturday
  const lastSaturday = new Date(today);
  lastSaturday.setDate(today.getDate() - dayOfWeek - 1);
  const lastSunday = new Date(lastSaturday);
  lastSunday.setDate(lastSaturday.getDate() - 6);
  return {
    start: lastSunday.toISOString().split('T')[0],
    end: lastSaturday.toISOString().split('T')[0],
  };
}

function getLastMonthRange(): { start: string; end: string } {
  const today = new Date();
  const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  return {
    start: firstDayLastMonth.toISOString().split('T')[0],
    end: lastDayLastMonth.toISOString().split('T')[0],
  };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatCurrency(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return num.toLocaleString('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function ExecutiveFinanceDashboard() {
  const [periodType, setPeriodType] = useState<PeriodType>('last_month');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<string>('all');

  // Get groups and cost centers for filters
  const { data: groupsData } = trpc.groups.list.useQuery();
  const { data: costCentersData } = trpc.costCenters.list.useQuery();

  // Calculate date range based on period type
  const dateRange = useMemo(() => {
    if (periodType === 'last_week') return getLastWeekRange();
    if (periodType === 'last_month') return getLastMonthRange();
    return { start: customStart, end: customEnd };
  }, [periodType, customStart, customEnd]);

  // Fetch finance summary
  const { data, isLoading } = trpc.executive.financeSummary.useQuery({
    periodStart: dateRange.start,
    periodEnd: dateRange.end,
    groupId: selectedGroupId !== 'all' ? parseInt(selectedGroupId) : undefined,
    costCenterId: selectedCostCenterId !== 'all' ? parseInt(selectedCostCenterId) : undefined,
  });

  const periodLabel = periodType === 'last_week'
    ? 'الأسبوع الماضي'
    : periodType === 'last_month'
    ? 'الشهر الماضي'
    : 'فترة مخصصة';

  return (
    <DashboardLayout>
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">لوحة الإدارة العليا</h1>
        <p className="text-muted-foreground mt-1">ملخص مالي تنفيذي</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        {/* Period selector */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">الفترة الزمنية</label>
          <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_week">الأسبوع الماضي</SelectItem>
              <SelectItem value="last_month">الشهر الماضي</SelectItem>
              <SelectItem value="custom">من تاريخ - إلى تاريخ</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Custom date range */}
        {periodType === 'custom' && (
          <>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">من تاريخ</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="flex h-9 w-[160px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">إلى تاريخ</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="flex h-9 w-[160px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              />
            </div>
          </>
        )}

        {/* Group filter */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">المجموعة</label>
          <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المجموعات</SelectItem>
              {groupsData?.map((g: any) => (
                <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Cost center filter */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">مركز التكلفة</label>
          <Select value={selectedCostCenterId} onValueChange={setSelectedCostCenterId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المراكز</SelectItem>
              {costCentersData?.map((cc: any) => (
                <SelectItem key={cc.id} value={String(cc.id)}>{cc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Period info */}
      <p className="text-sm text-muted-foreground">
        {periodLabel}: {formatDate(dateRange.start)} — {formatDate(dateRange.end)}
      </p>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Data */}
      {data && !isLoading && (
        <div className="space-y-8">
          {/* Grand Total Card */}
          <Card className="bg-gradient-to-br from-blue-600 to-blue-800 text-white border-0 shadow-lg">
            <CardContent className="pt-8 pb-8 text-center">
              <div className="flex items-center justify-center gap-3 mb-3">
                <DollarSign className="h-8 w-8 opacity-80" />
                <span className="text-lg opacity-90">إجمالي الرواتب</span>
              </div>
              <div className="text-6xl font-bold tracking-tight" dir="ltr">
                {formatCurrency(data.totalNet)}
                <span className="text-2xl font-normal mr-2 opacity-80">ر.س</span>
              </div>
            </CardContent>
          </Card>

          {/* Charts Section */}
          {data.byCostCenter.length > 0 && data.byGroup.length > 0 && selectedCostCenterId === 'all' && selectedGroupId === 'all' && (
            <div className="grid gap-6 md:grid-cols-2">
              {/* Cost Center Pie Chart */}
              <Card>
                <CardContent className="pt-6 pb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <h3 className="text-lg font-semibold">توزيع الرواتب حسب مراكز التكلفة</h3>
                  </div>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.byCostCenter.map((cc) => ({
                            name: cc.name,
                            value: parseFloat(cc.total),
                          }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={3}
                          dataKey="value"
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          labelLine={true}
                        >
                          {data.byCostCenter.map((_, index) => (
                            <Cell key={`cc-${index}`} fill={COST_CENTER_COLORS[index % COST_CENTER_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [`${formatCurrency(value)} ر.س`, 'المبلغ']}
                          contentStyle={{ direction: 'rtl', borderRadius: '8px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Group Pie Chart */}
              <Card>
                <CardContent className="pt-6 pb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <UsersRound className="h-5 w-5 text-muted-foreground" />
                    <h3 className="text-lg font-semibold">توزيع الرواتب حسب المجموعات</h3>
                  </div>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.byGroup.map((g) => ({
                            name: g.name,
                            value: parseFloat(g.total),
                          }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={3}
                          dataKey="value"
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          labelLine={true}
                        >
                          {data.byGroup.map((_, index) => (
                            <Cell key={`g-${index}`} fill={GROUP_COLORS[index % GROUP_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [`${formatCurrency(value)} ر.س`, 'المبلغ']}
                          contentStyle={{ direction: 'rtl', borderRadius: '8px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Cost Center Breakdown Cards */}
          {data.byCostCenter.length > 0 && selectedCostCenterId === 'all' && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-xl font-semibold">حسب مراكز التكلفة</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.byCostCenter.map((cc, index) => (
                  <Card key={cc.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-6 pb-6">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COST_CENTER_COLORS[index % COST_CENTER_COLORS.length] }} />
                        <p className="text-sm text-muted-foreground">{cc.code}</p>
                      </div>
                      <p className="text-base font-medium mb-3">{cc.name}</p>
                      <div className="text-3xl font-bold text-blue-700" dir="ltr">
                        {formatCurrency(cc.total)}
                        <span className="text-base font-normal mr-1 text-muted-foreground">ر.س</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Group Breakdown Cards */}
          {data.byGroup.length > 0 && selectedGroupId === 'all' && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <UsersRound className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-xl font-semibold">حسب المجموعات</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.byGroup.map((g, index) => (
                  <Card key={g.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-6 pb-6">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: GROUP_COLORS[index % GROUP_COLORS.length] }} />
                        <p className="text-sm text-muted-foreground">{g.code}</p>
                      </div>
                      <p className="text-base font-medium mb-3">{g.name}</p>
                      <div className="text-3xl font-bold text-emerald-700" dir="ltr">
                        {formatCurrency(g.total)}
                        <span className="text-base font-normal mr-1 text-muted-foreground">ر.س</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {parseFloat(data.totalNet) === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg">لا توجد بيانات مالية للفترة المحددة</p>
              <p className="text-sm mt-1">جرب تغيير الفترة الزمنية أو الفلاتر</p>
            </div>
          )}
        </div>
      )}
    </div>
    </DashboardLayout>
  );
}
