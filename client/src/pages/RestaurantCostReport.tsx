import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, AlertTriangle } from 'lucide-react';

export default function RestaurantCostReport() {
  const today = new Date().toLocaleDateString('en-CA');
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);

  const [startDate, setStartDate] = useState(firstOfMonth.toLocaleDateString('en-CA'));
  const [endDate, setEndDate] = useState(today);

  const { data: report, isLoading } = trpc.restaurants.costReport.useQuery(
    { startDate, endDate },
    { enabled: !!startDate && !!endDate }
  );

  const totalCost =
    (report?.restaurants.reduce((sum, r) => sum + r.totalCost, 0) || 0) +
    (report?.unassigned?.totalCost || 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            تقرير تكاليف المطاعم
          </h1>
          <p className="text-muted-foreground">
            تكلفة العمالة الفعلية لكل مطعم خلال الفترة المحددة (محسوبة من السجل المالي اليومي)
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">الفترة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">النتائج</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
            ) : !report?.restaurants.length && !report?.unassigned ? (
              <div className="text-center py-8 text-muted-foreground">لا توجد بيانات لهذه الفترة</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المطعم</TableHead>
                    <TableHead>عدد العمال</TableHead>
                    <TableHead>إجمالي التكلفة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report?.restaurants.map((r) => (
                    <TableRow key={r.restaurantId}>
                      <TableCell className="font-medium">{r.restaurantName}</TableCell>
                      <TableCell>{r.workerCount}</TableCell>
                      <TableCell className="font-semibold">
                        {r.totalCost.toLocaleString('ar-SA')} ر.س
                      </TableCell>
                    </TableRow>
                  ))}
                  {report?.unassigned && (
                    <TableRow className="bg-yellow-50 dark:bg-yellow-950">
                      <TableCell className="font-medium flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        غير محدد (عمال بلا تعيين مطعم)
                      </TableCell>
                      <TableCell>{report.unassigned.workerCount}</TableCell>
                      <TableCell className="font-semibold">
                        {report.unassigned.totalCost.toLocaleString('ar-SA')} ر.س
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow className="bg-muted/50 font-bold border-t-2">
                    <TableCell>الإجمالي</TableCell>
                    <TableCell></TableCell>
                    <TableCell>{totalCost.toLocaleString('ar-SA')} ر.س</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
