import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Upload, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface ExcelImportExportDialogProps {
  type: 'groups' | 'workers';
  onImportSuccess?: () => void;
}

export function ExcelImportExportDialog({
  type,
  onImportSuccess,
}: ExcelImportExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResults, setImportResults] = useState<any>(null);
  const toast = (options: any) => {
    console.log(options);
    // TODO: Implement toast notification
  };

  const utils = trpc.useUtils();

  // Import mutations
  const importGroupsMutation = trpc.excelImportExport.importGroups.useMutation();
  const importWorkersMutation = trpc.excelImportExport.importWorkers.useMutation();

  // Export queries
  const exportGroupsQuery = trpc.excelImportExport.exportGroups.useQuery(
    undefined,
    { enabled: false }
  );
  const exportWorkersQuery = trpc.excelImportExport.exportWorkers.useQuery(
    undefined,
    { enabled: false }
  );

  // Template queries
  const groupsTemplateQuery = trpc.excelImportExport.downloadGroupsTemplate.useQuery(
    undefined,
    { enabled: false }
  );
  const workersTemplateQuery = trpc.excelImportExport.downloadWorkersTemplate.useQuery(
    undefined,
    { enabled: false }
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
        toast({
          title: 'خطأ',
          description: 'يرجى اختيار ملف Excel (.xlsx أو .xls)',
          variant: 'destructive',
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast({
        title: 'خطأ',
        description: 'يرجى اختيار ملف Excel',
        variant: 'destructive',
      });
      return;
    }

    setImporting(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string)?.split(',')[1];
        if (!base64) {
        toast({
          title: 'خطأ',
          description: 'فشل قراءة الملف',
          variant: 'destructive',
        });
          setImporting(false);
          return;
        }

        try {
          let result;
          if (type === 'groups') {
            result = await importGroupsMutation.mutateAsync({ fileData: base64 });
          } else {
            result = await importWorkersMutation.mutateAsync({ fileData: base64 });
          }

          setImportResults(result);

          if (result.failed === 0) {
            toast({
              title: 'نجح الاستيراد',
              description: `تم استيراد ${result.imported} ${type === 'groups' ? 'مجموعة' : 'عامل'} بنجاح`,
            });
            setFile(null);
            onImportSuccess?.();
            utils.groups.listWithPagination.invalidate();
            utils.workers.listWithPagination.invalidate();
          } else {
            toast({
              title: 'استيراد جزئي',
              description: `تم استيراد ${result.imported} و فشل ${result.failed}`,
              variant: 'destructive',
            });
          }
        } catch (error: any) {
        toast({
          title: 'خطأ الاستيراد',
          description: error.message || 'فشل استيراد الملف',
          variant: 'destructive',
        });
        } finally {
          setImporting(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast({
        title: 'خطأ',
        description: error.message || 'حدث خطأ أثناء الاستيراد',
        variant: 'destructive',
      });
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const result =
        type === 'groups'
          ? await groupsTemplateQuery.refetch()
          : await workersTemplateQuery.refetch();

      if (result.data?.data) {
        const link = document.createElement('a');
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data.data}`;
        link.download = result.data.filename;
        link.click();

        toast({
          title: 'تم التحميل',
          description: 'تم تحميل القالب بنجاح',
        });
      }
    } catch (error: any) {
        toast({
          title: 'خطأ التحميل',
          description: error.message || 'فشل تحميل القالب',
          variant: 'destructive',
        });
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const result =
        type === 'groups'
          ? await exportGroupsQuery.refetch()
          : await exportWorkersQuery.refetch();

      if (result.data?.data) {
        const link = document.createElement('a');
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data.data}`;
        link.download = result.data.filename;
        link.click();

        toast({
          title: 'تم التصدير',
          description: `تم تصدير البيانات بنجاح`,
        });
      }
    } catch (error: any) {
        toast({
          title: 'خطأ التصدير',
          description: error.message || 'فشل تصدير البيانات',
          variant: 'destructive',
        });
    } finally {
      setExporting(false);
    }
  };

  const typeLabel = type === 'groups' ? 'المجموعات' : 'العمال';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="w-4 h-4" />
          استيراد/تصدير Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>استيراد وتصدير {typeLabel}</DialogTitle>
          <DialogDescription>
            قم باستيراد أو تصدير بيانات {typeLabel} من/إلى ملفات Excel
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="import" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="import">
              <Upload className="w-4 h-4 mr-2" />
              استيراد
            </TabsTrigger>
            <TabsTrigger value="export">
              <Download className="w-4 h-4 mr-2" />
              تصدير
            </TabsTrigger>
          </TabsList>

          {/* Import Tab */}
          <TabsContent value="import" className="space-y-4">
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  💡 <strong>نصيحة:</strong> قم بتحميل قالب Excel أولاً لمعرفة تنسيق البيانات المطلوب
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">اختر ملف Excel</label>
                <Input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  disabled={importing}
                />
                {file && (
                  <p className="text-sm text-gray-600">
                    ✓ تم اختيار: {file.name}
                  </p>
                )}
              </div>

              {importResults && (
                <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    {importResults.failed === 0 ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-yellow-600" />
                    )}
                    <span className="font-medium">
                      تم استيراد {importResults.imported} و فشل {importResults.failed}
                    </span>
                  </div>

                  {importResults.results?.map((result: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      {result.success ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600" />
                      )}
                      <span>
                        {result.name} {result.error && `- ${result.error}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleDownloadTemplate}
                  disabled={importing}
                >
                  <Download className="w-4 h-4 mr-2" />
                  تحميل القالب
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!file || importing}
                  className="flex-1"
                >
                  {importing ? 'جاري الاستيراد...' : 'استيراد الآن'}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Export Tab */}
          <TabsContent value="export" className="space-y-4">
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800">
                  📊 <strong>ملاحظة:</strong> سيتم تصدير جميع {typeLabel} الموجودة في النظام
                </p>
              </div>

              <p className="text-sm text-gray-600">
                انقر على الزر أدناه لتحميل ملف Excel يحتوي على جميع بيانات {typeLabel}
              </p>

              <Button
                onClick={handleExport}
                disabled={exporting}
                className="w-full"
              >
                {exporting ? 'جاري التصدير...' : `تصدير ${typeLabel} إلى Excel`}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
