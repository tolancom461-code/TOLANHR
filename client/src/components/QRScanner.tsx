import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Camera, 
  CameraOff, 
  RefreshCw,
  SwitchCamera,
  AlertCircle
} from 'lucide-react';
import jsQR from 'jsqr';

interface QRScannerProps {
  onScan: (result: string) => void;
  onError?: (error: string) => void;
  width?: number;
  height?: number;
}

export default function QRScanner({ 
  onScan, 
  onError,
  width = 300,
  height = 350 
}: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningIntervalRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const initializingRef = useRef(false);

  // QR Code decoder using jsQR library (imported as module)
  const decodeQRCode = (imageData: ImageData): string | null => {
    try {
      const code = jsQR(
        imageData.data,
        imageData.width,
        imageData.height,
        {
          inversionAttempts: 'dontInvert',
        }
      );
      if (code) {
        return code.data;
      }
    } catch (err) {
      console.error('QR decode error:', err);
    }
    return null;
  };

  useEffect(() => {
    mountedRef.current = true;

    // Initialize camera permission
    initializeCamera();

    return () => {
      mountedRef.current = false;
      stopScanning();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const initializeCamera = async () => {
    if (initializingRef.current) return;
    initializingRef.current = true;

    try {
      // Request camera permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      // Stop the stream temporarily
      stream.getTracks().forEach(track => track.stop());
      
      if (!mountedRef.current) return;
      
      // Get available cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      if (videoDevices.length > 0) {
        setCameras(videoDevices as MediaDeviceInfo[]);
        setHasPermission(true);
        
        // Prefer back camera
        const backCameraIndex = videoDevices.findIndex(
          (d) => d.label.toLowerCase().includes('back') || 
                 d.label.toLowerCase().includes('rear') ||
                 d.label.toLowerCase().includes('environment') ||
                 d.label.toLowerCase().includes('خلفية')
        );
        
        const selectedIndex = backCameraIndex !== -1 ? backCameraIndex : 0;
        setCurrentCameraIndex(selectedIndex);
        
        // Auto-start scanning
        setTimeout(() => {
          if (mountedRef.current) {
            startScanningWithCamera(videoDevices[selectedIndex].deviceId);
          }
        }, 500);
      } else {
        setHasPermission(false);
        setError('لم يتم العثور على كاميرا على هذا الجهاز');
      }
    } catch (err: any) {
      console.error('Camera initialization error:', err);
      
      if (!mountedRef.current) return;
      
      setHasPermission(false);
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('تم رفض الوصول للكاميرا. يرجى السماح بالوصول للكاميرا من إعدادات المتصفح');
      } else if (err.name === 'NotFoundError') {
        setError('لم يتم العثور على كاميرا على هذا الجهاز');
      } else if (err.name === 'NotReadableError') {
        setError('الكاميرا قيد الاستخدام من قبل تطبيق آخر. يرجى إغلاق التطبيقات الأخرى');
      } else {
        setError(`خطأ في الوصول للكاميرا: ${err.message || 'غير معروف'}`);
      }
      
      onError?.(error || 'Camera permission denied');
    } finally {
      initializingRef.current = false;
    }
  };

  const startScanningWithCamera = async (cameraId: string) => {
    try {
      setError(null);
      
      // Stop previous stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      // Get new stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: cameraId ? { exact: cameraId } : undefined,
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      streamRef.current = stream;

      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(err => {
          console.error('Video play error:', err);
          setError('فشل في تشغيل الفيديو');
        });
      }

      setIsScanning(true);

      // Start scanning loop
      startScanningLoop();
    } catch (err: any) {
      console.error('Scanner start error:', err);
      
      if (!mountedRef.current) return;
      
      let errorMsg = 'فشل في تشغيل الكاميرا';
      
      if (err.name === 'NotAllowedError') {
        errorMsg = 'تم رفض الوصول للكاميرا. يرجى السماح بالوصول من إعدادات المتصفح';
      } else if (err.name === 'NotReadableError') {
        errorMsg = 'الكاميرا قيد الاستخدام من قبل تطبيق آخر';
      } else if (err.name === 'OverconstrainedError') {
        errorMsg = 'إعدادات الكاميرا غير مدعومة. جرب كاميرا أخرى';
      } else if (err.message) {
        errorMsg = `خطأ: ${err.message}`;
      }
      
      setError(errorMsg);
      onError?.(errorMsg);
      setIsScanning(false);
    }
  };

  const startScanningLoop = () => {
    if (scanningIntervalRef.current) {
      clearInterval(scanningIntervalRef.current);
    }

    scanningIntervalRef.current = window.setInterval(() => {
      if (!videoRef.current || !canvasRef.current || !mountedRef.current) return;

      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) return;

        // Set canvas size to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Decode QR code
        const qrData = decodeQRCode(imageData);

        if (qrData) {
          console.log('QR Code detected:', qrData);
          onScan(qrData);
          stopScanning();
        }
      } catch (err) {
        console.error('Scanning error:', err);
      }
    }, 150); // Check every 150ms for better performance
  };

  const stopScanning = () => {
    if (scanningIntervalRef.current) {
      clearInterval(scanningIntervalRef.current);
      scanningIntervalRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.pause();
    }
    
    if (mountedRef.current) {
      setIsScanning(false);
    }
  };

  const switchCamera = async () => {
    if (cameras.length <= 1) return;
    
    stopScanning();
    
    const nextIndex = (currentCameraIndex + 1) % cameras.length;
    setCurrentCameraIndex(nextIndex);
    
    setTimeout(() => {
      if (mountedRef.current && cameras[nextIndex]) {
        startScanningWithCamera(cameras[nextIndex]?.deviceId || '');
      }
    }, 500);
  };

  const retryPermission = () => {
    initializingRef.current = false;
    setHasPermission(null);
    setError(null);
    setCameras([]);
    initializeCamera();
  };

  if (hasPermission === null) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <RefreshCw className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
          <p className="mt-2 text-muted-foreground">جاري طلب الوصول للكاميرا...</p>
          <p className="text-xs text-muted-foreground mt-1">
            يرجى السماح بالوصول للكاميرا عند ظهور الرسالة
          </p>
        </CardContent>
      </Card>
    );
  }

  if (hasPermission === false) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
          <p className="mt-2 text-destructive font-medium">لا يمكن الوصول للكاميرا</p>
          <p className="text-sm text-muted-foreground mt-2">
            {error || 'يرجى السماح بالوصول للكاميرا من إعدادات المتصفح'}
          </p>
          <div className="mt-4 space-y-2">
            <Button 
              variant="default" 
              onClick={retryPermission}
              className="w-full"
            >
              <RefreshCw className="h-4 w-4 ml-2" />
              إعادة المحاولة
            </Button>
            <div className="text-xs text-muted-foreground text-right p-3 bg-muted rounded-md">
              <p className="font-medium mb-2">خطوات الحل:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>اضغط على أيقونة القفل/الكاميرا في شريط العنوان</li>
                <li>اختر "السماح" للكاميرا</li>
                <li>أعد تحميل الصفحة أو اضغط "إعادة المحاولة"</li>
              </ol>
              <p className="mt-2 text-xs">
                <strong>ملاحظة:</strong> إذا كانت الكاميرا تعمل ولكن الشاشة سوداء، جرب:
              </p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>إغلاق التطبيقات الأخرى التي تستخدم الكاميرا</li>
                <li>تبديل الكاميرا (إذا كان لديك أكثر من كاميرا)</li>
                <li>إعادة تشغيل المتصفح</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Scanner Container */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div 
            className="relative bg-black"
            style={{ minHeight: height }}
          >
            {/* Video Element - Always visible when scanning */}
            <video 
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
              style={{ display: isScanning ? 'block' : 'none' }}
            />
            
            {/* Hidden Canvas for QR processing */}
            <canvas 
              ref={canvasRef}
              style={{ display: 'none' }}
            />
            
            {/* Placeholder when not scanning */}
            {!isScanning && (
              <div 
                className="absolute inset-0 flex flex-col items-center justify-center bg-muted"
              >
                <Camera className="h-16 w-16 text-muted-foreground opacity-50" />
                <p className="mt-4 text-muted-foreground">
                  {cameras.length > 0 ? 'اضغط على زر التشغيل لبدء المسح' : 'جاري تحميل الكاميرا...'}
                </p>
              </div>
            )}

            {/* Scanning Overlay */}
            {isScanning && (
              <div className="absolute inset-0 pointer-events-none">
                {/* Corner guides */}
                <div className="absolute top-12 left-12 w-12 h-12 border-t-2 border-l-2 border-green-500" />
                <div className="absolute top-12 right-12 w-12 h-12 border-t-2 border-r-2 border-green-500" />
                <div className="absolute bottom-12 left-12 w-12 h-12 border-b-2 border-l-2 border-green-500" />
                <div className="absolute bottom-12 right-12 w-12 h-12 border-b-2 border-r-2 border-green-500" />

                {/* Scanning line animation */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48">
                  <div className="absolute inset-0 border-2 border-green-500 opacity-30 rounded-lg" />
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-b from-green-500 to-transparent animate-pulse" 
                       style={{ animation: 'scan 2s infinite' }} />
                </div>

                {/* Center text */}
                <div className="absolute bottom-8 left-0 right-0 text-center text-white text-sm">
                  <p>وجه الكاميرا نحو رمز QR</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Control Buttons */}
      <div className="flex gap-2">
        {isScanning ? (
          <Button 
            variant="destructive" 
            onClick={stopScanning}
            className="flex-1"
          >
            <CameraOff className="h-4 w-4 ml-2" />
            إيقاف المسح
          </Button>
        ) : (
          <Button 
            variant="default" 
            onClick={() => startScanningWithCamera(cameras[currentCameraIndex]?.deviceId || '')}
            className="flex-1"
          >
            <Camera className="h-4 w-4 ml-2" />
            بدء المسح
          </Button>
        )}
        
        {cameras.length > 1 && (
          <Button 
            variant="outline" 
            onClick={switchCamera}
            disabled={isScanning}
            size="icon"
          >
            <SwitchCamera className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      <style>{`
        @keyframes scan {
          0% { top: 0; }
          50% { top: 100%; }
          100% { top: 0; }
        }
      `}</style>
    </div>
  );
}
