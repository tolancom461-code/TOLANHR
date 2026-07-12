import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { 
  QrCode, 
  Keyboard, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  User,
  ArrowLeftCircle,
  ArrowRightCircle,
  Loader2,
  Camera,
  RefreshCw,
  Users,
  IdCard,
  Briefcase
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import QRScanner from '@/components/QRScanner';
import { getDeviceAndNetworkInfo } from '@/lib/deviceInfo';

export default function AttendanceScanner() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<'qr' | 'manual'>('qr');
  const [manualCode, setManualCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [workerData, setWorkerData] = useState<any>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const [cardDialog, setCardDialog] = useState<'present' | 'absent' | 'late' | null>(null);
  const [cardFilterGroupId, setCardFilterGroupId] = useState<number | undefined>();
  
  // Play success beep sound
  const playSuccessBeep = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Configure beep sound
      oscillator.frequency.value = 800; // Hz
      oscillator.type = 'sine';
      
      // Volume envelope
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      
      // Play
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.error('Failed to play beep:', error);
    }
  };
  
  const confirmAttendanceMutation = trpc.attendance.confirmAttendance.useMutation();
  const { data: stats, refetch: refetchStats } = trpc.attendance.stats.useQuery({});
  const { data: groupsData } = trpc.groups.list.useQuery();

  // Administrative day logic: before 5 AM Riyadh time belongs to previous day
  const _now = new Date();
  const _riyadhHour = parseInt(
    _now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh', hour: 'numeric', hour12: false })
  );
  const _adminDate = new Date(_now);
  if (_riyadhHour < 5) _adminDate.setDate(_adminDate.getDate() - 1);
  const todayStr = _adminDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
  const { data: presentWorkers } = trpc.operationalDashboard.getPresentWorkers.useQuery(
    { workDateStr: todayStr, groupId: cardFilterGroupId },
    { enabled: cardDialog === 'present' }
  );
  const { data: absentWorkers } = trpc.operationalDashboard.getAbsentWorkers.useQuery(
    { workDateStr: todayStr, groupId: cardFilterGroupId },
    { enabled: cardDialog === 'absent' }
  );
  const { data: lateWorkers } = trpc.operationalDashboard.getLateWorkers.useQuery(
    { workDateStr: todayStr, groupId: cardFilterGroupId },
    { enabled: cardDialog === 'late' }
  );

  const cardWorkers = cardDialog === 'present' ? presentWorkers : cardDialog === 'absent' ? absentWorkers : cardDialog === 'late' ? lateWorkers : [];
  const cardTitle = cardDialog === 'present' ? 'الحاضرون' : cardDialog === 'absent' ? 'الغائبون' : 'المتأخرون';
  const cardColor = cardDialog === 'present' ? 'text-green-600' : cardDialog === 'absent' ? 'text-red-600' : 'text-orange-600';
  
  // Focus on input when in manual mode
  useEffect(() => {
    if (mode === 'manual' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [mode]);
  
  const handleQRScan = async (qrData: string) => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    try {
      // Fetch worker data without recording using tRPC
      const result = await utils.attendance.getWorkerFromQR.fetch({ qrToken: qrData });
      
      setWorkerData(result);
      setShowConfirmDialog(true);
      
      // Play success beep
      playSuccessBeep();
      
      // Show success animation
      setShowSuccessAnimation(true);
      setTimeout(() => setShowSuccessAnimation(false), 1500);
      
    } catch (error: any) {
      toast.error(error.message || 'رمز QR غير صالح');
    } finally {
      setIsProcessing(false);
    }
  };
  
  // ✅ التعديل: الحارس يختار نوع البصمة بنفسه
  const handleConfirmAttendance = async (chosenEventType: 'check_in' | 'check_out') => {
    if (!workerData) return;
    
    setIsProcessing(true);
    try {
      const { ipAddress, deviceInfo } = await getDeviceAndNetworkInfo();
      
      const result = await confirmAttendanceMutation.mutateAsync({
        workerId: workerData.worker.id,
        ipAddress: ipAddress || undefined,
        deviceInfo,
        eventType: chosenEventType,
      });
      
      setLastResult({
        success: true,
        worker: workerData.worker,
        eventType: result.eventType,
        timestamp: new Date(),
      });
      
      setShowConfirmDialog(false);
      setShowSuccessDialog(true);
      refetchStats();
      
      const eventText = result.eventType === 'check_in' ? 'تسجيل حضور' : 'تسجيل انصراف';
      toast.success(`${eventText} - ${workerData.worker.fullName}`);
      
      // Play success beep
      playSuccessBeep();
      
      // Auto-close success dialog and reset
      setTimeout(() => {
        setShowSuccessDialog(false);
        setWorkerData(null);
        setLastResult(null);
      }, 3000);
      
    } catch (error: any) {
      const errorMessage = error.message || 'حدث خطأ أثناء التسجيل';
      
      if (errorMessage.includes('حركتين متتاليتين')) {
        toast.error(errorMessage, {
          duration: 5000,
          description: 'يجب الانتظار دقيقة كاملة بين البصمتين',
        });
      } else if (errorMessage.includes('متتالي') || errorMessage.includes('مسجل ك')) {
        toast.error(errorMessage, {
          duration: 5000,
          description: 'يجب تسجيل الحضور والانصراف بالترتيب',
        });
      } else {
        toast.error(errorMessage, {
          duration: 4000,
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleCancelConfirm = () => {
    setShowConfirmDialog(false);
    setWorkerData(null);
  };
  
  const getEventTypeLabel = (eventType: string) => {
    return eventType === 'check_in' ? 'حضور' : 'انصراف';
  };
  
  const getEventTypeIcon = (eventType: string) => {
    return eventType === 'check_in' ? (
      <ArrowRightCircle className="h-12 w-12 text-green-600" />
    ) : (
      <ArrowLeftCircle className="h-12 w-12 text-red-600" />
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center py-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            نظام تسجيل الحضور
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            مسح رمز QR أو إدخال الرمز اليدوي
          </p>
        </div>
        
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats?.totalWorkers || 0}</div>
              <div className="text-sm text-gray-500">إجمالي العمال</div>
            </CardContent>
          </Card>
          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur cursor-pointer hover:shadow-lg transition-shadow" onClick={() => { setCardDialog('present'); setCardFilterGroupId(undefined); }}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{stats?.presentToday || 0}</div>
              <div className="text-sm text-gray-500">حاضرون اليوم</div>
            </CardContent>
          </Card>
          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur cursor-pointer hover:shadow-lg transition-shadow" onClick={() => { setCardDialog('absent'); setCardFilterGroupId(undefined); }}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{stats?.absentToday || 0}</div>
              <div className="text-sm text-gray-500">غائبون</div>
            </CardContent>
          </Card>
          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur cursor-pointer hover:shadow-lg transition-shadow" onClick={() => { setCardDialog('late'); setCardFilterGroupId(undefined); }}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-orange-600">{stats?.lateToday || 0}</div>
              <div className="text-sm text-gray-500">متأخرون</div>
            </CardContent>
          </Card>
        </div>
        
        {/* Mode Selector */}
        <div className="flex justify-center gap-4">
          <Button
            variant={mode === 'qr' ? 'default' : 'outline'}
            size="lg"
            onClick={() => setMode('qr')}
            className="flex items-center gap-2"
          >
            <Camera className="h-5 w-5" />
            مسح QR بالكاميرا
          </Button>
          <Button
            variant={mode === 'manual' ? 'default' : 'outline'}
            size="lg"
            onClick={() => setMode('manual')}
            className="flex items-center gap-2"
          >
            <Keyboard className="h-5 w-5" />
            إدخال يدوي
          </Button>
        </div>
        
        {/* Scanner Area */}
        <Card className="bg-white dark:bg-gray-800 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 justify-center">
              {mode === 'qr' ? (
                <>
                  <Camera className="h-6 w-6" />
                  ماسح رمز QR
                </>
              ) : (
                <>
                  <Keyboard className="h-6 w-6" />
                  إدخال يدوي
                </>
              )}
            </CardTitle>
            <CardDescription className="text-center">
              {mode === 'qr' 
                ? 'وجّه الكاميرا نحو رمز QR الخاص بالعامل'
                : 'أدخل رمز العامل يدوياً'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mode === 'qr' ? (
                <>
                  {/* QR Scanner Component */}
                  <div className="relative">
                    <QRScanner 
                      key="qr-scanner"
                      onScan={handleQRScan}
                      onError={(error) => toast.error(error)}
                      height={350}
                    />
                    
                    {/* Success Animation Overlay */}
                    {showSuccessAnimation && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-lg z-50 animate-in fade-in duration-200">
                        <div className="animate-in zoom-in duration-500">
                          <CheckCircle2 className="h-32 w-32 text-green-500 drop-shadow-2xl animate-pulse" strokeWidth={3} />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Processing Indicator */}
                  {isProcessing && !showConfirmDialog && (
                    <div className="flex items-center justify-center gap-2 py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="text-muted-foreground">جاري معالجة الرمز...</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Manual Input */}
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        ref={inputRef}
                        type="text"
                        placeholder="أدخل رمز العامل (مثل: re)"
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && manualCode.trim()) {
                            handleQRScan(`WRK-${manualCode.trim()}-${Date.now()}`);
                            setManualCode('');
                          }
                        }}
                        className="flex-1 text-lg"
                        disabled={isProcessing}
                      />
                      <Button
                        onClick={() => {
                          if (manualCode.trim()) {
                            handleQRScan(`WRK-${manualCode.trim()}-${Date.now()}`);
                            setManualCode('');
                          }
                        }}
                        disabled={!manualCode.trim() || isProcessing}
                        size="lg"
                      >
                        {isProcessing ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          'تأكيد'
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground text-center">
                      أدخل رمز العامل الموجود على بطاقته
                    </p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">تسجيل بصمة</DialogTitle>
            <DialogDescription className="text-center">
              يرجى التحقق من بيانات العامل ثم اختر نوع البصمة
            </DialogDescription>
          </DialogHeader>
          
          {workerData && (
            <div className="space-y-6 py-4">

              {/* Worker Info */}
              <div className="space-y-4 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-gray-500" />
                  <div>
                    <div className="text-sm text-gray-500">اسم العامل</div>
                    <div className="font-semibold text-lg">{workerData.worker.fullName}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <IdCard className="h-5 w-5 text-gray-500" />
                  <div>
                    <div className="text-sm text-gray-500">رقم الهوية</div>
                    <div className="font-semibold">{workerData.worker.nationalId || workerData.worker.code}</div>
                  </div>
                </div>
                
                {workerData.worker.groupName && (
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-gray-500" />
                    <div>
                      <div className="text-sm text-gray-500">المجموعة</div>
                      <div className="font-semibold">{workerData.worker.groupName}</div>
                    </div>
                  </div>
                )}
                
                {workerData.worker.jobTitle && (
                  <div className="flex items-center gap-3">
                    <Briefcase className="h-5 w-5 text-gray-500" />
                    <div>
                      <div className="text-sm text-gray-500">المسمى الوظيفي</div>
                      <div className="font-semibold">{workerData.worker.jobTitle}</div>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-gray-500" />
                  <div>
                    <div className="text-sm text-gray-500">الوقت الحالي</div>
                    <div className="font-semibold">{new Date().toLocaleTimeString('ar-SA')}</div>
                  </div>
                </div>
              </div>
              
              {/* Today's Events */}
              {workerData.todayEvents && workerData.todayEvents.length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                  <div className="text-sm font-semibold mb-2">سجل اليوم:</div>
                  <div className="space-y-1 text-sm">
                    {workerData.todayEvents.map((event: any, index: number) => {
                        const eventDate = event.eventTime || event.timestamp;
                        const dateObj = typeof eventDate === 'string' ? new Date(eventDate) : eventDate;
                        const timeStr = isNaN(dateObj.getTime()) ? 'Invalid Date' : dateObj.toLocaleTimeString('ar-SA');
                        return (
                          <div key={index} className="flex justify-between">
                            <span>{event.eventType === 'check_in' ? '✓ حضور' : '✗ انصراف'}</span>
                            <span>{timeStr}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
              
              {/* ✅ زر دخول أخضر + زر خروج أحمر */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  size="lg"
                  className="w-full bg-green-600 hover:bg-green-700 text-white text-lg py-6"
                  onClick={() => handleConfirmAttendance('check_in')}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="h-5 w-5 animate-spin ml-2" />
                  ) : (
                    <ArrowRightCircle className="h-6 w-6 ml-2" />
                  )}
                  دخول
                </Button>
                <Button
                  size="lg"
                  className="w-full bg-red-600 hover:bg-red-700 text-white text-lg py-6"
                  onClick={() => handleConfirmAttendance('check_out')}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="h-5 w-5 animate-spin ml-2" />
                  ) : (
                    <ArrowLeftCircle className="h-6 w-6 ml-2" />
                  )}
                  خروج
                </Button>
              </div>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={handleCancelConfirm}
                disabled={isProcessing}
              >
                <XCircle className="h-5 w-5 ml-2" />
                إلغاء
              </Button>

            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Card Details Dialog */}
      <Dialog open={!!cardDialog} onOpenChange={(open) => { if (!open) setCardDialog(null); }}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className={`text-center text-xl ${cardColor}`}>
              {cardTitle} - {(cardWorkers || []).length} عامل
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select
              value={cardFilterGroupId ? String(cardFilterGroupId) : "all"}
              onValueChange={(v) => setCardFilterGroupId(v === "all" ? undefined : Number(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="كل المجموعات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المجموعات</SelectItem>
                {groupsData?.map((g: any) => (
                  <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ScrollArea className="h-[350px] rounded-md border p-3">
              {(cardWorkers || []).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>لا يوجد عمال</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(cardWorkers || []).map((w: any) => (
                    <div key={w.workerId} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">{w.workerName}</span>
                          <span className="font-mono text-xs text-muted-foreground">{w.workerCode}</span>
                        </div>
                      </div>
                      {cardDialog === 'present' && (
                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex flex-col items-center">
                            <span className="text-muted-foreground">حضور</span>
                            <span className="font-mono font-medium text-green-600">
                              {w.checkInTime
                                ? new Date(w.checkInTime).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
                                : '—'}
                            </span>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-muted-foreground">انصراف</span>
                            <span className={`font-mono font-medium ${w.checkOutTime ? 'text-blue-600' : 'text-orange-500'}`}>
                              {w.checkOutTime
                                ? new Date(w.checkOutTime).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
                                : 'لم ينصرف بعد'}
                            </span>
                          </div>
                        </div>
                      )}
                      {cardDialog !== 'present' && (
                        <span className="font-mono text-sm text-muted-foreground">{w.workerCode}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center space-y-4 py-6">
            <div className="flex justify-center">
              <CheckCircle2 className="h-20 w-20 text-green-500 animate-pulse" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-green-600 mb-2">
                تم التسجيل بنجاح!
              </h3>
              {lastResult && (
                <>
                  <p className="text-lg font-semibold">{lastResult.worker?.fullName}</p>
                  <p className="text-muted-foreground">
                    {lastResult.eventType === 'check_in' ? 'تسجيل حضور' : 'تسجيل انصراف'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {new Date().toLocaleTimeString('ar-SA')}
                  </p>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
