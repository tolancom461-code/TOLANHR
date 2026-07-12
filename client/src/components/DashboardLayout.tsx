import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  LayoutDashboard, 
  LogOut, 
  PanelLeft, 
  Users, 
  Key, 
  User, 
  UsersRound, 
  UserCircle, 
  QrCode, 
  ClipboardList, 
  Wallet, 
  Building2, 
  Shield, 
  FileText,
  TrendingUp,
  PlusCircle,
  DollarSign,
  CheckCircle,
  FileCheck,
  ChevronDown,
  Flag,
  Clock,
  Settings,
  Briefcase,
  Home as HomeIcon,
  Banknote,
  Calendar,
  ClipboardCheck,
  AlertCircle,
  AlertTriangle,
  FileSearch,
  ArrowLeftRight,
  HardDrive,
  ShieldCheck,
  Globe,
  ListChecks,
  UtensilsCrossed,
  BarChart3
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { PWAInstallButton } from "./PWAInstallButton";
import { NotificationBell } from "./NotificationBell";
import { PushNotificationToggle } from "./PushNotificationToggle";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

// تعريف الصفحات المسموحة لكل دور
type UserRoleType = 'guard' | 'supervisor_tolan' | 'supervisor_malqa' | 'admin_affairs' | 'accountant' | 'auditor' | 'finance_manager' | 'executive' | 'super_admin' | 'restaurant_operations';

const ROLE_ALLOWED_PATHS: Record<UserRoleType, string[] | 'all'> = {
  // الحارس: فقط تسجيل الحضور (بدون سجل الحضور وبدون تقارير الحضور)
  guard: ['/attendance', '/profile'],
  supervisor_tolan: ['/operations', '/profile'],  // بدون معالجة الملاحظات
  supervisor_malqa: ['/operations', '/profile'],  // بدون معالجة الملاحظات
  // الشؤون الإدارية: بدون صفحة المستخدمين
  admin_affairs: [
    '/dashboard', '/executive', '/workers', '/groups',
    '/attendance', '/attendance/log', '/attendance/reports', '/work-days',
    '/payroll/dashboard', '/payroll/batches', '/payroll/batches/coverage', '/payroll/batches/create',
    '/finance/payroll/history', '/finance/overrides', '/payroll-report', '/finance/reports', '/finance/daily-payroll-report',
    '/finance/payment-voucher',
    '/finance/payment-voucher',
    '/finance/payment-voucher',
    '/finance/payment-voucher',
    '/schedules/weekly', '/punches/review',
    '/operations', '/operations/notes-review', '/operations/supervisor-performance',
    '/cost-centers', '/temporary-assignments', '/operations/staffing', '/operations/restaurants', '/operations/cost-report', '/profile',
  ],
  // المحاسب: بدون لوحة التحكم، بدون المستخدمين، مع سجل الحضور وتقارير الحضور (استعراض فقط)
  accountant: [
    '/workers', '/groups',
    '/attendance/log', '/attendance/reports',
    '/payroll/dashboard', '/payroll/batches', '/payroll/batches/coverage',
    '/finance/payroll/history', '/finance/overrides', '/payroll-report', '/finance/reports', '/finance/daily-payroll-report',
    '/finance/payment-voucher',
    '/finance/payment-voucher',
    '/finance/payment-voucher',
    '/finance/payment-voucher',
    '/schedules/weekly', '/punches/review',
    '/operations', '/operations/notes-review', '/operations/supervisor-performance',
    '/cost-centers', '/temporary-assignments', '/operations/staffing', '/operations/restaurants', '/operations/cost-report', '/profile',
  ],
  // المراجع: اعتماد/رفض + تقارير مالية + سجلات حضور (استعراض فقط) + سجل التدقيق
  auditor: [
    '/payroll/dashboard', '/payroll/batches', '/payroll/batches/coverage',
    '/finance/payroll/history', '/payroll-report', '/finance/reports', '/finance/daily-payroll-report',
    '/attendance/log', '/attendance/reports',
    '/audit-log',
    '/profile',
  ],
  // المدير المالي: اعتماد/رفض + تقارير مالية + سجلات حضور (استعراض فقط) + سجل التدقيق
  finance_manager: [
    '/payroll/dashboard', '/payroll/batches', '/payroll/batches/coverage',
    '/finance/payroll/history', '/payroll-report', '/finance/reports', '/finance/daily-payroll-report',
    '/finance/cost-center-report',
    '/attendance/log', '/attendance/reports',
    '/audit-log',
    '/backup',
    '/profile',
  ],
  executive: ['/executive/finance', '/profile'],
  // تشغيل مطاعم: فقط صفحتَي التشغيل وإدارة المطاعم، لا غير
  restaurant_operations: ['/operations/staffing', '/operations/restaurants', '/profile'],
  super_admin: 'all',
};

function isPathAllowed(role: UserRoleType, path: string): boolean {
  const allowed = ROLE_ALLOWED_PATHS[role];
  if (allowed === 'all') return true;
  // تحقق دقيق: إذا كان المسار موجود بالضبط في القائمة أو يبدأ بمسار مسموح
  // لكن يجب التأكد أن المسار الفرعي موجود أيضاً في القائمة
  if (allowed.includes(path)) return true;
  // للمسارات الفرعية: السماح فقط إذا كان المسار الأب موجود والمسار الفرعي ليس محظوراً صراحة
  return allowed.some(p => {
    if (path.startsWith(p + '/')) {
      // المسارات الفرعية مسموحة فقط إذا كان المسار الفرعي نفسه موجود في القائمة
      // هذا يمنع المشرفين من الوصول لـ /operations/notes-review عندما يكون لديهم فقط /operations
      return allowed.includes(path);
    }
    return false;
  });
}

// تصنيف القوائم حسب الأدوار والوظائف - dynamic based on language
function getMenuSections(t: any) {
  return [
  {
    label: t.nav.dashboards,
    items: [
      { icon: LayoutDashboard, label: t.navItems.home, path: "/dashboard" },
      { icon: TrendingUp, label: t.navItems.managerDashboard, path: "/executive" },
      { icon: DollarSign, label: t.navItems.executiveFinance, path: "/executive/finance" },
    ]
  },
  {
    label: t.nav.hrManagement,
    items: [
      { icon: Users, label: t.navItems.users, path: "/users" },
      { icon: UsersRound, label: t.navItems.workers, path: "/workers" },
      { icon: Briefcase, label: t.navItems.groups, path: "/groups" },
    ]
  },
  {
    label: t.nav.attendanceManagement,
    items: [
      { icon: QrCode, label: t.navItems.attendanceScanner, path: "/attendance" },
      { icon: ClipboardList, label: t.navItems.attendanceLog, path: "/attendance/log" },
      { icon: FileText, label: t.navItems.attendanceReports, path: "/attendance/reports" },
      { icon: Clock, label: t.navItems.workDays, path: "/work-days" },
    ]
  },
  {
    label: t.nav.financialManagement,
    items: [
      { icon: Banknote, label: t.navItems.payrollDashboard, path: "/payroll/dashboard", color: "text-green-600" },
      { icon: DollarSign, label: t.navItems.payrollBatches, path: "/payroll/batches" },
      { icon: AlertTriangle, label: t.navItems.groupCoverageReport, path: "/payroll/batches/coverage", color: "text-red-600" },
      { icon: FileText, label: t.navItems.payrollHistory, path: "/finance/payroll/history" },
      { icon: Wallet, label: t.navItems.payOverrides, path: "/finance/overrides" },
      { icon: FileCheck, label: t.navItems.dailyPayrollReport, path: "/finance/daily-payroll-report" },
      { icon: TrendingUp, label: t.navItems.financialReports, path: "/finance/reports" },
      { icon: FileText, label: t.navItems.paymentVoucher, path: "/finance/payment-voucher" },
    ]
  },
  {
    label: t.nav.shiftsManagement,
    items: [
      { icon: Clock, label: t.navItems.weeklyShifts, path: "/schedules/weekly", color: "text-purple-600" },
    ]
  },
  {
    label: t.nav.punchesReview,
    items: [
      { icon: ClipboardCheck, label: t.navItems.punchesReviewCenter, path: "/punches/review", color: "text-orange-600" },
    ]
  },
  {
    label: t.nav.operations,
    items: [
      { icon: AlertCircle, label: t.navItems.operationsDashboard, path: "/operations", color: "text-blue-600" },
      { icon: ClipboardCheck, label: t.navItems.notesReview, path: "/operations/notes-review", color: "text-amber-600" },
      { icon: ShieldCheck, label: t.navItems.supervisorPerformance, path: "/operations/supervisor-performance", color: "text-teal-600" },
    ]
  },
  {
    label: t.nav.referenceData,
    items: [
      { icon: Building2, label: t.navItems.costCenters, path: "/cost-centers" },
      { icon: ArrowLeftRight, label: t.navItems.temporaryAssignments, path: "/temporary-assignments", color: "text-cyan-600" },
      { icon: ListChecks, label: t.navItems.staffingOperations, path: "/operations/staffing", color: "text-orange-600" },
      { icon: UtensilsCrossed, label: t.navItems.restaurantsManagement, path: "/operations/restaurants", color: "text-pink-600" },
      { icon: BarChart3, label: t.navItems.restaurantCostReport, path: "/operations/cost-report", color: "text-indigo-600" },
    ]
  },
  {
    label: t.nav.systemSettings,
    items: [
      { icon: Shield, label: t.navItems.auditLog, path: "/audit-log", color: "text-red-600" },
      { icon: HardDrive, label: t.navItems.backup, path: "/backup", color: "text-blue-600" },
      { icon: ShieldCheck, label: t.navItems.financialRecalculation, path: "/financial-recalculation", color: "text-green-600" },
      { icon: Settings, label: t.navItems.profile, path: "/profile" },
    ]
  },
];}


const SIDEBAR_WIDTH_KEY = "sidebar-width";
const SIDEBAR_COLLAPSED_SECTIONS_KEY = "sidebar-collapsed-sections";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              {t.login.title}
            </h1>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            {t.general.profile}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
          height: "100vh",
          overflow: "hidden",
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type MenuItem = {
  icon: any;
  label: string;
  path: string;
  color?: string;
  badge?: number | null;
};

type MenuSection = {
  label: string;
  items: MenuItem[];
};

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const { t, toggleLanguage, isRTL } = useLanguage();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  
  // جلب عدد البصمات المعلقة
  const { data: pendingPunchesCount = 0 } = trpc.attendance.getPendingCount.useQuery();
  
  // حفظ حالة الطي/الفتح لكل قسم
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_SECTIONS_KEY);
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_SECTIONS_KEY, JSON.stringify(collapsedSections));
  }, [collapsedSections]);

  const toggleSection = (label: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };
  
  // تصفية القائمة حسب دور المستخدم
  const userRole = (user?.role || 'guard') as UserRoleType;
  const menuSections = getMenuSections(t);
  const filteredMenuSections = menuSections
    .map(section => ({
      ...section,
      items: section.items
        .filter(item => isPathAllowed(userRole, item.path))
        .map(item => {
          if (item.path === "/punches/review") {
            return { ...item, badge: pendingPunchesCount };
          }
          return item;
        })
    }))
    .filter(section => section.items.length > 0);

  const isMobile = useIsMobile();

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = e.clientX;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <Sidebar
        ref={sidebarRef}
        collapsible="icon"
        side="right"
        wrapperClassName={!isRTL ? "md:order-2" : undefined}
      >
        <SidebarHeader className="border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Users className="h-4 w-4" />
            </div>
            <div className="flex flex-col gap-0.5 leading-none">
              <span className="font-semibold">TolanWorkforce</span>
              <span className="text-xs text-muted-foreground">{isRTL ? 'نظام إدارة القوى العاملة' : 'Workforce Management'}</span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarMenu>
            {filteredMenuSections.map((section) => (
              <Collapsible
                key={section.label}
                open={!collapsedSections[section.label]}
                onOpenChange={() => toggleSection(section.label)}
                className="group/collapsible"
              >
                <SidebarGroup>
                  <CollapsibleTrigger asChild>
                    <SidebarGroupLabel className="cursor-pointer hover:text-foreground transition-colors">
                      {section.label}
                      <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-0 group-data-[state=closed]/collapsible:-rotate-90" />
                    </SidebarGroupLabel>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {section.items.map((item) => (
                          <SidebarMenuItem key={item.path}>
                            <SidebarMenuButton
                              asChild
                              isActive={location === item.path}
                              onClick={() => setLocation(item.path)}
                            >
                              <a href={item.path} className="flex items-center gap-2 justify-between w-full">
                                <div className="flex items-center gap-2">
                                  <item.icon className={`h-4 w-4 ${(item as any).color || ''}`} />
                                  <span>{item.label}</span>
                                </div>
                                {(item as any).badge !== undefined && (item as any).badge !== null && (item as any).badge > 0 && (
                                  <Badge variant="destructive" className="ml-auto text-xs h-5 flex items-center justify-center">
                                    {(item as any).badge}
                                  </Badge>
                                )}
                              </a>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            ))}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="border-t">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton>
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {user?.fullName?.split(" ").map(n => n[0]).join("") || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{user?.fullName}</span>
                    <ChevronDown className="ml-auto h-4 w-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                    {user?.email}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation("/profile")}>
                    <User className="mr-2 h-4 w-4" />
                    <span>{t.general.profile}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => logout()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>{t.general.logout}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <div className="grid grid-cols-3 gap-1 justify-items-center py-1">
                <NotificationBell />
                <PushNotificationToggle iconOnly />
                <PWAInstallButton iconOnly />
                <ThemeToggle />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleLanguage}
                      className="h-9 w-9 rounded-lg hover:bg-accent"
                    >
                      <Globe className="h-5 w-5 text-slate-700 dark:text-slate-300" />
                      <span className="sr-only">{t.general.switchLanguage}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{t.general.switchLanguage}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="flex flex-col h-screen overflow-hidden">
        {/* شريط علوي يظهر فقط على الجوال (أقل من 768px) ليتيح فتح القائمة الجانبية،
            لأن القائمة بكاملها تختفي داخل لوحة منزلقة على الشاشات الصغيرة ولا طريقة
            لفتحها بدون هذا الزر */}
        <header className="md:hidden flex items-center gap-2 border-b px-3 py-2 shrink-0">
          <SidebarTrigger />
          <span className="font-semibold text-sm">TolanWorkforce</span>
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
