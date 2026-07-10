import { useEffect, useState } from 'react';
import { addNotificationHandler, removeNotificationHandler } from '@/services/websocketService';
import { Bell, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface ToastItem {
  id: string;
  title: string;
  message: string;
}

export default function GlobalToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const queryClient = useQueryClient();

  // Request browser Notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const triggerToast = (title: string, message: string) => {
    // Invalidate queries to update bell icon badge
    queryClient.invalidateQueries({ queryKey: ['notifications'] });

    const toastId = Math.random().toString(36).substr(2, 9);
    const newToast: ToastItem = {
      id: toastId,
      title: title || 'Alert',
      message: message
    };

    setToasts((current) => {
      const isDuplicate = current.some(t => t.title === newToast.title && t.message === newToast.message);
      if (isDuplicate) return current;
      
      // Trigger native browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new window.Notification(newToast.title, {
            body: newToast.message,
            icon: '/admin/favicon.ico'
          });
        } catch (e) {
          console.error('Failed to trigger native notification:', e);
        }
      }

      return [...current, newToast];
    });

    // Auto dismiss after 10 seconds
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== toastId));
    }, 10000);
  };

  useEffect(() => {
    // Handle socket notifications
    const handleNewNotification = (notification: any) => {
      triggerToast(notification.title, notification.message);
    };

    // Handle local notification events (custom event dispatcher fallback)
    const handleLocalNotification = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { title, message } = customEvent.detail || {};
      if (title || message) {
        triggerToast(title, message);
      }
    };

    addNotificationHandler(handleNewNotification);
    window.addEventListener('local_notification', handleLocalNotification);
    
    return () => {
      removeNotificationHandler(handleNewNotification);
      window.removeEventListener('local_notification', handleLocalNotification);
    };
  }, [queryClient]);

  const handleDismiss = (id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
      <div className="fixed top-20 right-6 z-[100] flex flex-col space-y-3 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div 
            key={toast.id}
            className="relative bg-white border-l-4 border-[#007b90] shadow-xl rounded-lg p-4 pb-5 flex items-start space-x-3 pointer-events-auto overflow-hidden animate-in slide-in-from-top-4 fade-in duration-300"
          >
            <div className="flex-shrink-0">
              <Bell className="w-6 h-6 text-[#007b90]" />
            </div>
            <div className="flex-1 pt-0.5">
              <p className="text-sm font-bold text-gray-900">{toast.title}</p>
              <p className="mt-1 text-sm text-gray-600 leading-snug">{toast.message}</p>
            </div>
            <button 
              onClick={() => handleDismiss(toast.id)}
              className="flex-shrink-0 ml-4 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* 10s shrinking progress timer bar */}
            <div className="absolute bottom-0 left-0 w-full h-1 bg-gray-100">
              <div 
                className="h-full bg-[#007b90]" 
                style={{ animation: 'shrink 10s linear forwards' }}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
