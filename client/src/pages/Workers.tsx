import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { PERMISSIONS } from "../../../shared/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, UserCircle, QrCode, Eye, Filter, RefreshCw, FileSpreadsheet, Printer, Download } from "lucide-react";
import { ExcelImportExportDialog } from "@/components/ExcelImportExportDialog";
import { exportToExcel, printPage } from '@/lib/exportUtils';
import { memo, useCallback, useMemo } from 'react';
import WorkerRow from '@/components/WorkerRow';

export default function Workers() {
  const hasPermission = () => true; // All users have full permissions
  const [searchQuery, setSearchQuery] = useState("");
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  // Reset page when search query or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterGroup, filterStatus]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isQRDialogOpen, setIsQRDialogOpen] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    code: "",
    fullName: "",
    nationalId: "",
    phone: "",
    groupId: null as number | null,
    jobId: null as number | null,
    photoUrl: "",
    hireDate: "",
    status: "active" as "active" | "inactive" | "archived",
  });

  const utils = trpc.useUtils();
  const groupId = filterGroup !== "all" ? parseInt(filterGroup) : undefined;
  const { data: workersData, isLoading } = trpc.workers.listWithPagination.useQuery({
    page: currentPage,
    limit: pageSize,
    groupId,
    searchQuery: searchQuery || undefined,
  });
  // Get all groups (Workers page doesn't filter by cost center)
  const { data: groups } = trpc.groups.list.useQuery();
  
  const workers = workersData?.data || [];
  const totalPages = workersData?.totalPages || 1;

  const createMutation = trpc.workers.create.useMutation({
    onSuccess: (data) => {
      toast.success("تم إضافة العامل بنجاح");
      setIsAddDialogOpen(false);
      resetForm();
      utils.workers.listWithPagination.invalidate();
      utils.workers.list.invalidate();
      utils.dashboard.stats.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "حدث خطأ أثناء إضافة العامل");
    },
  });

  const updateMutation = trpc.workers.update.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث بيانات العامل بنجاح");
      setIsEditDialogOpen(false);
      setSelectedWorker(null);
      resetForm();
      utils.workers.listWithPagination.invalidate();
      utils.workers.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "حدث خطأ أثناء تحديث بيانات العامل");
    },
  });

  const deleteMutation = trpc.workers.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف العامل بنجاح");
      utils.workers.listWithPagination.invalidate();
      utils.workers.list.invalidate();
      utils.dashboard.stats.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "حدث خطأ أثناء حذف العامل");
    },
  });

  const regenerateQRMutation = trpc.workers.regenerateQR.useMutation({
    onSuccess: (data) => {
      toast.success("تم تجديد رمز QR بنجاح");
      if (selectedWorker) {
        setSelectedWorker({ ...selectedWorker, qrToken: data.qrToken });
      }
      utils.workers.listWithPagination.invalidate();
      utils.workers.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "حدث خطأ أثناء تجديد رمز QR");
    },
  });

  const exportWorkerQRMutation = trpc.workers.exportWorkerQRCode.useMutation({
    onSuccess: (data) => {
      // Convert base64 to blob and download
      const byteCharacters = atob(data.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("تم تصدير QR Code بنجاح");
    },
    onError: (error) => {
      toast.error(error.message || "حدث خطأ أثناء التصدير");
    },
  });

  const resetForm = () => {
    setFormData({
      code: "",
      fullName: "",
      nationalId: "",
      phone: "",
      groupId: null,
      jobId: null,
      photoUrl: "",
      hireDate: "",
      status: "active",
    });
  };

  const handleEdit = (worker: any) => {
    setSelectedWorker(worker);
    setFormData({
      code: worker.code,
      fullName: worker.fullName,
      nationalId: worker.nationalId || "",
      phone: worker.phone || "",
      groupId: worker.groupId,
      jobId: worker.jobId,
      photoUrl: worker.photoUrl || "",
      hireDate: worker.hireDate ? new Date(worker.hireDate).toLocaleDateString('en-CA') : "",
      status: worker.status || "active",
    });
    setIsEditDialogOpen(true);
  };

  const handleView = (worker: any) => {
    setSelectedWorker(worker);
    setIsViewDialogOpen(true);
  };

  const handleShowQR = (worker: any) => {
    setSelectedWorker(worker);
    setIsQRDialogOpen(true);
  };

  const handleExportWorkerQR = (workerId: number) => {
    exportWorkerQRMutation.mutate({ workerId });
  };

  const handleSubmit = () => {
    if (selectedWorker) {
      updateMutation.mutate({
        id: selectedWorker.id,
        ...formData,
        groupId: formData.groupId || undefined,
        jobId: formData.jobId || undefined,
      });
    } else {
      createMutation.mutate({
        ...formData,
        groupId: formData.groupId || undefined,
        jobId: formData.jobId || undefined,
      });
    }
  };

  const getGroupName = (id: number | null) => {
    if (!id) return "-";
    const group = groups?.find((g) => g.id === id);
    return group?.name || "-";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500">نشط</Badge>;
      case "inactive":
        return <Badge variant="secondary">غير نشط</Badge>;
      case "archived":
        return <Badge variant="outline">مؤرشف</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Filter by status only (search and group are handled server-side)
  const filteredWorkers = workers?.filter((worker) => {
    const matchesStatus = filterStatus === "all" || worker.status === filterStatus;
    return matchesStatus;
  });

  // Export handlers
  const handleExportToExcel = () => {
    if (!filteredWorkers || filteredWorkers.length === 0) {
      toast.error('لا توجد بيانات للتصدير');
      return;
    }

    const exportData = filteredWorkers.map(worker => {
      const groupName = groups?.find(g => g.id === worker.groupId)?.name || '-';
      return {
        'كود العامل': worker.code,
        'الاسم الكامل': worker.fullName,
        'رقم الهوية': worker.nationalId || '-',
        'رقم الجوال': worker.phone || '-',
        'المجموعة': groupName,
        'تاريخ التوظيف': worker.hireDate ? new Date(worker.hireDate).toLocaleDateString('ar-SA') : '-',
        'الحالة': worker.status === 'active' ? 'نشط' : worker.status === 'inactive' ? 'غير نشط' : 'مؤرشف',
      };
    });

    const timestamp = new Date().toLocaleDateString('en-CA');
    exportToExcel(exportData, `قائمة_العمال_${timestamp}`, 'العمال');
    toast.success('تم تصدير القائمة بنجاح');
  };

  const handlePrint = () => {
    printPage('workers-list-content');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" id="workers-list-content">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">إدارة العمال</h1>
            <p className="text-muted-foreground">إدارة بيانات العمال ومعلوماتهم</p>
          </div>
          <div className="flex gap-2">
            {hasPermission() && (
              <Button variant="outline" size="sm" onClick={handleExportToExcel}>
                <FileSpreadsheet className="h-4 w-4 ml-2" />
                تصدير Excel
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 ml-2" />
              طباعة
            </Button>
            <ExcelImportExportDialog type="workers" onImportSuccess={() => {
              utils.workers.listWithPagination.invalidate();
              utils.workers.list.invalidate();
            }} />
            {hasPermission() && (
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => { resetForm(); setSelectedWorker(null); }}>
                    <Plus className="ml-2 h-4 w-4" />
                    إضافة عامل
                  </Button>
                </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]" dir="rtl">
              <DialogHeader>
                <DialogTitle>إضافة عامل جديد</DialogTitle>
                <DialogDescription>أدخل بيانات العامل الجديد</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">كود العامل</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      placeholder="WRK001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">الاسم الكامل</Label>
                    <Input
                      id="fullName"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="محمد أحمد"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nationalId">رقم الهوية</Label>
                    <Input
                      id="nationalId"
                      value={formData.nationalId}
                      onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                      placeholder="1234567890"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">رقم الجوال</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="05xxxxxxxx"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>المجموعة</Label>
                    <Select
                      value={formData.groupId?.toString() || ""}
                      onValueChange={(value) => setFormData({ ...formData, groupId: value ? parseInt(value) : null })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر المجموعة" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups?.map((group) => (
                          <SelectItem key={group.id} value={group.id.toString()}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hireDate">تاريخ التعيين</Label>
                    <Input
                      id="hireDate"
                      type="date"
                      value={formData.hireDate}
                      onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>الحالة</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value: "active" | "inactive" | "archived") => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">نشط</SelectItem>
                        <SelectItem value="inactive">غير نشط</SelectItem>
                        <SelectItem value="archived">مؤرشف</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="photoUrl">رابط الصورة</Label>
                  <Input
                    id="photoUrl"
                    value={formData.photoUrl}
                    onChange={(e) => setFormData({ ...formData, photoUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  إلغاء
                </Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "جاري الحفظ..." : "حفظ"}
                </Button>
              </DialogFooter>
            </DialogContent>
            </Dialog>
            )}
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="البحث عن عامل بالاسم أو الكود أو الهوية..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10"
                />
              </div>
              <div className="flex gap-2">
                <Select value={filterGroup} onValueChange={setFilterGroup}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="ml-2 h-4 w-4" />
                    <SelectValue placeholder="المجموعة" />
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
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الحالات</SelectItem>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="inactive">غير نشط</SelectItem>
                    <SelectItem value="archived">مؤرشف</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Workers Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="h-5 w-5" />
              قائمة العمال
            </CardTitle>
            <CardDescription>
              {filteredWorkers?.length || 0} عامل
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">العامل</TableHead>
                    <TableHead className="text-right">الكود</TableHead>
                    <TableHead className="text-right">رقم الهوية</TableHead>
                    <TableHead className="text-right">المجموعة</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWorkers?.map((worker) => (
                    <WorkerRow
                      key={worker.id}
                      worker={worker}
                      onView={handleView}
                      onShowQR={handleShowQR}
                      onExportQR={handleExportWorkerQR}
                      onEdit={handleEdit}
                      hasPermission={hasPermission()}
                      getInitials={getInitials}
                      getGroupName={getGroupName}
                      getStatusBadge={getStatusBadge}
                    />
                  ))}
                  {filteredWorkers?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        لا يوجد عمال
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[600px]" dir="rtl">
            <DialogHeader>
              <DialogTitle>تعديل بيانات العامل</DialogTitle>
              <DialogDescription>تعديل بيانات العامل</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-code">كود العامل</Label>
                  <Input
                    id="edit-code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-fullName">الاسم الكامل</Label>
                  <Input
                    id="edit-fullName"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-nationalId">رقم الهوية</Label>
                  <Input
                    id="edit-nationalId"
                    value={formData.nationalId}
                    onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">رقم الجوال</Label>
                  <Input
                    id="edit-phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>المجموعة</Label>
                  <Select
                    value={formData.groupId?.toString() || ""}
                    onValueChange={(value) => setFormData({ ...formData, groupId: value ? parseInt(value) : null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر المجموعة" />
                    </SelectTrigger>
                    <SelectContent>
                      {groups?.map((group) => (
                        <SelectItem key={group.id} value={group.id.toString()}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>الحالة</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: "active" | "inactive" | "archived") => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="inactive">غير نشط</SelectItem>
                    <SelectItem value="archived">مؤرشف</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="sm:max-w-[500px]" dir="rtl">
            <DialogHeader>
              <DialogTitle>تفاصيل العامل</DialogTitle>
            </DialogHeader>
            {selectedWorker && (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={selectedWorker.photoUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                      {getInitials(selectedWorker.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-xl font-bold">{selectedWorker.fullName}</h3>
                    <p className="text-muted-foreground font-mono">{selectedWorker.code}</p>
                    {getStatusBadge(selectedWorker.status || "active")}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground">رقم الهوية</p>
                    <p className="font-medium">{selectedWorker.nationalId || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">رقم الجوال</p>
                    <p className="font-medium">{selectedWorker.phone || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">المجموعة</p>
                    <p className="font-medium">{getGroupName(selectedWorker.groupId)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">تاريخ التعيين</p>
                    <p className="font-medium">
                      {selectedWorker.hireDate 
                        ? new Date(selectedWorker.hireDate).toLocaleDateString('ar-SA')
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">آخر حضور</p>
                    <p className="font-medium">
                      {selectedWorker.lastAttendanceAt 
                        ? new Date(selectedWorker.lastAttendanceAt).toLocaleDateString('ar-SA')
                        : "-"}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                إغلاق
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* QR Code Dialog */}
        <Dialog open={isQRDialogOpen} onOpenChange={setIsQRDialogOpen}>
          <DialogContent className="sm:max-w-[400px]" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                رمز QR للعامل
              </DialogTitle>
            </DialogHeader>
            {selectedWorker && (
              <div className="space-y-4 text-center">
                <div className="p-4 bg-white rounded-lg inline-block mx-auto">
                  {/* QR Code placeholder - in production, use a QR library */}
                  <div className="w-48 h-48 bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300 rounded">
                    <div className="text-center">
                      <QrCode className="h-16 w-16 mx-auto text-gray-400" />
                      <p className="text-xs text-gray-500 mt-2 font-mono break-all px-2">
                        {selectedWorker.qrToken || "لا يوجد رمز"}
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="font-bold">{selectedWorker.fullName}</p>
                  <p className="text-sm text-muted-foreground font-mono">{selectedWorker.code}</p>
                </div>
                <div className="text-xs text-muted-foreground bg-muted p-2 rounded font-mono break-all">
                  {selectedWorker.qrToken || "لم يتم إنشاء رمز QR"}
                </div>
                <Button
                  variant="outline"
                  onClick={() => regenerateQRMutation.mutate({ id: selectedWorker.id })}
                  disabled={regenerateQRMutation.isPending}
                  className="w-full"
                >
                  <RefreshCw className={`ml-2 h-4 w-4 ${regenerateQRMutation.isPending ? 'animate-spin' : ''}`} />
                  تجديد رمز QR
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsQRDialogOpen(false)}>
                إغلاق
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 p-4 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">
              الصفحة {currentPage} من {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                السابقة
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                التالية
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
