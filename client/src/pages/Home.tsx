import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Shield, Users, BarChart3, Settings, ArrowRight, CheckCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <Card className="w-full max-w-md shadow-xl border-0 bg-card/80 backdrop-blur-xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">مرحباً، {user?.fullName}</CardTitle>
            <CardDescription>أنت مسجل الدخول بنجاح</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Button 
              className="w-full h-12 text-base font-medium" 
              onClick={() => setLocation("/dashboard")}
            >
              الذهاب إلى لوحة التحكم
              <ArrowRight className="mr-2 h-5 w-5 rotate-180" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">TolanWorkforce</span>
          </div>
          <Button asChild>
            <a href={getLoginUrl()}>تسجيل الدخول</a>
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container py-24 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            نظام إدارة القوى العاملة
            <span className="block text-primary mt-2">المتكامل والذكي</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            حل شامل لإدارة الموظفين والحضور والرواتب والصلاحيات في مكان واحد
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button size="lg" className="h-12 px-8 text-base" asChild>
              <a href={getLoginUrl()}>
                ابدأ الآن
                <ArrowRight className="mr-2 h-5 w-5 rotate-180" />
              </a>
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-8 text-base">
              تعرف على المزيد
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">مميزات النظام</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            كل ما تحتاجه لإدارة فريق عملك بكفاءة عالية
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-0 shadow-lg bg-card/80 backdrop-blur hover:shadow-xl transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-lg">إدارة المستخدمين</CardTitle>
              <CardDescription>
                إضافة وتعديل وحذف المستخدمين مع نظام صلاحيات متقدم
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-0 shadow-lg bg-card/80 backdrop-blur hover:shadow-xl transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-chart-2/10 flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-chart-2" />
              </div>
              <CardTitle className="text-lg">نظام الصلاحيات</CardTitle>
              <CardDescription>
                5 أدوار مختلفة مع صلاحيات قابلة للتخصيص لكل مستخدم
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-0 shadow-lg bg-card/80 backdrop-blur hover:shadow-xl transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-chart-3/10 flex items-center justify-center mb-4">
                <BarChart3 className="h-6 w-6 text-chart-3" />
              </div>
              <CardTitle className="text-lg">تقارير متقدمة</CardTitle>
              <CardDescription>
                تقارير شاملة للحضور والرواتب والمصاريف
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-0 shadow-lg bg-card/80 backdrop-blur hover:shadow-xl transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-chart-4/10 flex items-center justify-center mb-4">
                <Settings className="h-6 w-6 text-chart-4" />
              </div>
              <CardTitle className="text-lg">إعدادات مرنة</CardTitle>
              <CardDescription>
                تخصيص كامل للنظام حسب احتياجات مؤسستك
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="container py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2 className="text-3xl font-bold">لماذا TolanWorkforce؟</h2>
            <p className="text-muted-foreground text-lg">
              نظام متكامل يوفر لك كل الأدوات اللازمة لإدارة فريق عملك بكفاءة وسهولة
            </p>
            <ul className="space-y-4">
              {[
                "واجهة مستخدم أنيقة وسهلة الاستخدام",
                "نظام أمان متقدم لحماية بياناتك",
                "تقارير فورية ودقيقة",
                "دعم فني على مدار الساعة",
                "تحديثات مستمرة ومجانية",
              ].map((item, index) => (
                <li key={index} className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <div className="aspect-square rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-8">
              <div className="w-full h-full rounded-2xl bg-card shadow-2xl flex items-center justify-center">
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                    <Shield className="h-10 w-10 text-primary" />
                  </div>
                  <p className="text-2xl font-bold">22 جدول</p>
                  <p className="text-muted-foreground">قاعدة بيانات متكاملة</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card/50 py-8">
        <div className="container text-center text-muted-foreground">
          <p>© 2026 TolanWorkforce. جميع الحقوق محفوظة.</p>
        </div>
      </footer>
    </div>
  );
}
