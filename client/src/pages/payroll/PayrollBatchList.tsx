import { useState } from "react";
import { Link } from "wouter";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/payroll/StatusBadge";
import { Plus, Eye, Trash2, Filter } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { SelectSkeleton, FilterSkeleton } from "@/components/SkeletonLoader";

export default function PayrollBatchList() {
  const [activeTab, setActiveTab] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    costCenterId: undefined as number | undefined,
    groupId: undefined as number | undefined,
    startDate: "",
    endDate: "",
  });
  
  const utils = trpc.useUtils();
  
  // Fetch cost centers and groups for filters
  const { data: costCenters, isLoading: loadingCostCenters } = trpc.costCenters.list.useQuery();
  
  // Get groups filtered by cost center
  const { data: filteredGroups, isLoading: loadingGroups } = trpc.groups.listByCostCenter.useQuery(
    { costCenterId: filters.costCenterId },
    { enabled: true }
  );
  
  // Also keep allGroups for backward compatibility
  const allGroups = filteredGroups;
  
  // Build query params
  const queryParams: any = {};
  if (filters.costCenterId) queryParams.costCenterId = filters.costCenterId;
  if (filters.groupId) queryParams.groupId = filters.groupId;
  if (filters.startDate) queryParams.startDate = filters.startDate;
  if (filters.endDate) queryParams.endDate = filters.endDate;
  
  const { data: paginatedBatches, isLoading: loadingAll } = trpc.payroll.listBatches.useQuery({
    ...queryParams,
    page: 1,
    limit: 100,
  });
  const allBatches = paginatedBatches?.data || [];
  const { data: draftBatches } = trpc.payroll.listBatchesByStatus.useQuery({ status: "draft" });
  const { data: pendingBatches } = trpc.payroll.listBatchesByStatus.useQuery({ status: "under_accountant_review" });
  const { data: approvedBatches } = trpc.payroll.listBatchesByStatus.useQuery({ status: "approved" });

  const deleteMutation = trpc.payroll.deleteBatch.useMutation({
    onSuccess: () => {
      toast.success("تم حذف الدفعة بنجاح");
      utils.payroll.listBatches.invalidate();
      utils.payroll.listBatchesByStatus.invalidate();
    },
    onError: (error) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  const handleDelete = (batchId: number) => {
    if (confirm("هل أنت متأكد من حذف هذه الدفعة؟")) {
      deleteMutation.mutate({ batchId });
    }
  };

  const renderBatchTable = (batches: any[] | undefined, showDelete = false) => {
    if (!batches || batches.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          لا توجد دفعات
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>رقم الدفعة</TableHead>
            <TableHead className="w-[480px]">العنوان</TableHead>
            <TableHead>مركز التكلفة</TableHead>
            <TableHead>الفترة</TableHead>
            <TableHead className="hidden">عدد العمال</TableHead>
            <TableHead>الصافي</TableHead>
            <TableHead>الحالة</TableHead>
            <TableHead>تاريخ الإنشاء</TableHead>
            <TableHead>الإجراءات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((batch) => (
            <TableRow key={batch.id}>
              <TableCell className="font-medium">{batch.batchCode}</TableCell>
              <TableCell className="w-[480px] whitespace-normal break-words leading-snug text-[9.8px]">
                {batch.groupNames || "-"}
              </TableCell>
              <TableCell>{batch.costCenterName}</TableCell>
              <TableCell>
                {new Date(batch.periodStart).toLocaleDateString("ar-SA")} -{" "}
                {new Date(batch.periodEnd).toLocaleDateString("ar-SA")}
              </TableCell>
              <TableCell className="hidden">{batch.workerCount}</TableCell>
              <TableCell>
                {(Number(batch.totalAmount || 0) - Number(batch.totalDeductions || 0) + Number(batch.totalBonuses || 0)).toLocaleString("ar-SA")} ر.س
              </TableCell>
              <TableCell>
                <StatusBadge status={batch.status} />
              </TableCell>
              <TableCell>{new Date(batch.createdAt).toLocaleDateString("ar-SA")}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Link href={`/payroll/batches/${batch.id}`}>
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4 ml-2" />
                      عرض
                    </Button>
                  </Link>
                             {batch.status === "draft" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(batch.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 ml-2" />
                      حذف
                    </Button>
                  )}
                  {batch.status === "under_accountant_review" && (
                    <Link href={`/payroll/batches/${batch.id}/accountant-review`}>
                      <Button size="sm">
                        <Eye className="h-4 w-4 ml-2" />
                        مراجعة المحاسب
                      </Button>
                    </Link>
                  )}
                  {batch.status === "under_financial_review" && (
                    <Link href={`/payroll/batches/${batch.id}/financial-review`}>
                      <Button size="sm">
                        <Eye className="h-4 w-4 ml-2" />
                        مراجعة المراجع المالي
                      </Button>
                    </Link>
                  )}
                  {batch.status === "under_accounts_manager_review" && (
                    <Link href={`/payroll/batches/${batch.id}/manager-review`}>
                      <Button size="sm">
                        <Eye className="h-4 w-4 ml-2" />
                        اعتماد مدير الحسابات
                      </Button>
                    </Link>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  if (loadingAll) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">دفعات اليومية</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 ml-2" />
            فلاتر
          </Button>
          <Link href="/payroll/batches/create">
            <Button>
              <Plus className="h-4 w-4 ml-2" />
              إنشاء دفعة جديدة
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters Card */}
      {showFilters && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>فلاتر البحث</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCostCenters || loadingGroups ? (
              <FilterSkeleton />
            ) : (
            <div className="grid grid-cols-4 gap-4">
              {/* Cost Center Filter */}
              <div>
                <Label>مركز التكلفة</Label>
                {loadingCostCenters ? (
                  <SelectSkeleton />
                ) : (
                <Select
                  value={filters.costCenterId?.toString() || "all"}
                  onValueChange={(value) => {
                    setFilters({
                      ...filters,
                      costCenterId: value === "all" ? undefined : Number(value),
                      groupId: undefined, // Reset group when cost center changes
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="جميع مراكز التكلفة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع مراكز التكلفة</SelectItem>
                    {costCenters && costCenters.length > 0 && costCenters.map((cc) => (
                      <SelectItem key={cc.id} value={cc.id.toString()}>
                        {cc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                )}
              </div>

              {/* Group Filter */}
              <div>
                <Label>المجموعة</Label>
                {loadingGroups ? (
                  <SelectSkeleton />
                ) : (
                <Select
                  value={filters.groupId?.toString() || "all"}
                  onValueChange={(value) => {
                    setFilters({
                      ...filters,
                      groupId: value === "all" ? undefined : Number(value),
                    });
                  }}
                  disabled={!filters.costCenterId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      filters.costCenterId
                        ? "جميع المجموعات"
                        : "اختر مركز التكلفة أولاً"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المجموعات</SelectItem>
                    {filteredGroups && filteredGroups.length > 0 && filteredGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id.toString()}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                )}
              </div>

              {/* Start Date Filter */}
              <div>
                <Label>من تاريخ</Label>
                <Input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                />
              </div>

              {/* End Date Filter */}
              <div>
                <Label>إلى تاريخ</Label>
                <Input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                />
              </div>
            </div>
            )}

            {/* Clear Filters Button */}
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setFilters({
                    costCenterId: undefined,
                    groupId: undefined,
                    startDate: "",
                    endDate: "",
                  });
                }}
              >
                إعادة تعيين الفلاتر
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">الكل ({allBatches?.length || 0})</TabsTrigger>
          <TabsTrigger value="draft">المسودات ({draftBatches?.length || 0})</TabsTrigger>
          <TabsTrigger value="pending">قيد المراجعة ({pendingBatches?.length || 0})</TabsTrigger>
          <TabsTrigger value="approved">المعتمدة ({approvedBatches?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>جميع الدفعات</CardTitle>
            </CardHeader>
            <CardContent>{renderBatchTable(allBatches, true)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="draft">
          <Card>
            <CardHeader>
              <CardTitle>المسودات</CardTitle>
            </CardHeader>
            <CardContent>{renderBatchTable(draftBatches, true)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>قيد المراجعة</CardTitle>
            </CardHeader>
            <CardContent>{renderBatchTable(pendingBatches)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved">
          <Card>
            <CardHeader>
              <CardTitle>المعتمدة</CardTitle>
            </CardHeader>
            <CardContent>{renderBatchTable(approvedBatches)}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
