import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  HardDrive,
  Download,
  Upload,
  Database,
} from "lucide-react";
import { toast } from "sonner";

function downloadBase64File(base64: string, filename: string, mimeType: string) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Backup() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: backupHistory, refetch: refetchHistory } = trpc.backup.getHistory.useQuery();

  // Mutations
  const exportSqlMutation = trpc.backup.exportSql.useMutation({
    onSuccess: (data) => {
      if (data.base64 && data.filename) {
        downloadBase64File(data.base64, data.filename, "application/sql");
        toast.success("تم إنشاء النسخة الاحتياطية بنجاح", {
          description: data.filename,
        });
        refetchHistory();
      }
    },
    onError: (err) => {
      toast.error("خطأ في إنشاء النسخة", { description: err.message });
    },
  });

  const handleCreateBackup = () => {
    exportSqlMutation.mutate();
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.sql')) {
      toast.error("يرجى اختيار ملف SQL صالح");
      return;
    }

    toast.info("ميزة الاستعادة قيد التطوير", {
      description: "سيتم إضافة هذه الميزة قريباً",
    });
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatDate = (date: any) => {
    if (!date) return "-";
    const d = new Date(date);
    return d.toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <HardDrive className="h-7 w-7 text-teal-600" />
        <div>
          <h1 className="text-2xl font-bold">النسخ الاحتياطي</h1>
          <p className="text-sm text-muted-foreground">
            إنشاء واستعادة نسخ احتياطية لقاعدة البيانات
          </p>
        </div>
      </div>

      {/* بطاقتان: إنشاء نسخة + استعادة نسخة */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* بطاقة إنشاء نسخة احتياطية */}
        <Card className="border-2 hover:border-teal-200 transition-colors">
          <CardContent className="pt-8 pb-6 flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center">
              <Download className="h-8 w-8 text-teal-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">إنشاء نسخة احتياطية</h2>
              <p className="text-sm text-muted-foreground mt-1">
                حفظ نسخة من قاعدة البيانات الحالية
              </p>
            </div>
            <Button
              onClick={handleCreateBackup}
              disabled={exportSqlMutation.isPending}
              size="lg"
              className="w-full gap-2 bg-teal-600 hover:bg-teal-700 text-white"
            >
              <Download className="h-5 w-5" />
              {exportSqlMutation.isPending ? "جاري إنشاء النسخة..." : "إنشاء نسخة الآن"}
            </Button>
          </CardContent>
        </Card>

        {/* بطاقة استعادة نسخة احتياطية */}
        <Card className="border-2 hover:border-gray-300 transition-colors">
          <CardContent className="pt-8 pb-6 flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center">
              <Upload className="h-8 w-8 text-teal-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">استعادة نسخة احتياطية</h2>
              <p className="text-sm text-muted-foreground mt-1">
                استعادة قاعدة البيانات من نسخة سابقة
              </p>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept=".sql"
              onChange={handleFileSelected}
              className="hidden"
            />
            <Button
              onClick={handleRestoreClick}
              variant="outline"
              size="lg"
              className="w-full gap-2"
            >
              <Upload className="h-5 w-5" />
              استعادة نسخة
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* النسخ الاحتياطية السابقة */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">النسخ الاحتياطية السابقة</CardTitle>
        </CardHeader>
        <CardContent>
          {!backupHistory || backupHistory.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-base">لا توجد نسخ احتياطية سابقة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">#</TableHead>
                    <TableHead className="text-right">نوع النسخة</TableHead>
                    <TableHead className="text-right">التفاصيل</TableHead>
                    <TableHead className="text-right">بواسطة</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backupHistory.map((h: any, idx: number) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">{idx + 1}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-teal-300 text-teal-700">
                          {h.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {h.details?.type === "sql" ? "نسخة كاملة" : h.details?.type || "-"}
                      </TableCell>
                      <TableCell className="text-sm">{h.userName || "-"}</TableCell>
                      <TableCell className="text-sm">{formatDate(h.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
