import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus, Pencil, Trash2, Search, Shield } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

// تعريف الأدوار
const ROLES = [
  { value: 'guard', label: 'حارس', description: 'تسجيل الحضور والانصراف فقط', color: 'bg-gray-500' },
  { value: 'supervisor_tolan', label: 'مشرف تولان', description: 'العمليات التشغيلية - مراكز تكلفة تولان (CC001-CC005)', color: 'bg-blue-500' },
  { value: 'supervisor_malqa', label: 'مشرف الملقا', description: 'العمليات التشغيلية - مراكز تكلفة الملقا (CC006-CC010)', color: 'bg-cyan-500' },
  { value: 'admin_affairs', label: 'شؤون إدارية', description: 'كل الصلاحيات ما عدا لوحة الإدارة العليا', color: 'bg-emerald-500' },
  { value: 'accountant', label: 'محاسب مالي', description: 'اعتماد/رفض الدفعات من الشؤون الإدارية (المرحلة 1)', color: 'bg-teal-500' },
  { value: 'auditor', label: 'مراجع مالي', description: 'اعتماد/رفض الدفعات من المحاسب (المرحلة 2) - بدون حذف', color: 'bg-amber-500' },
  { value: 'finance_manager', label: 'مدير مالي', description: 'الاعتماد النهائي/رفض الدفعات من المراجع (المرحلة 3) - بدون حذف', color: 'bg-purple-500' },
  { value: 'executive', label: 'إدارة عليا', description: 'لوحات التحكم فقط (استعراض)', color: 'bg-indigo-500' },
  { value: 'restaurant_operations', label: 'تشغيل مطاعم', description: 'صلاحية صفحتي التشغيل وإدارة المطاعم فقط', color: 'bg-orange-500' },
  { value: 'super_admin', label: 'سوبر أدمن', description: 'جميع الصلاحيات بدون استثناء', color: 'bg-red-500' },
] as const;

function getRoleInfo(role: string) {
  return ROLES.find(r => r.value === role) || { value: role, label: role, description: '', color: 'bg-gray-400' };
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "destructive" | "outline" {
  switch (role) {
    case 'super_admin': return 'destructive';
    case 'admin_affairs':
    case 'accountant': return 'default';
    case 'auditor':
    case 'finance_manager':
    case 'executive': return 'outline';
    case 'supervisor_tolan':
    case 'supervisor_malqa':
    case 'restaurant_operations': return 'secondary';
    default: return 'secondary';
  }
}

export default function Users() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const utils = trpc.useUtils();
  const { data: users, isLoading } = trpc.users.list.useQuery();

  const createUser = (trpc.users as any).create.useMutation({
    onSuccess: () => {
      toast.success("تم إنشاء المستخدم بنجاح");
      utils.users.list.invalidate();
      setIsAddDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "حدث خطأ أثناء إنشاء المستخدم");
    },
  });

  const updateUser = trpc.users.update.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث المستخدم بنجاح");
      utils.users.list.invalidate();
      setIsEditDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "حدث خطأ أثناء تحديث المستخدم");
    },
  });

  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث الدور بنجاح");
      utils.users.list.invalidate();
      setIsRoleDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "حدث خطأ أثناء تحديث الدور");
    },
  });

  const deleteUser = trpc.users.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف المستخدم بنجاح");
      utils.users.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message || "حدث خطأ أثناء حذف المستخدم");
    },
  });

  const filteredUsers = users?.filter((user: any) =>
    user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil((filteredUsers?.length || 0) / itemsPerPage);
  const paginatedUsers = filteredUsers?.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleAddUser = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createUser.mutate({
      username: formData.get("username") as string,
      password: formData.get("password") as string,
      fullName: formData.get("fullName") as string,
      email: formData.get("email") as string || undefined,
      phone: formData.get("phone") as string || undefined,
      isActive: formData.get("isActive") === "on",
    });
  };

  const handleEditUser = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedUser) return;
    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    updateUser.mutate({
      id: selectedUser.id,
      fullName: formData.get("fullName") as string,
      email: formData.get("email") as string || null,
      phone: formData.get("phone") as string || null,

      isActive: formData.get("isActive") === "on",
      ...(password && password.length >= 6 ? { password } : {}),
    });
  };

  const handleChangeRole = (user: any) => {
    setSelectedUser(user);
    setSelectedRole(user.role || 'guard');
    setIsRoleDialogOpen(true);
  };

  const handleSaveRole = () => {
    if (!selectedUser || !selectedRole) return;
    updateRole.mutate({
      userId: selectedUser.id,
      role: selectedRole as any,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">إدارة المستخدمين</h1>
            <p className="text-muted-foreground mt-1">
              إضافة وتعديل وحذف المستخدمين وتعيين الأدوار
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="h-4 w-4" />
                إضافة مستخدم
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <form onSubmit={handleAddUser}>
                <DialogHeader>
                  <DialogTitle>إضافة مستخدم جديد</DialogTitle>
                  <DialogDescription>أدخل بيانات المستخدم الجديد</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="username">اسم المستخدم *</Label>
                    <Input id="username" name="username" required minLength={3} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="fullName">الاسم الكامل *</Label>
                    <Input id="fullName" name="fullName" required minLength={2} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">كلمة المرور *</Label>
                    <Input id="password" name="password" type="password" required minLength={6} placeholder="6 أحرف على الأقل" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">البريد الإلكتروني</Label>
                    <Input id="email" name="email" type="email" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phoneNumber">رقم الهاتف</Label>
                    <Input id="phoneNumber" name="phoneNumber" placeholder="05xxxxxxxx" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="isActive" name="isActive" defaultChecked />
                    <Label htmlFor="isActive">نشط</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createUser.isPending}>
                    {createUser.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                    إضافة
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Roles Legend */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">الأدوار المتاحة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {ROLES.map(role => (
                <div key={role.value} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                  <div className={`w-3 h-3 rounded-full mt-1 ${role.color}`} />
                  <div>
                    <p className="text-sm font-medium">{role.label}</p>
                    <p className="text-xs text-muted-foreground">{role.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Search */}
        <Card className="border-0 shadow-md">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="البحث عن مستخدم..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pr-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle>قائمة المستخدمين</CardTitle>
            <CardDescription>{filteredUsers?.length || 0} مستخدم</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-right">الاسم</TableHead>
                      <TableHead className="text-right">اسم المستخدم</TableHead>
                      <TableHead className="text-right">رقم الهاتف</TableHead>
                      <TableHead className="text-right">الدور</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedUsers?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                          لا يوجد مستخدمين
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedUsers?.map((user: any) => {
                        const roleInfo = getRoleInfo(user.role || 'guard');
                        return (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.fullName}</TableCell>
                            <TableCell className="text-muted-foreground">{user.username}</TableCell>
                            <TableCell className="text-muted-foreground">{user.phoneNumber || "-"}</TableCell>
                            <TableCell>
                              <Badge variant={getRoleBadgeVariant(user.role || 'guard')}>
                                {roleInfo.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={user.isActive ? "default" : "secondary"}>
                                {user.isActive ? "نشط" : "غير نشط"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleChangeRole(user)}
                                  title="تغيير الدور"
                                >
                                  <Shield className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setIsEditDialogOpen(true);
                                  }}
                                  title="تعديل"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="حذف">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        سيتم حذف المستخدم "{user.fullName}" نهائياً.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteUser.mutate({ id: user.id })}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        حذف
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  عرض {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredUsers?.length || 0)} من {filteredUsers?.length || 0}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1}>
                    السابق
                  </Button>
                  <span className="text-sm">صفحة {currentPage} من {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages}>
                    التالي
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <form onSubmit={handleEditUser}>
              <DialogHeader>
                <DialogTitle>تعديل المستخدم</DialogTitle>
                <DialogDescription>تحديث بيانات المستخدم</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>اسم المستخدم</Label>
                  <Input disabled defaultValue={selectedUser?.username} className="bg-muted" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-fullName">الاسم الكامل *</Label>
                  <Input id="edit-fullName" name="fullName" required minLength={2} defaultValue={selectedUser?.fullName} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-password">كلمة المرور الجديدة</Label>
                  <Input id="edit-password" name="password" type="password" minLength={6} placeholder="اتركها فارغة إذا لم ترد التغيير" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-email">البريد الإلكتروني</Label>
                  <Input id="edit-email" name="email" type="email" defaultValue={selectedUser?.email || ""} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-phoneNumber">رقم الهاتف</Label>
                  <Input id="edit-phoneNumber" name="phoneNumber" placeholder="05xxxxxxxx" defaultValue={selectedUser?.phoneNumber || ""} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="edit-isActive" name="isActive" defaultChecked={selectedUser?.isActive} />
                  <Label htmlFor="edit-isActive">نشط</Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={updateUser.isPending}>
                  {updateUser.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  حفظ التغييرات
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Role Change Dialog */}
        <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>تغيير دور المستخدم</DialogTitle>
              <DialogDescription>
                {selectedUser?.fullName} - الدور الحالي: {getRoleInfo(selectedUser?.role || 'guard').label}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              {ROLES.map(role => (
                <div
                  key={role.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedRole === role.value
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent bg-muted/30 hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedRole(role.value)}
                >
                  <div className={`w-4 h-4 rounded-full mt-0.5 ${role.color}`} />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{role.label}</p>
                    <p className="text-xs text-muted-foreground">{role.description}</p>
                  </div>
                  {selectedRole === role.value && (
                    <Badge variant="default" className="text-xs">محدد</Badge>
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>إلغاء</Button>
              <Button onClick={handleSaveRole} disabled={updateRole.isPending || selectedRole === selectedUser?.role}>
                {updateRole.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                حفظ الدور
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
