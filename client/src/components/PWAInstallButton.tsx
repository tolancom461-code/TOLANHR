import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __pwaInstallEvent: BeforeInstallPromptEvent | null;
  }
}

export function PWAInstallButton({ iconOnly = false }: { iconOnly?: boolean } = {}) {
  // ✅ نقرأ الحدث من المتغير العام الذي يُلتقط مبكرًا في index.html
  // (قبل أن يُحمَّل React وقبل تسجيل الدخول)، بدل الاعتماد فقط على
  // useEffect هذا المكوّن الذي قد يُركَّب بعد فوات حدث beforeinstallprompt.
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => window.__pwaInstallEvent ?? null
  );
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 1. Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    // 2. إذا كان الحدث قد التُقط بالفعل (قبل تركيب هذا المكوّن) نأخذه فورًا
    if (window.__pwaInstallEvent) {
      setInstallPrompt(window.__pwaInstallEvent);
    }

    // 3. نستمع أيضًا لإشعار "pwa-install-available" المُطلَق من السكربت المبكر
    //    في حال وصل الحدث بعد تركيب المكوّن
    const availableHandler = () => {
      setInstallPrompt(window.__pwaInstallEvent);
    };
    window.addEventListener("pwa-install-available", availableHandler);

    // 4. كحماية إضافية، نستمع مباشرة أيضًا (للمتصفحات/الحالات النادرة التي
    //    قد يتأخر فيها تحميل سكربت index.html المبكر عن هذا المكوّن)
    const directHandler = (e: Event) => {
      e.preventDefault();
      const evt = e as BeforeInstallPromptEvent;
      window.__pwaInstallEvent = evt;
      setInstallPrompt(evt);
    };
    window.addEventListener("beforeinstallprompt", directHandler);

    // 5. الاستماع لنجاح التثبيت
    const appInstalledHandler = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("appinstalled", appInstalledHandler);
    window.addEventListener("pwa-install-done", appInstalledHandler);

    return () => {
      window.removeEventListener("pwa-install-available", availableHandler);
      window.removeEventListener("beforeinstallprompt", directHandler);
      window.removeEventListener("appinstalled", appInstalledHandler);
      window.removeEventListener("pwa-install-done", appInstalledHandler);
    };
  }, []);

  const handleInstall = async () => {
    const promptEvent = installPrompt ?? window.__pwaInstallEvent;

    if (!promptEvent) {
      // Fallback for browsers that don't support beforeinstallprompt (like Safari)
      if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !(window.navigator as any).standalone) {
        alert("لتثبيت التطبيق على iPhone: اضغط على زر 'مشاركة' ثم اختر 'إضافة للشاشة الرئيسية'");
      } else {
        alert("تثبيت التطبيق متاح عبر قائمة المتصفح (Install App)\n\nإذا كان لديك أيقونة تثبيت في شريط عنوان المتصفح، يمكنك استخدامها مباشرة. وإلا فقد تكون قمت بتثبيت التطبيق مسبقًا أو رفضت التثبيت سابقًا، وبعض المتصفحات لا تُظهر الطلب مجددًا لفترة.");
      }
      return;
    }

    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === "accepted") {
        window.__pwaInstallEvent = null;
        setInstallPrompt(null);
        setIsInstalled(true);
      }
    } catch (err) {
      console.error("Error during PWA installation:", err);
    }
  };

  // Hide button if already installed
  if (isInstalled) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size={iconOnly ? "icon" : "sm"}
          onClick={handleInstall}
          className={
            iconOnly
              ? "h-9 w-9 rounded-lg hover:bg-accent text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300"
              : "h-9 gap-1.5 rounded-lg hover:bg-accent px-2 text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300"
          }
        >
          <Download className="h-4 w-4" />
          {iconOnly ? (
            <span className="sr-only">تثبيت</span>
          ) : (
            <span>تثبيت</span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>تثبيت التطبيق على جهازك</p>
      </TooltipContent>
    </Tooltip>
  );
}
