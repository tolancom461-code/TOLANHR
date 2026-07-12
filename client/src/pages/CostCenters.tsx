import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { 
  Building2,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Search
} from 'lucide-react';
import { toast } from 'sonner';

export default function CostCenters() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedCostCenter, setSelectedCostCenter] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  
  const { data: costCenters, refetch } = trpc.costCenters.list.useQuery();
  
  const createMutation = trpc.costCenters.create.useMutation({
    onSuccess: () => {
      toast.success('تم إضافة مركز التكلفة بنجاح');
      refetch();
      setShowCreateDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ');
    }
  });
  
  const updateMutation = trpc.costCenters.update.useMutation({
    onSuccess: () => {
      toast.success('تم تحديث مركز التكلفة بنجاح');
      refetch();
      setShowEditDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ');
    }
  });
  
  const deleteMutation = trpc.costCenters.delete.useMutation({
    onSuccess: () => {
      toast.success('تم حذف مركز التكلفة بنجاح');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ');
    }
  });
  
  const resetForm = () => {
    setCode('');
    setName('');
    setDescription('');
    setSelectedCostCenter(null);
  };
  
  const handleCreate = () => {
    if (!code || !name) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    createMutation.mutate({ code, name, description });
  };
  
  const handleEdit = (costCenter: any) => {
    setSelectedCostCenter(costCenter);
    setCode(costCenter.code);
    setName(costCenter.name);
    setDescription(costCenter.description || '');
    setShowEditDialog(true);
  };
  
  const handleUpdate = () => {
    if (!selectedCostCenter || !code || !name) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    updateMutation.mutate({
      id: selectedCostCenter.id,
      code,
      name,
      description,
    });
  };
  
  const handleDelete = (id: number, name: string) => {
    if (confirm(`هل أنت متأكد من حذف مركز التكلفة "${name}"؟`)) {
      deleteMutation.mutate({ id });
    }
  };
  
  // Filter cost centers
  const filteredCostCenters = costCenters?.filter((cc) =>
    cc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cc.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              مراكز التكلفة
            </h1>
            <p className="text-muted-foreground">
              إدارة مراكز التكلفة في النظام
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 ml-2" />
            إضافة مركز تكلفة
          </Button>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="البحث عن مركز تكلفة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-md"
              />
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Cost Centers Table */}
        <Card>
          <CardHeader>
            <CardTitle>قائمة مراكز التكلفة</CardTitle>
            <CardDescription>
              {filteredCostCenters?.length || 0} مركز تكلفة
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!filteredCostCenters?.length ? (
              <div className="text-center py-8">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
                <p className="mt-2 text-muted-foreground">لا توجد مراكز تكلفة</p>
                <Button variant="outline" className="mt-4" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة أول مركز تكلفة
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الرمز</TableHead>
                      <TableHead className="text-right">الاسم</TableHead>
                      <TableHead className="text-right">الوصف</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCostCenters.map((cc) => (
                      <TableRow key={cc.id}>
                        <TableCell className="font-mono font-medium">{cc.code}</TableCell>
                        <TableCell className="font-medium">{cc.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {cc.description || '-'}
                        </TableCell>
                        <TableCell>
                          {cc.isActive ? (
                            <Badge className="bg-green-100 text-green-800">نشط</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-800">غير نشط</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(cc)}
                            >
                              <Pencil className="h-4 w-4 ml-1" />
                              تعديل
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(cc.id, cc.name)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 ml-1" />
                              حذف
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة مركز تكلفة جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>الرمز *</Label>
              <Input
                placeholder="مثال: CC001"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>الاسم *</Label>
              <Input
                placeholder="مثال: قسم المبيعات"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>الوصف</Label>
              <Textarea
                placeholder="وصف مركز التكلفة..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Plus className="h-4 w-4 ml-2" />
              )}
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل مركز التكلفة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>الرمز *</Label>
              <Input
                placeholder="مثال: CC001"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>الاسم *</Label>
              <Input
                placeholder="مثال: قسم المبيعات"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>الوصف</Label>
              <Textarea
                placeholder="وصف مركز التكلفة..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Pencil className="h-4 w-4 ml-2" />
              )}
              تحديث
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
