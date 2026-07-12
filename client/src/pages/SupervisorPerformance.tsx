import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, AlertTriangle, Users, Calendar, Printer, TrendingDown, CheckCircle, XCircle, ArrowLeftRight } from "lucide-react";

export default function SupervisorPerformance() {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [fromDate, setFromDate] = useState(weekAgo);
  const [toDate, setToDate] = useState(today);
  const [filterSupervisor, setFilterSupervisor] = useState<string>("all");

  const { data: performanceData, isLoading } = trpc.operationalDashboard.getSupervisorPerformance.useQuery(
    { fromDate, toDate },
    { enabled: !!fromDate && !!toDate }
  );

  // فلترة حسب المشرف
  const filteredData = useMemo(() => {
    if (!performanceData) return [];
    if (filterSupervisor === "all") return performanceData;
    return performanceData.filter((r: any) => String(r.supervisorId) === filterSupervisor);
  }, [performanceData, filterSupervisor]);

  // قائمة المشرفين الفريدين
  const supervisors = useMemo(() => {
    if (!performanceData) return [];
    const map = new Map();
    performanceData.forEach((r: any) => {
      if (!map.has(r.supervisorId)) {
        map.set(r.supervisorId, { id: r.supervisorId, name: r.supervisorName, role: r.supervisorRole });
      }
    });
    return Array.from(map.values());
  }, [performanceData]);

  // تجميع حسب التاريخ
  const groupedByDate = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredData.forEach((r: any) => {
      if (!groups[r.date]) groups[r.date] = [];
      groups[r.date].push(r);
    });
    return groups;
  }, [filteredData]);

  // إحصائيات عامة
  const stats = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return null;
    const totalPresent = filteredData.reduce((s: number, r: any) => s + r.totalPresent, 0);
    const totalConfirmed = filteredData.reduce((s: number, r: any) => s + r.confirmedCount, 0);
    const totalUnconfirmed = filteredData.reduce((s: number, r: any) => s + r.unconfirmedCount, 0);
    const totalActions = filteredData.reduce((s: number, r: any) => s + r.totalActions, 0);
    const avgShortfall = filteredData.length > 0 ? Math.round(filteredData.reduce((s: number, r: any) => s + r.shortfallPercent, 0) / filteredData.length) : 0;
    return { totalPresent, totalConfirmed, totalUnconfirmed, totalActions, avgShortfall };
  }, [filteredData]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getShortfallColor = (percent: number) => {
    if (percent === 0) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400";
    if (percent <= 30) return "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400";
    if (percent <= 60) return "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400";
    return "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400";
  };

  const getShortfallIcon = (percent: number) => {
    if (percent === 0) return <CheckCircle className="h-4 w-4" />;
    if (percent <= 30) return <AlertTriangle className="h-4 w-4" />;
    return <XCircle className="h-4 w-4" />;
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* العنوان */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-foreground">متابعة أداء المشرفين</h1>
            <p className="text-muted-foreground mt-1">
              تقرير متابعة التزام المشرفين بتأكيد الحضور والإجراءات التشغيلية
            </p>
          </div>
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            طباعة التقرير
          </Button>
        </div>

        {/* عنوان الطباعة */}
        <div className="hidden print:block text-center mb-6">
          <h1 className="text-xl font-bold">تقرير متابعة أداء المشرفين</h1>
          <p className="text-sm text-gray-600 mt-1">
            الفترة: من {fromDate} إلى {toDate} | تاريخ الطباعة: {new Date().toLocaleDateString('ar-SA')}
          </p>
        </div>

        {/* الفلاتر */}
        <Card className="print:hidden">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">من تاريخ</label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-[180px]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">إلى تاريخ</label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-[180px]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">المشرف</label>
                <Select value={filterSupervisor} onValueChange={setFilterSupervisor}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="جميع المشرفين" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المشرفين</SelectItem>
                    {supervisors.map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* بطاقات الإحصائيات */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <Users className="h-6 w-6 mx-auto text-blue-500 mb-2" />
                <p className="text-2xl font-bold">{stats.totalPresent}</p>
                <p className="text-xs text-muted-foreground">إجمالي الحاضرين</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <ShieldCheck className="h-6 w-6 mx-auto text-emerald-500 mb-2" />
                <p className="text-2xl font-bold text-emerald-600">{stats.totalConfirmed}</p>
                <p className="text-xs text-muted-foreground">تأكيدات الحضور</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <AlertTriangle className="h-6 w-6 mx-auto text-amber-500 mb-2" />
                <p className="text-2xl font-bold text-amber-600">{stats.totalUnconfirmed}</p>
                <p className="text-xs text-muted-foreground">غير مؤكدين</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <ArrowLeftRight className="h-6 w-6 mx-auto text-purple-500 mb-2" />
                <p className="text-2xl font-bold text-purple-600">{stats.totalActions}</p>
                <p className="text-xs text-muted-foreground">إجمالي الإجراءات</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingDown className="h-6 w-6 mx-auto text-red-500 mb-2" />
                <p className="text-2xl font-bold text-red-600">{stats.avgShortfall}%</p>
                <p className="text-xs text-muted-foreground">متوسط نسبة التقصير</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* المحتوى */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="mr-3 text-muted-foreground">جاري تحميل البيانات...</span>
          </div>
        ) : filteredData.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium mb-2">لا توجد بيانات في الفترة المحددة</p>
              <p className="text-sm">الأسباب المحتملة:</p>
              <ul className="text-sm mt-2 space-y-1">
                <li>• لا توجد بيانات حضور في هذه الفترة</li>
                <li>• المشرفون ليس لديهم مجموعات معينة</li>
                <li>• جميع العمال غائبون في هذه الفترة</li>
              </ul>
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedByDate).map(([date, records]) => (
            <Card key={date} className="print:break-inside-avoid">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5 text-primary" />
                  {formatDate(date)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">المشرف</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">الدور</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">المجموعات</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">الحاضرون</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">تأكيد حضور</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">تأكيد غياب</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">نقل</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">غير مؤكدين</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">نسبة التقصير</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(records as any[]).map((record: any) => (
                        <tr key={`${record.date}-${record.supervisorId}`} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 font-medium">{record.supervisorName}</td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className={record.supervisorRole === 'مشرف تولان' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}>
                              {record.supervisorRole}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground max-w-[200px] truncate" title={record.groupNames}>
                            {record.groupNames}
                          </td>
                          <td className="py-3 px-4 text-center font-medium">{record.totalPresent}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="text-emerald-600 font-medium">{record.confirmedCount}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="text-red-600 font-medium">{record.absenceCount}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="text-purple-600 font-medium">{record.transferCount}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`font-bold ${record.unconfirmedCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {record.unconfirmedCount}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Badge className={`gap-1 ${getShortfallColor(record.shortfallPercent)}`}>
                              {getShortfallIcon(record.shortfallPercent)}
                              {record.shortfallPercent}%
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </DashboardLayout>
  );
}
