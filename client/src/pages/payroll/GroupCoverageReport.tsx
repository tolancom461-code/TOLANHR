import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, CheckCircle2, RefreshCw, CalendarX2, X } from 'lucide-react';

export default function GroupCoverageReport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [groupId, setGroupId] = useState('');

  const { data: costCenters } = trpc.costCenters.list.useQuery();
  const { data: costCenterGroups } = trpc.groups.listByCostCenter.useQuery(
    { costCenterId: costCenterId ? parseInt(costCenterId) : undefined },
    { enabled: !!costCenterId }
  );

  const { data: report, isLoading, refetch } = trpc.payroll.getGroupCoverageReport.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    costCenterId: costCenterId ? parseInt(costCenterId) : undefined,
    groupId: groupId ? parseInt(groupId) : undefined,
  });

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setCostCenterId('');
    setGroupId('');
  };

  const hasFilters = !!(startDate || endDate || costCenterId || groupId);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-6 w-6" />
              تغطية المجموعات
            </h1>
            <p className="text-muted-foreground">
              المجموعات التي فيها حركة عمال (حضور فعلي) في أيام لم تُدرج بعد ضمن أي دفعة رواتب
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">فلترة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div className="space-y-2">
                <Label>من تاريخ</Label>
                <input
                  type="date"
                  className="border rounded px-3 py-2 text-sm w-full bg-background"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>إلى تاريخ</Label>
                <input
                  type="date"
                  className="border rounded px-3 py-2 text-sm w-full bg-background"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>مركز التكلفة</Label>
                <Select
                  value={costCenterId}
                  onValueChange={(value) => {
                    setCostCenterId(value);
                    setGroupId('');
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="كل المراكز" />
                  </SelectTrigger>
                  <SelectContent>
                    {costCenters?.map((cc: any) => (
                      <SelectItem key={cc.id} value={String(cc.id)}>
                        {cc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>المجموعة</Label>
                <Select value={groupId} onValueChange={setGroupId} disabled={!costCenterId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={costCenterId ? 'كل المجموعات' : 'اختر مركز التكلفة أولاً'} />
                  </SelectTrigger>
                  <SelectContent>
                    {costCenterGroups?.map((g: any) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button variant="outline" onClick={clearFilters} disabled={!hasFilters}>
                <X className="h-4 w-4 ml-1" />
                إعادة تعيين
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              جاري التحميل...
            </CardContent>
          </Card>
        ) : !report?.length ? (
          <Card>
            <CardContent className="py-10 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
              <p className="mt-3 font-medium text-green-700 dark:text-green-400">
                {hasFilters ? 'لا توجد أيام غير مُغطاة ضمن هذه الفلترة' : 'كل المجموعات محدَّثة — لا توجد أيام غير مُغطاة'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {report.map((group: any, gIdx: number) => {
              const palette = [
                { border: 'border-red-300 dark:border-red-900', header: 'bg-red-50 dark:bg-red-950/40', badge: 'bg-red-600', text: 'text-red-700 dark:text-red-400' },
                { border: 'border-orange-300 dark:border-orange-900', header: 'bg-orange-50 dark:bg-orange-950/40', badge: 'bg-orange-600', text: 'text-orange-700 dark:text-orange-400' },
                { border: 'border-rose-300 dark:border-rose-900', header: 'bg-rose-50 dark:bg-rose-950/40', badge: 'bg-rose-600', text: 'text-rose-700 dark:text-rose-400' },
              ];
              const colors = palette[gIdx % palette.length];
              const weekdayAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

              return (
                <Card key={group.groupId} className={`overflow-hidden ${colors.border}`}>
                  <CardHeader className={`py-3 ${colors.header}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        📁 {group.groupName}
                        {group.costCenterName && (
                          <span className="text-sm font-normal text-muted-foreground">
                            ({group.costCenterName})
                          </span>
                        )}
                      </CardTitle>
                      <Badge className={`${colors.badge} text-white`}>
                        <CalendarX2 className="h-3.5 w-3.5 ml-1" />
                        {group.missingDates.length} يوم بلا دفعة
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16 text-center">#</TableHead>
                          <TableHead className="text-center">التاريخ</TableHead>
                          <TableHead className="text-center">اليوم</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.missingDates.map((date: string, idx: number) => (
                          <TableRow
                            key={date}
                            className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}
                          >
                            <TableCell className="text-center font-semibold text-muted-foreground">
                              {idx + 1}
                            </TableCell>
                            <TableCell className={`text-center font-mono font-medium ${colors.text}`}>
                              {date}
                            </TableCell>
                            <TableCell className="text-center text-sm text-muted-foreground">
                              {weekdayAr[new Date(date).getDay()]}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
