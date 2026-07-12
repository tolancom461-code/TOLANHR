import { useEffect, useState } from "react";
import { Bell, Check, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuHeader,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

export function NotificationBell() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  
  const { data: notifications = [] } = trpc.notifications.list.useQuery(undefined, {
    refetchInterval: 30000, // تحديث تلقائي كل 30 ثانية حتى تظهر الإشعارات الجديدة دون الحاجة لتحديث الصفحة
  });
  const { data: unreadCount = 0 } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30000,
  });
  
  const markAsRead = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    }
  });

  const markAllAsRead = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    }
  });



  const handleNotificationClick = (notification: any) => {
    if (!notification.isRead) {
      markAsRead.mutate({ id: notification.id });
    }
    if (notification.link) {
      setLocation(notification.link);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-lg hover:bg-accent"
        >
          <Bell className="h-5 w-5 text-slate-700 dark:text-slate-300" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 hover:bg-red-600 border-2 border-background"
            >
              {unreadCount > 9 ? '+9' : unreadCount}
            </Badge>
          )}
          <span className="sr-only">الإشعارات</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">الإشعارات</h3>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs h-8 text-teal-600 hover:text-teal-700 p-0"
              onClick={() => markAllAsRead.mutate()}
            >
              تعيين الكل كمقروء
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500 p-4">
              <Bell className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-sm">لا توجد إشعارات حالياً</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((n: any) => (
                <div
                  key={n.id}
                  className={`flex flex-col p-4 border-b last:border-0 cursor-pointer transition-colors hover:bg-accent/50 ${!n.isRead ? 'bg-teal-50/30 dark:bg-teal-900/10' : ''}`}
                  onClick={() => handleNotificationClick(n)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-sm font-bold ${
                      n.type === 'success' ? 'text-green-600' : 
                      n.type === 'error' ? 'text-red-600' : 
                      'text-teal-600'
                    }`}>
                      {n.title}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: ar })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-2">
                    {n.message}
                  </p>
                  {n.link && (
                    <div className="flex items-center text-[10px] text-teal-600 font-medium">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      عرض التفاصيل
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
