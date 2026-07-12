import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building2, Users, Clock, BarChart3, Shield, Zap, LogOut } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { useLocation } from 'wouter';
import { useLanguage } from '@/contexts/LanguageContext';


export default function LandingPage() {
  const [, setLocation] = useLocation();
  const { t, toggleLanguage, language } = useLanguage();
  // Get user data directly from trpc
  const { data: user } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast.success(t.login.logoutSuccess);
      window.location.href = '/';
    },
  });
  
  const handleLogout = () => {
    logoutMutation.mutate();
  };
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loginMutation = trpc.auth.localLogin.useMutation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      toast.error(t.login.emptyFields);
      return;
    }

    setIsLoading(true);
    try {
      await loginMutation.mutateAsync({ username, password, rememberMe });
      toast.success(t.login.loginSuccess);
      setShowLoginDialog(false);
      
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 500);
    } catch (error: any) {
      toast.error(error.message || t.login.loginError);
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    {
      icon: Users,
      title: t.landing.features.attendance.title,
      description: t.landing.features.attendance.description,
    },
    {
      icon: Clock,
      title: t.landing.features.payroll.title,
      description: t.landing.features.payroll.description,
    },
    {
      icon: BarChart3,
      title: t.landing.features.reports.title,
      description: t.landing.features.reports.description,
    },
    {
      icon: Building2,
      title: t.landing.features.security.title,
      description: t.landing.features.security.description,
    },
    {
      icon: Shield,
      title: t.landing.features.realtime.title,
      description: t.landing.features.realtime.description,
    },
    {
      icon: Zap,
      title: t.landing.features.mobile.title,
      description: t.landing.features.mobile.description,
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">TolanWorkforce</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t.landing.systemTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Language Toggle */}
            <Button variant="ghost" size="sm" onClick={toggleLanguage} className="text-sm">
              🌐 {t.general.switchLanguage}
            </Button>
            {user ? (
              <div className="flex items-center gap-3">
                <span className="hidden md:inline text-sm text-gray-600 dark:text-gray-300">
                  {user.fullName}
                </span>
                <Button
                  variant="outline"
                  onClick={handleLogout}
                  size="lg"
                  className="flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  {t.general.logout}
                </Button>
                <Button onClick={() => setLocation('/dashboard')} size="lg">
                  {t.navItems.home}
                </Button>
              </div>
            ) : (
              <Button onClick={() => setShowLoginDialog(true)} size="lg">
                {t.login.submit}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white leading-tight">
            {t.landing.systemTitle}
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
              {t.landing.systemSubtitle}
            </span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 leading-relaxed">
            {t.landing.systemDescription}
          </p>
          <div className="flex gap-4 justify-center pt-4">
            <Button onClick={() => setShowLoginDialog(true)} size="lg" className="text-lg px-8 py-6">
              {t.landing.startNow}
            </Button>
            <Button variant="outline" size="lg" className="text-lg px-8 py-6">
              {t.landing.learnMore}
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            {t.landing.featuresTitle}
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            {t.landing.featuresSubtitle}
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card key={index} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription className="text-base leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-600 py-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 text-center text-white">
            <div>
              <div className="text-5xl font-bold mb-2">99.9%</div>
              <div className="text-lg opacity-90">{t.landing.uptime}</div>
            </div>
            <div>
              <div className="text-5xl font-bold mb-2">24/7</div>
              <div className="text-lg opacity-90">{t.landing.support}</div>
            </div>
            <div>
              <div className="text-5xl font-bold mb-2">100%</div>
              <div className="text-lg opacity-90">{t.landing.dataSecurity}</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-4xl font-bold text-gray-900 dark:text-white">
            {t.landing.readyToStart}
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            {t.landing.readyDesc}
          </p>
          <Button onClick={() => setShowLoginDialog(true)} size="lg" className="text-lg px-8 py-6">
            {t.landing.loginNow}
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-gray-50 dark:bg-gray-900 py-8">
        <div className="container mx-auto px-4 text-center text-gray-600 dark:text-gray-400">
          <p>{t.landing.allRightsReserved}</p>
        </div>
      </footer>

      {/* Login Dialog */}
      <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl">{t.login.title}</DialogTitle>
            <DialogDescription>
              {t.login.description}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLogin} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t.login.username}</Label>
              <Input
                id="username"
                type="text"
                placeholder={t.login.usernamePlaceholder}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t.login.password}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t.login.passwordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="flex items-center space-x-2 space-x-reverse">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isLoading}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor="rememberMe" className="text-sm font-normal cursor-pointer">
                {t.login.rememberMe}
              </Label>
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
              {isLoading ? t.login.loading : t.login.submit}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
