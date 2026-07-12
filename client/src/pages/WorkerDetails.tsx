import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  ArrowRight, 
  User, 
  Phone, 
  CreditCard, 
  Calendar, 
  Building2, 
  Clock,
  Printer,
  QrCode,
  Wallet,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus
} from "lucide-react";

export default function WorkerDetails() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const workerId = params.id ? parseInt(params.id) : 0;

  const { data: worker, isLoading } = trpc.workers.getById.useQuery(
    { id: workerId },
    { enabled: workerId > 0 }
  );

  const { data: groups } = trpc.groups.list.useQuery();
  
  const { data: attendance, isLoading: attendanceLoading } = trpc.workers.getAttendance.useQuery(
    { workerId, limit: 30 },
    { enabled: workerId > 0 }
  );
  
  const { data: financeSummary, isLoading: financeLoading } = trpc.workers.getFinanceSummary.useQuery(
    { workerId },
    { enabled: workerId > 0 }
  );
  
  const { data: payOverrides } = trpc.workers.getPayOverrides.useQuery(
    { workerId },
    { enabled: workerId > 0 }
  );

  const getGroupName = (groupId: number | null) => {
    if (!groupId) return "غير محدد";
    const group = groups?.find(g => g.id === groupId);
    return group?.name || "غير محدد";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 ml-1" />نشط</Badge>;
      case 'suspended':
        return <Badge variant="secondary"><AlertCircle className="h-3 w-3 ml-1" />معلق</Badge>;
      case 'archived':
        return <Badge variant="outline"><XCircle className="h-3 w-3 ml-1" />مؤرشف</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const generateQRCodeUrl = (token: string) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(token)}`;
  };

  const formatTime = (date: Date | string) => {
    return new Date(date).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('ar-SA');
  };

  const getEventTypeBadge = (eventType: string) => {
    if (eventType === 'check_in') {
      return <Badge className="bg-green-100 text-green-800">حضور</Badge>;
    }
    return <Badge className="bg-orange-100 text-orange-800">انصراف</Badge>;
  };

  const getOverrideTypeBadge = (type: string) => {
    switch (type) {
      case 'bonus':
        return <Badge className="bg-green-100 text-green-800"><TrendingUp className="h-3 w-3 ml-1" />مكافأة</Badge>;
      case 'deduction':
        return <Badge className="bg-red-100 text-red-800"><TrendingDown className="h-3 w-3 ml-1" />خصم</Badge>;
      case 'advance':
        return <Badge className="bg-blue-100 text-blue-800"><Minus className="h-3 w-3 ml-1" />سلفة</Badge>;
      case 'emergency_call':
        return <Badge className="bg-purple-100 text-purple-800"><Phone className="h-3 w-3 ml-1" />استدعاء طارئ</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  // Group attendance events by date
  const groupedAttendance = attendance?.reduce((acc, event) => {
    const dateKey = formatDate(event.eventTime);
    if (!acc[dateKey]) {
      acc[dateKey] = { checkIn: null, checkOut: null };
    }
    if (event.eventType === 'check_in') {
      acc[dateKey].checkIn = event;
    } else {
      acc[dateKey].checkOut = event;
    }
    return acc;
  }, {} as Record<string, { checkIn: typeof attendance[0] | null; checkOut: typeof attendance[0] | null }>);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!worker) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-muted-foreground">العامل غير موجود</p>
          <Button onClick={() => setLocation("/workers")}>
            <ArrowRight className="ml-2 h-4 w-4" />
            العودة للعمال
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => setLocation("/workers")}>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{worker.fullName}</h1>
              <p className="text-muted-foreground">كود: {worker.code}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLocation(`/workers/${worker.id}/card`)}>
              <Printer className="ml-2 h-4 w-4" />
              طباعة البطاقة
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Worker Info Card */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                معلومات العامل
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-6">
                {/* Photo */}
                <div className="flex-shrink-0">
                  {worker.photoUrl ? (
                    <img
                      src={worker.photoUrl}
                      alt={worker.fullName}
                      className="w-32 h-32 rounded-xl object-cover border-2 border-gray-200 shadow-sm"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center border-2 border-gray-200">
                      <User className="h-16 w-16 text-gray-400" />
                    </div>
                  )}
                </div>

                {/* Info Grid */}
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" />
                      الاسم الكامل
                    </p>
                    <p className="font-semibold">{worker.fullName}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <CreditCard className="h-3 w-3" />
                      رقم الهوية
                    </p>
                    <p className="font-semibold">{worker.nationalId || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      رقم الهاتف
                    </p>
                    <p className="font-semibold" dir="ltr">{worker.phone || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      المجموعة
                    </p>
                    <p className="font-semibold">{getGroupName(worker.groupId)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Wallet className="h-3 w-3" />
                      الأجر اليومي
                    </p>
                    <p className="font-semibold text-primary">{worker.dailyRate || "0"} ريال</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      تاريخ التعيين
                    </p>
                    <p className="font-semibold">
                      {worker.hireDate ? new Date(worker.hireDate).toLocaleDateString('ar-SA') : "-"}
                    </p>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <p className="text-sm text-muted-foreground">الحالة</p>
                    {getStatusBadge(worker.status || 'active')}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* QR Code Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                رمز الحضور
              </CardTitle>
              <CardDescription>امسح الرمز لتسجيل الحضور</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              {worker.qrToken ? (
                <img
                  src={generateQRCodeUrl(worker.qrToken)}
                  alt="QR Code"
                  className="w-40 h-40 border rounded-lg shadow-sm"
                />
              ) : (
                <div className="w-40 h-40 border rounded-lg bg-gray-100 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground text-center p-4">
                    لم يتم إنشاء رمز QR بعد
                  </p>
                </div>
              )}
              <div className="text-center">
                <p className="text-sm text-muted-foreground">الرمز اليدوي</p>
                <p className="text-2xl font-mono font-bold text-primary tracking-widest">
                  {worker.manualCode || worker.code}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs Section */}
        <Tabs defaultValue="attendance" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="attendance" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              الحضور
            </TabsTrigger>
            <TabsTrigger value="finance" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              المالية
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              المستندات
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attendance" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>سجل الحضور</CardTitle>
                <CardDescription>آخر 30 يوم من سجلات الحضور والانصراف</CardDescription>
              </CardHeader>
              <CardContent>
                {attendanceLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : attendance && attendance.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">وقت الحضور</TableHead>
                        <TableHead className="text-right">وقت الانصراف</TableHead>
                        <TableHead className="text-right">ساعات العمل</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedAttendance && Object.entries(groupedAttendance).map(([date, events]) => {
                        const checkInTime = events.checkIn ? new Date(events.checkIn.eventTime) : null;
                        const checkOutTime = events.checkOut ? new Date(events.checkOut.eventTime) : null;
                        let hoursWorked = '-';
                        
                        if (checkInTime && checkOutTime) {
                          const diff = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
                          hoursWorked = diff.toFixed(1) + ' ساعة';
                        }
                        
                        return (
                          <TableRow key={date}>
                            <TableCell className="font-medium">{date}</TableCell>
                            <TableCell>
                              {checkInTime ? (
                                <span className="text-green-600">{formatTime(checkInTime)}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {checkOutTime ? (
                                <span className="text-orange-600">{formatTime(checkOutTime)}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>{hoursWorked}</TableCell>
                            <TableCell>
                              {checkInTime && checkOutTime ? (
                                <Badge className="bg-green-100 text-green-800">مكتمل</Badge>
                              ) : checkInTime ? (
                                <Badge className="bg-yellow-100 text-yellow-800">حاضر</Badge>
                              ) : (
                                <Badge variant="outline">غائب</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>لا توجد سجلات حضور بعد</p>
                    <p className="text-sm">ستظهر سجلات الحضور هنا عند تسجيلها</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="finance" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>الملخص المالي</CardTitle>
                <CardDescription>المستحقات والخصومات والمدفوعات</CardDescription>
              </CardHeader>
              <CardContent>
                {financeLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-4 mb-6">
                      <Card className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800">
                        <CardContent className="pt-4 text-center">
                          <p className="text-sm text-green-600 dark:text-green-400">المستحقات</p>
                          <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                            {financeSummary?.totalEarnings?.toFixed(2) || '0.00'} ريال
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800">
                        <CardContent className="pt-4 text-center">
                          <p className="text-sm text-red-600 dark:text-red-400">الخصومات</p>
                          <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                            {financeSummary?.totalDeductions?.toFixed(2) || '0.00'} ريال
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800">
                        <CardContent className="pt-4 text-center">
                          <p className="text-sm text-purple-600 dark:text-purple-400">المكافآت</p>
                          <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                            {financeSummary?.totalBonuses?.toFixed(2) || '0.00'} ريال
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
                        <CardContent className="pt-4 text-center">
                          <p className="text-sm text-blue-600 dark:text-blue-400">الصافي</p>
                          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                            {financeSummary?.netAmount?.toFixed(2) || '0.00'} ريال
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                    
                    <div className="mb-4">
                      <p className="text-sm text-muted-foreground">
                        إجمالي أيام العمل: <span className="font-semibold">{financeSummary?.daysWorked || 0} يوم</span>
                      </p>
                    </div>

                    {payOverrides && payOverrides.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">التاريخ</TableHead>
                            <TableHead className="text-right">النوع</TableHead>
                            <TableHead className="text-right">المبلغ</TableHead>
                            <TableHead className="text-right">الوصف</TableHead>
                            <TableHead className="text-right">الحالة</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payOverrides.map((override) => (
                            <TableRow key={override.id}>
                              <TableCell className="font-medium">
                                {override.overrideDate ? formatDate(override.overrideDate) : '-'}
                              </TableCell>
                              <TableCell>{getOverrideTypeBadge(override.overrideType)}</TableCell>
                              <TableCell className={override.overrideType === 'bonus' ? 'text-green-600' : 'text-red-600'}>
                                {override.overrideType === 'bonus' ? '+' : '-'}{override.amount} ريال
                              </TableCell>
                              <TableCell>{override.reason || '-'}</TableCell>
                              <TableCell>
                                {override.status === 'approved' ? (
                                  <Badge className="bg-green-100 text-green-800">معتمد</Badge>
                                ) : override.status === 'rejected' ? (
                                  <Badge className="bg-red-100 text-red-800">مرفوض</Badge>
                                ) : (
                                  <Badge className="bg-yellow-100 text-yellow-800">قيد المراجعة</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Wallet className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>لا توجد معاملات مالية بعد</p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>المستندات</CardTitle>
                <CardDescription>الوثائق والمستندات المرفقة</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>لا توجد مستندات مرفقة</p>
                  <p className="text-sm">يمكنك إضافة مستندات مثل صورة الهوية أو العقد</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
