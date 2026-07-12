import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Users, Shield, Key, Briefcase, UserCheck, Building2, Loader2 } from "lucide-react";

export default function Dashboard() {
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  const statCards = [
    {
      title: "المستخدمين",
      value: stats?.users || 0,
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
{
      title: "المجموعات",
      value: stats?.groups || 0,
      icon: Briefcase,
      color: "text-chart-4",
      bgColor: "bg-chart-4/10",
    },
    {
      title: "العمال",
      value: stats?.workers || 0,
      icon: UserCheck,
      color: "text-chart-5",
      bgColor: "bg-chart-5/10",
    },
    {
      title: "مراكز التكلفة",
      value: stats?.costCenters || 0,
      icon: Building2,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">لوحة التحكم</h1>
          <p className="text-muted-foreground mt-2">
            نظرة عامة على إحصائيات النظام
          </p>
        </div>

        {/* Stats Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {statCards.map((stat, index) => (
              <Card key={index} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Quick Actions - Only for Super Admin */}
        {isSuperAdmin && (
          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle>إجراءات سريعة</CardTitle>
              <CardDescription>الوصول السريع للمهام الشائعة</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <a
                href="/users"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
              >
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">إدارة المستخدمين</p>
                  <p className="text-sm text-muted-foreground">إضافة وتعديل المستخدمين</p>
                </div>
              </a>
              <a
                href="/users"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
              >
                <div className="p-2 rounded-lg bg-chart-2/10">
                  <Key className="h-5 w-5 text-chart-2" />
                </div>
                <div>
                  <p className="font-medium">إدارة الصلاحيات</p>
                  <p className="text-sm text-muted-foreground">تعيين صلاحيات المستخدمين</p>
                </div>
              </a>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
