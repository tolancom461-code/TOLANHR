import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Printer, Download, User } from "lucide-react";

export default function WorkerCard() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const workerId = params.id ? parseInt(params.id) : 0;
  
  const { data: worker, isLoading } = trpc.workers.getById.useQuery(
    { id: workerId },
    { enabled: workerId > 0 }
  );

  const handlePrint = () => {
    window.print();
  };

  const generateQRCodeUrl = (token: string) => {
    // Using QR Code API
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(token)}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">العامل غير موجود</p>
          <Button onClick={() => setLocation("/workers")}>
            <ArrowRight className="ml-2 h-4 w-4" />
            العودة للعمال
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4" dir="rtl">
      {/* Print Controls - Hidden when printing */}
      <div className="print:hidden mb-6 flex items-center justify-between max-w-md mx-auto">
        <Button variant="outline" onClick={() => setLocation("/workers")}>
          <ArrowRight className="ml-2 h-4 w-4" />
          العودة
        </Button>
        <div className="flex gap-2">
          <Button onClick={handlePrint}>
            <Printer className="ml-2 h-4 w-4" />
            طباعة
          </Button>
        </div>
      </div>

      {/* Worker Card - Printable */}
      <div className="max-w-md mx-auto">
        <Card className="overflow-hidden shadow-xl print:shadow-none">
          {/* Header */}
          <div className="bg-gradient-to-l from-primary to-primary/80 text-primary-foreground p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">TolanWorkforce</h1>
                <p className="text-sm opacity-90">بطاقة تعريف العامل</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                <User className="h-6 w-6" />
              </div>
            </div>
          </div>

          <CardContent className="p-6">
            {/* Worker Photo & Info */}
            <div className="flex gap-6 mb-6">
              {/* Photo */}
              <div className="flex-shrink-0">
                {worker.photoUrl ? (
                  <img
                    src={worker.photoUrl}
                    alt={worker.fullName}
                    className="w-24 h-24 rounded-lg object-cover border-2 border-gray-200"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-lg bg-gray-200 flex items-center justify-center border-2 border-gray-300">
                    <User className="h-12 w-12 text-gray-400" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 space-y-2">
                <div>
                  <p className="text-sm text-muted-foreground">الاسم الكامل</p>
                  <p className="text-lg font-bold">{worker.fullName}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">الكود</p>
                    <p className="font-semibold text-primary">{worker.code}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">رقم الهوية</p>
                    <p className="font-medium">{worker.nationalId || "-"}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* QR Code Section */}
            <div className="border-t pt-6">
              <div className="flex items-center justify-between">
                {/* QR Code */}
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">رمز QR للحضور</p>
                  {worker.qrToken ? (
                    <img
                      src={generateQRCodeUrl(worker.qrToken)}
                      alt="QR Code"
                      className="w-32 h-32 mx-auto border rounded-lg"
                    />
                  ) : (
                    <div className="w-32 h-32 mx-auto border rounded-lg bg-gray-100 flex items-center justify-center">
                      <p className="text-xs text-muted-foreground">لا يوجد رمز</p>
                    </div>
                  )}
                </div>

                {/* Manual Code */}
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">الرمز اليدوي</p>
                  <div className="bg-gray-100 rounded-lg p-4 border-2 border-dashed border-gray-300">
                    <p className="text-3xl font-mono font-bold tracking-widest text-primary">
                      {worker.manualCode || worker.code}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    استخدم هذا الرمز في حالة عدم عمل QR
                  </p>
                </div>
              </div>
            </div>

            {/* Footer Info */}
            <div className="border-t mt-6 pt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">المجموعة</p>
                <p className="font-medium">{worker.groupId ? `مجموعة ${worker.groupId}` : "غير محدد"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">الحالة</p>
                <p className={`font-medium ${worker.status === 'active' ? 'text-green-600' : 'text-gray-500'}`}>
                  {worker.status === 'active' ? 'نشط' : worker.status === 'archived' ? 'مؤرشف' : 'معلق'}
                </p>
              </div>
            </div>
          </CardContent>

          {/* Card Footer */}
          <div className="bg-gray-50 px-6 py-3 text-center text-xs text-muted-foreground border-t">
            <p>هذه البطاقة ملك لشركة TolanWorkforce - يرجى إعادتها في حالة العثور عليها</p>
          </div>
        </Card>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}
