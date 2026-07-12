import { useState, useEffect } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";

export function PushNotificationToggle({ iconOnly = false }: { iconOnly?: boolean } = {}) {

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const getVapidKey = trpc.notifications.getVapidPublicKey.useQuery();
  const saveSubscription = trpc.notifications.savePushSubscription.useMutation();

  useEffect(() => {
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setIsLoading(false);
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error("Error checking push subscription:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleNotifications = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      if (isSubscribed) {
        // Unsubscribe
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
          setIsSubscribed(false);
          toast.success("تم إيقاف الإشعارات", {
            description: "لن تتلقى تنبيهات على هذا الجهاز بعد الآن.",
          });
        }
      } else {
        // Subscribe
        if (getVapidKey.isLoading) {
          // Key is still being fetched from the server; wait briefly and retry once
          await getVapidKey.refetch();
        }

        if (!getVapidKey.data) {
          toast.error("الإشعارات الفورية غير مفعّلة", {
            description: "لم يتم إعداد مفاتيح VAPID على الخادم بعد. يرجى التواصل مع مسؤول النظام لتفعيل هذه الميزة.",
          });
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          toast.error("تم رفض الإذن", {
            description: "يرجى تفعيل إذن الإشعارات من إعدادات المتصفح.",
          });
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: getVapidKey.data
        });

        const subJSON = subscription.toJSON();
        if (subJSON.endpoint && subJSON.keys?.p256dh && subJSON.keys?.auth) {
          await saveSubscription.mutateAsync({
            endpoint: subJSON.endpoint,
            keys: {
              p256dh: subJSON.keys.p256dh,
              auth: subJSON.keys.auth
            }
          });
          setIsSubscribed(true);
          toast.success("تم تفعيل الإشعارات بنجاح! 🔔", {
            description: "ستصلك تنبيهات بخصوص حالة دفعات الرواتب مباشرة على جهازك.",
          });
        }
      }
    } catch (error) {
      console.error("Error toggling notifications:", error);
      toast.error("خطأ في الإعداد", {
        description: "حدث خطأ أثناء محاولة تحديث إعدادات الإشعارات.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size={iconOnly ? "icon" : "sm"}
          onClick={toggleNotifications}
          disabled={isLoading}
          className={
            iconOnly
              ? `h-9 w-9 rounded-lg transition-colors ${
                  isSubscribed
                    ? "text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20"
                    : "text-slate-500 hover:bg-accent"
                }`
              : `h-9 gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors ${
                  isSubscribed
                    ? "text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20"
                    : "text-slate-500 hover:bg-accent"
                }`
          }
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isSubscribed ? (
            <BellRing className="h-4 w-4" />
          ) : (
            <BellOff className="h-4 w-4" />
          )}
          {iconOnly ? (
            <span className="sr-only">{isSubscribed ? "مفعلة" : "تفعيل"}</span>
          ) : (
            <span>{isSubscribed ? "مفعلة" : "تفعيل"}</span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{isSubscribed ? "إيقاف إشعارات النظام" : "تفعيل إشعارات النظام الحقيقية"}</p>
      </TooltipContent>
    </Tooltip>
  );
}
