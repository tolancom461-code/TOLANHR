import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, FileText, BarChart3, TrendingUp, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { useLocation } from 'wouter';

export function AttendanceExport() {
  const [, setLocation] = useLocation();
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toLocaleDateString('en-CA');
  });
  const [endDate, setEndDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>();
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<number | undefined>();

  // Fetch groups and cost centers
  const { data: allGroups = [], isLoading: groupsLoading } = trpc.groups.list.useQuery();
  const { data: costCenters = [], isLoading: costCentersLoading } = trpc.costCenters.list.useQuery();
  
  // Filter groups based on selected cost center (Cascading Filter)
  const groups = selectedCostCenterId 
    ? allGroups.filter(g => g.costCenterId === selectedCostCenterId)
    : allGroups;

  // Export mutations
  const exportDetailedMutation = trpc.export.detailedAttendance.useMutation();
  const exportSummaryByWorkerMutation = trpc.export.summaryByWorker.useMutation();
  const exportSummaryByGroupMutation = trpc.export.summaryByGroup.useMutation();
  const exportSummaryByCostCenterMutation = trpc.export.summaryByCostCenter.useMutation();

  const downloadFile = (data: string, filename: string) => {
    const link = document.createElement('a');
    link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${data}`;
    link.download = filename;
    link.click();
  };

  const handleExportDetailed = async () => {
    try {
      const result = await exportDetailedMutation.mutateAsync({
        startDate,
        endDate,
        groupId: selectedGroupId,
        costCenterId: selectedCostCenterId,
      });

      downloadFile(result.data, result.filename);

      toast.success('تم تصدير التقرير المفصل بنجاح');
    } catch (error) {
      toast.error('حدث خطأ أثناء تصدير التقرير');
    }
  };

  const handleExportSummaryByWorker = async () => {
    try {
      const result = await exportSummaryByWorkerMutation.mutateAsync({
        startDate,
        endDate,
        groupId: selectedGroupId,
        costCenterId: selectedCostCenterId,
      });

      downloadFile(result.data, result.filename);
      toast.success('تم تصدير ملخص الحضور بالعامل بنجاح');
    } catch (error) {
      toast.error('حدث خطأ أثناء تصدير التقرير');
    }
  };

  const handleExportSummaryByGroup = async () => {
    try {
      const result = await exportSummaryByGroupMutation.mutateAsync({
        startDate,
        endDate,
        costCenterId: selectedCostCenterId,
      });

      downloadFile(result.data, result.filename);
      toast.success('تم تصدير ملخص الحضور بالمجموعة بنجاح');
    } catch (error) {
      toast.error('حدث خطأ أثناء تصدير التقرير');
    }
  };

  const handleExportSummaryByCostCenter = async () => {
    try {
      const result = await exportSummaryByCostCenterMutation.mutateAsync({
        startDate,
        endDate,
      });

      downloadFile(result.data, result.filename);
      toast.success('تم تصدير ملخص الحضور بمركز التكلفة بنجاح');
    } catch (error) {
      toast.error('حدث خطأ أثناء تصدير التقرير');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">تصدير تقارير الحضور والانصراف</h1>
          <p className="text-muted-foreground mt-2">
            صدّر تقارير الحضور والانصراف بصيغ مختلفة ومستويات تفصيل متعددة
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation('/attendance/reports')}>
          <ArrowRight className="w-4 h-4 ml-2" />
          العودة
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>معاملات البحث والتصفية</CardTitle>
          <CardDescription>
            حدد نطاق التاريخ والمجموعة لتصفية البيانات
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">تاريخ البداية</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">تاريخ النهاية</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">المجموعة</label>
              {groupsLoading ? (
                <div className="h-10 bg-muted rounded animate-pulse" />
              ) : (
                <Select
                  value={selectedGroupId?.toString() || ''}
                  onValueChange={(value) =>
                    setSelectedGroupId(value ? parseInt(value) : undefined)
                  }
                  disabled={!selectedCostCenterId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      selectedCostCenterId 
                        ? "اختر مجموعة" 
                        : "اختر مركز التكلفة أولاً"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.length > 0 ? (
                      groups.map((group) => (
                        <SelectItem key={group.id} value={group.id.toString()}>
                          {group.name}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        لا توجد مجموعات في هذا المركز
                      </div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">مركز التكلفة</label>
              {costCentersLoading ? (
                <div className="h-10 bg-muted rounded animate-pulse" />
              ) : (
                <Select
                  value={selectedCostCenterId?.toString() || ''}
                  onValueChange={(value) => {
                    setSelectedCostCenterId(value ? parseInt(value) : undefined);
                    // Reset group selection when cost center changes
                    setSelectedGroupId(undefined);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر مركز تكلفة" />
                  </SelectTrigger>
                  <SelectContent>
                    {costCenters.map((center) => (
                      <SelectItem key={center.id} value={center.id.toString()}>
                        {center.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Options */}
      <Tabs defaultValue="detailed" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="detailed">تفصيلي</TabsTrigger>
          <TabsTrigger value="worker">بالعامل</TabsTrigger>
          <TabsTrigger value="group">بالمجموعة</TabsTrigger>
          <TabsTrigger value="costcenter">بمركز التكلفة</TabsTrigger>
        </TabsList>

        <TabsContent value="detailed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                التقرير المفصل
              </CardTitle>
              <CardDescription>
                تقرير يحتوي على جميع سجلات الحضور والانصراف بالتفاصيل الكاملة
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <h4 className="font-semibold">المحتويات:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>اسم العامل</li>
                  <li>كود العامل</li>
                  <li>المجموعة</li>
                  <li>مركز التكلفة</li>
                  <li>نوع الحدث (حضور/انصراف)</li>
                  <li>الوقت والتاريخ</li>
                  <li>طريقة التسجيل</li>
                </ul>
              </div>
              <Button
                onClick={handleExportDetailed}
                disabled={exportDetailedMutation.isPending}
                className="w-full"
              >
                <Download className="w-4 h-4 mr-2" />
                {exportDetailedMutation.isPending
                  ? 'جاري التصدير...'
                  : 'تصدير إلى Excel'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="worker" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                ملخص الحضور بالعامل
              </CardTitle>
              <CardDescription>
                ملخص إجمالي الحضور والانصراف والساعات لكل عامل
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <h4 className="font-semibold">المحتويات:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>اسم العامل</li>
                  <li>كود العامل</li>
                  <li>المجموعة</li>
                  <li>مركز التكلفة</li>
                  <li>أيام الحضور</li>
                  <li>عدد الحضور</li>
                  <li>عدد الانصراف</li>
                  <li>إجمالي الساعات</li>
                  <li>متوسط الساعات اليومي</li>
                </ul>
              </div>
              <Button
                onClick={handleExportSummaryByWorker}
                disabled={exportSummaryByWorkerMutation.isPending}
                className="w-full"
              >
                <Download className="w-4 h-4 mr-2" />
                {exportSummaryByWorkerMutation.isPending
                  ? 'جاري التصدير...'
                  : 'تصدير إلى Excel'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="group" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                ملخص الحضور بالمجموعة
              </CardTitle>
              <CardDescription>
                ملخص إجمالي الحضور والانصراف والساعات لكل مجموعة
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <h4 className="font-semibold">المحتويات:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>اسم المجموعة</li>
                  <li>مركز التكلفة</li>
                  <li>عدد العمال</li>
                  <li>عدد الحضور</li>
                  <li>عدد الانصراف</li>
                  <li>أيام الحضور</li>
                  <li>إجمالي الساعات</li>
                  <li>متوسط الساعات اليومي</li>
                </ul>
              </div>
              <Button
                onClick={handleExportSummaryByGroup}
                disabled={exportSummaryByGroupMutation.isPending}
                className="w-full"
              >
                <Download className="w-4 h-4 mr-2" />
                {exportSummaryByGroupMutation.isPending
                  ? 'جاري التصدير...'
                  : 'تصدير إلى Excel'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costcenter" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                ملخص الحضور بمركز التكلفة
              </CardTitle>
              <CardDescription>
                ملخص إجمالي الحضور والانصراف والساعات لكل مركز تكلفة
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <h4 className="font-semibold">المحتويات:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>اسم مركز التكلفة</li>
                  <li>عدد المجموعات</li>
                  <li>عدد العمال</li>
                  <li>عدد الحضور</li>
                  <li>عدد الانصراف</li>
                  <li>أيام الحضور</li>
                  <li>إجمالي الساعات</li>
                  <li>متوسط الساعات اليومي</li>
                </ul>
              </div>
              <Button
                onClick={handleExportSummaryByCostCenter}
                disabled={exportSummaryByCostCenterMutation.isPending}
                className="w-full"
              >
                <Download className="w-4 h-4 mr-2" />
                {exportSummaryByCostCenterMutation.isPending
                  ? 'جاري التصدير...'
                  : 'تصدير إلى Excel'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">تنسيق الملف</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">Excel</p>
            <p className="text-xs text-muted-foreground mt-1">
              صيغة .xlsx متوافقة مع جميع الأجهزة
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">الفترة الزمنية</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))} يوم
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              من {startDate} إلى {endDate}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">التحديث</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">فوري</p>
            <p className="text-xs text-muted-foreground mt-1">
              البيانات محدثة في الوقت الفعلي
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
