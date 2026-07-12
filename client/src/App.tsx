import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import Home from "./pages/Home";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";

import Profile from "./pages/Profile";
import Groups from "./pages/Groups";
import Workers from "./pages/Workers";
import WorkerCard from "./pages/WorkerCard";
import WorkerDetails from "./pages/WorkerDetails";
import AttendanceScanner from "./pages/AttendanceScanner";
import AttendanceLog from "./pages/AttendanceLog";
import AuditLog from "./pages/AuditLog";
import AttendanceReports from "./pages/AttendanceReports";
import { AttendanceExport } from "./pages/AttendanceExport";
import DailyManagement from "./pages/DailyManagement";
import WorkDays from "./pages/WorkDays";


import PayOverrides from "./pages/PayOverrides";
import FinanceEntry from "./pages/FinanceEntry";
import PayrollManagement from "./pages/PayrollManagement";
import PayrollBatches from "./pages/PayrollBatches";
import PayrollBatchList from "./pages/payroll/PayrollBatchList";
import PayrollBatchCreateSimple from "./pages/payroll/PayrollBatchCreateSimple";
import PayrollBatchDetails from "./pages/payroll/PayrollBatchDetails";
import PayrollBatchHistory from "./pages/PayrollBatchHistory";
import AccountantReview from "./pages/payroll/AccountantReview";
import FinancialReview from "./pages/payroll/FinancialReview";
import AccountsManagerReview from "./pages/payroll/AccountsManagerReview";
import CostCenters from "./pages/CostCenters";

import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import ExecutiveFinanceDashboard from "./pages/ExecutiveFinanceDashboard";
import FinancialReports from "./pages/reports/FinancialReports";
import CostCenterReport from "./pages/reports/CostCenterReport";
import DailyPayrollReport from "./pages/reports/DailyPayrollReport";
import PayrollReport from "./pages/PayrollReport";
import LocalLogin from "./pages/LocalLogin";
import OperationalFlagsSimple from "./pages/OperationalFlagsSimple";
import OperationalDashboard from "./pages/OperationalDashboard";
import OperationalNotesReview from "./pages/OperationalNotesReview";
import SupervisorPerformance from "./pages/SupervisorPerformance";
import { PayrollDashboard } from "./pages/PayrollDashboard";

import WeeklyShifts from "./pages/WeeklyShifts";
import PunchesReviewCenter from "./pages/PunchesReviewCenter";
import Backfill from "./pages/Backfill";
import TemporaryAssignments from "./pages/TemporaryAssignments";
import Operations from "./pages/Operations";
import RestaurantsManagement from "./pages/RestaurantsManagement";
import RestaurantCostReport from "./pages/RestaurantCostReport";
import Backup from "./pages/Backup";
import Migration from "./pages/Migration";
import DatabaseConsole from "./pages/DatabaseConsole";
import FinancialRecalculation from "./pages/FinancialRecalculation";
import PaymentVoucher from "./pages/PaymentVoucher";

import { ProtectedRoute } from "./components/ProtectedRoute";
import DashboardLayout from "./components/DashboardLayout";
import { lazy } from "react";
import LazyPage from "./components/LazyPage";

// Lazy load heavy pages for code splitting
const LazyWorkers = lazy(() => import("./pages/Workers"));
const LazyGroups = lazy(() => import("./pages/Groups"));
const LazyPayrollBatches = lazy(() => import("./pages/PayrollBatches"));
const LazyUsers = lazy(() => import("./pages/Users"));
const LazyDashboard = lazy(() => import("./pages/Dashboard"));
const LazyPayrollBatchList = lazy(() => import("./pages/payroll/PayrollBatchList"));
const LazyGroupCoverageReport = lazy(() => import("./pages/payroll/GroupCoverageReport"));
const LazyPayrollBatchCreateSimple = lazy(() => import("./pages/payroll/PayrollBatchCreateSimple"));
const LazyPayrollBatchDetails = lazy(() => import("./pages/payroll/PayrollBatchDetails"));

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/home" component={Home} />
      <Route path="/local-login" component={LocalLogin} />
      <Route path="/dashboard">
        <ProtectedRoute>
          <LazyPage>
            <LazyDashboard />
          </LazyPage>
        </ProtectedRoute>
      </Route>
      <Route path="/executive" component={ExecutiveDashboard} />
      <Route path="/executive/finance" component={ExecutiveFinanceDashboard} />
      <Route path="/users">
        <ProtectedRoute>
          <LazyPage>
            <LazyUsers />
          </LazyPage>
        </ProtectedRoute>
      </Route>


      <Route path="/cost-centers" component={CostCenters} />
      <Route path="/profile" component={Profile} />
      <Route path="/groups">
        <ProtectedRoute>
          <LazyPage>
            <LazyGroups />
          </LazyPage>
        </ProtectedRoute>
      </Route>
      <Route path="/workers">
        <ProtectedRoute>
          <LazyPage>
            <LazyWorkers />
          </LazyPage>
        </ProtectedRoute>
      </Route>
      <Route path="/workers/:id">
        <ProtectedRoute>
          <WorkerDetails />
        </ProtectedRoute>
      </Route>
      <Route path="/workers/:id/card" component={WorkerCard} />
      {/* Attendance System Routes */}
      <Route path="/attendance">
        <ProtectedRoute>
          <AttendanceScanner />
        </ProtectedRoute>
      </Route>
      <Route path="/attendance/log">
        <ProtectedRoute>
          <AttendanceLog />
        </ProtectedRoute>
      </Route>
      <Route path="/audit-log">
        <ProtectedRoute>
          <AuditLog />
        </ProtectedRoute>
      </Route>
      <Route path="/temporary-assignments">
        <ProtectedRoute>
          <TemporaryAssignments />
        </ProtectedRoute>
      </Route>
      <Route path="/operations/staffing">
        <ProtectedRoute>
          <Operations />
        </ProtectedRoute>
      </Route>
      <Route path="/operations/restaurants">
        <ProtectedRoute>
          <RestaurantsManagement />
        </ProtectedRoute>
      </Route>
      <Route path="/operations/cost-report">
        <ProtectedRoute>
          <RestaurantCostReport />
        </ProtectedRoute>
      </Route>
      <Route path="/backup">
        <ProtectedRoute>
          <Backup />
        </ProtectedRoute>
      </Route>
      <Route path="/migration">
        <ProtectedRoute>
          <Migration />
        </ProtectedRoute>
      </Route>
      <Route path="/db-console">
        <ProtectedRoute>
          <DatabaseConsole />
        </ProtectedRoute>
      </Route>
      <Route path="/financial-recalculation">
        <ProtectedRoute>
          <FinancialRecalculation />
        </ProtectedRoute>
      </Route>
      <Route path="/attendance/reports" component={AttendanceReports} />
      <Route path="/attendance/export" component={AttendanceExport} />
      <Route path="/attendance/daily-management">
        <ProtectedRoute>
          <DailyManagement />
        </ProtectedRoute>
      </Route>

      <Route path="/work-days" component={WorkDays} />
      <Route path="/operational-flags">
        <ProtectedRoute>
          <OperationalFlagsSimple />
        </ProtectedRoute>
      </Route>
      {/* Route removed: /pending-flags - using OperationalFlagsSimple instead */}
      {/* Finance System Routes */}
      <Route path="/finance/overrides" component={PayOverrides} />
      <Route path="/finance/entry">
        <ProtectedRoute>
          <FinanceEntry />
        </ProtectedRoute>
      </Route>
      <Route path="/payroll-management">
        <ProtectedRoute>
          <PayrollManagement />
        </ProtectedRoute>
      </Route>
      <Route path="/finance/payroll">
        <ProtectedRoute>
          <LazyPage>
            <LazyPayrollBatches />
          </LazyPage>
        </ProtectedRoute>
      </Route>
      <Route path="/finance/payroll/history">
        <ProtectedRoute>
          <PayrollBatchHistory />
        </ProtectedRoute>
      </Route>
      <Route path="/payroll/batches">
        <ProtectedRoute>
          <LazyPage>
            <LazyPayrollBatchList />
          </LazyPage>
        </ProtectedRoute>
      </Route>
      <Route path="/payroll/batches/coverage">
        <ProtectedRoute>
          <LazyPage>
            <LazyGroupCoverageReport />
          </LazyPage>
        </ProtectedRoute>
      </Route>
      <Route path="/payroll/batches/create">
        <ProtectedRoute>
          <LazyPage>
            <LazyPayrollBatchCreateSimple />
          </LazyPage>
        </ProtectedRoute>
      </Route>
      <Route path="/payroll/batches/:id">
        <ProtectedRoute>
          <LazyPage>
            <LazyPayrollBatchDetails />
          </LazyPage>
        </ProtectedRoute>
      </Route>
      <Route path="/payroll/batches/:id/accountant-review" component={AccountantReview} />
      <Route path="/payroll/batches/:id/financial-review" component={FinancialReview} />
      <Route path="/payroll/batches/:id/manager-review" component={AccountsManagerReview} />
      <Route path="/finance/reports">
        <ProtectedRoute>
          <FinancialReports />
        </ProtectedRoute>
      </Route>
      <Route path="/finance/cost-center-report">
        <ProtectedRoute>
          <CostCenterReport />
        </ProtectedRoute>
      </Route>
      <Route path="/finance/daily-payroll-report">
        <ProtectedRoute>
          <DailyPayrollReport />
        </ProtectedRoute>
      </Route>
      <Route path="/finance/payment-voucher">
        <ProtectedRoute>
          <PaymentVoucher />
        </ProtectedRoute>
      </Route>
      <Route path="/payroll-report" component={PayrollReport} />
      <Route path="/payroll/dashboard">
        <ProtectedRoute>
          <PayrollDashboard />
        </ProtectedRoute>
      </Route>

      <Route path="/schedules/weekly">
        <ProtectedRoute>
          <WeeklyShifts />
        </ProtectedRoute>
      </Route>
      <Route path="/backfill">
        <ProtectedRoute>
          <Backfill />
        </ProtectedRoute>
      </Route>
      <Route path="/operations">
        <ProtectedRoute>
          <OperationalDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/operations/notes-review">
        <ProtectedRoute>
          <OperationalNotesReview />
        </ProtectedRoute>
      </Route>
      <Route path="/operations/supervisor-performance">
        <ProtectedRoute>
          <SupervisorPerformance />
        </ProtectedRoute>
      </Route>
      <Route path="/punches/review">
        <ProtectedRoute>
          <PunchesReviewCenter />
        </ProtectedRoute>
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ThemeProvider defaultTheme="light" switchable>
          <TooltipProvider>
            <Toaster richColors position="top-center" />
            <AppWithLayout />
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

// الصفحات التي لا تحتاج Sidebar
const NO_SIDEBAR_PATHS = ['/', '/home', '/local-login', '/workers/'];

function AppWithLayout() {
  const [location] = useLocation();
  const noSidebar = location === '/' || location === '/home' || location === '/local-login' || location.endsWith('/card');
  
  if (noSidebar) {
    return <Router />;
  }
  
  return (
    <DashboardLayout>
      <Router />
    </DashboardLayout>
  );
}

export default App;
