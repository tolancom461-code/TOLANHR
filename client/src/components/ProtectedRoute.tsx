import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Loader2, ShieldX } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermissions?: any[];
  requireAll?: boolean;
  adminOnly?: boolean;
  allowedRoles?: readonly string[];
}

/**
 * Protects authenticated routes and optionally restricts them to specific roles.
 * super_admin remains a system-wide override.
 */
export function ProtectedRoute({
  children,
  requiredPermissions = [],
  requireAll = false,
  adminOnly = false,
  allowedRoles,
}: ProtectedRouteProps) {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">جاري التحقق من الصلاحيات...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <Card className="w-full max-w-md shadow-xl border-0 bg-card/80 backdrop-blur-xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
              <ShieldX className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">غير مصرح</CardTitle>
            <CardDescription>يجب تسجيل الدخول للوصول إلى هذه الصفحة</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <Button className="w-full h-12 text-base font-medium" asChild>
              <a href={getLoginUrl()}>تسجيل الدخول</a>
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setLocation("/")}>
              العودة للرئيسية
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const userRole = user?.role;
  const roleAllowed =
    !allowedRoles ||
    userRole === "super_admin" ||
    (typeof userRole === "string" && allowedRoles.includes(userRole));

  if (!roleAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <Card className="w-full max-w-md shadow-xl border-0 bg-card/80 backdrop-blur-xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
              <ShieldX className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">غير مصرح</CardTitle>
            <CardDescription>ليس لديك صلاحية للوصول إلى هذه الصفحة</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Button variant="outline" className="w-full" onClick={() => setLocation("/profile")}>
              العودة إلى الملف الشخصي
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
