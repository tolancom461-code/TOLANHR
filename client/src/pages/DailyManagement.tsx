import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Calendar, Clock, AlertTriangle, CheckCircle2, Edit2, Save } from "lucide-react";

interface AttendanceRecord {
  id: number;
  workerId: number;
  workerName: string;
  workerCode: string;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: "present" | "absent" | "late" | "early_leave" | "override";
  notes: string | null;
}

export default function DailyManagement() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    checkInTime: "",
    checkOutTime: "",
    status: "present" as const,
    notes: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  
  // Reset page when date changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate]);

  // Queries
  const { data: attendanceData, isLoading, refetch } = trpc.attendance.getDailyRecordsWithPagination.useQuery(
    { date: selectedDate, page: currentPage, limit: pageSize },
    { enabled: !!selectedDate }
  );
  
  const attendanceRecords = attendanceData?.data || [];
  const totalPages = attendanceData?.totalPages || 1;
  const total = attendanceData?.total || 0;

  // Mutations
  const updateRecordMutation = trpc.attendance.updateDailyRecord.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث السجل بنجاح");
      setIsEditDialogOpen(false);
      setEditingRecord(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`فشل التحديث: ${error.message}`);
    },
  });

  const filteredRecords = attendanceRecords.filter(record =>
    record.workerName.includes(searchQuery) || record.workerCode.includes(searchQuery)
  );

  const handleEditClick = (record: AttendanceRecord) => {
    setEditingRecord(record);
    setEditFormData({
      checkInTime: record.checkInTime || "",
      checkOutTime: record.checkOutTime || "",
      status: "present",
      notes: record.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingRecord) return;

    updateRecordMutation.mutate({
      recordId: editingRecord.id,
      checkInTime: editFormData.checkInTime || null,
      checkOutTime: editFormData.checkOutTime || null,
      status: editFormData.status,
      notes: editFormData.notes || null,
    });
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      present: { label: "حاضر", color: "bg-green-500" },
      absent: { label: "غائب", color: "bg-red-500" },
      late: { label: "متأخر", color: "bg-yellow-500" },
      early_leave: { label: "خروج مبكر", color: "bg-orange-500" },
      override: { label: "استثناء", color: "bg-blue-500" },
    };
    const info = statusMap[status] || { label: status, color: "bg-gray-500" };
    return <Badge className={`${info.color} text-white`}>{info.label}</Badge>;
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Calendar className="h-8 w-8 text-blue-500" />
            إدارة الحضور اليومي
          </h1>
          <p className="text-muted-foreground mt-2">
            تعديل وتصحيح سجلات الحضور اليومية
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/attendance/log")}>
          العودة
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>الفلاتر</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Date Filter */}
            <div className="space-y-2">
              <Label htmlFor="date">التاريخ</Label>
              <Input
                id="date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>

            {/* Search Filter */}
            <div className="space-y-2">
              <Label htmlFor="search">البحث عن عامل</Label>
              <Input
                id="search"
                placeholder="ابحث بالاسم أو الكود..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Alert */}
      <Alert>
        <Clock className="h-4 w-4" />
        <AlertDescription>
          يمكنك تعديل سجلات الحضور لتصحيح أي أخطاء أو تطبيق الاستثناءات المرتبطة بالبلاغات التشغيلية
        </AlertDescription>
      </Alert>

      {/* Records Table */}
      <Card>
        <CardHeader>
          <CardTitle>سجلات الحضور</CardTitle>
          <CardDescription>
            {filteredRecords.length} سجل للتاريخ {new Date(selectedDate).toLocaleDateString('ar-SA')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد سجلات حضور لهذا التاريخ
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">الكود</TableHead>
                    <TableHead className="text-center">الاسم</TableHead>
                    <TableHead className="text-center">وقت الدخول</TableHead>
                    <TableHead className="text-center">وقت الخروج</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-center">ملاحظات</TableHead>
                    <TableHead className="text-center">الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="text-center font-mono text-sm">
                        {record.workerCode}
                      </TableCell>
                      <TableCell className="text-center">
                        <div>
                          <div className="font-medium">{record.workerName}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {record.checkInTime || "-"}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {record.checkOutTime || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(record.status)}
                      </TableCell>
                      <TableCell className="text-center text-sm max-w-xs">
                        <div className="truncate" title={record.notes || ""}>
                          {record.notes || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditClick(record)}
                          className="gap-2"
                        >
                          <Edit2 className="h-4 w-4" />
                          تعديل
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t">
            <div className="text-sm text-muted-foreground">
              عرض {((currentPage - 1) * pageSize) + 1} إلى {Math.min(currentPage * pageSize, total)} من {total} سجل
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                السابق
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                التالي
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل سجل الحضور</DialogTitle>
            <DialogDescription>
              {editingRecord && `${editingRecord.workerName} - ${editingRecord.workerCode}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Check In Time */}
            <div className="space-y-2">
              <Label htmlFor="checkInTime">وقت الدخول</Label>
              <Input
                id="checkInTime"
                type="time"
                value={editFormData.checkInTime}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, checkInTime: e.target.value })
                }
              />
            </div>

            {/* Check Out Time */}
            <div className="space-y-2">
              <Label htmlFor="checkOutTime">وقت الخروج</Label>
              <Input
                id="checkOutTime"
                type="time"
                value={editFormData.checkOutTime}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, checkOutTime: e.target.value })
                }
              />
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status">الحالة</Label>
              <Select
                value={editFormData.status}
                onValueChange={(value) =>
                  setEditFormData({
                    ...editFormData,
                    status: value as any,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">حاضر</SelectItem>
                  <SelectItem value="absent">غائب</SelectItem>
                  <SelectItem value="late">متأخر</SelectItem>
                  <SelectItem value="early_leave">خروج مبكر</SelectItem>
                  <SelectItem value="override">استثناء</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات</Label>
              <Input
                id="notes"
                placeholder="أضف ملاحظات..."
                value={editFormData.notes}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, notes: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateRecordMutation.isPending}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              حفظ التغييرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
