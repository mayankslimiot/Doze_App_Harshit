import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead, type Notification } from '@/services/notificationService';
import { Bell, Check, Clock, AlertTriangle } from 'lucide-react';

export default function Notifications() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(50),
  });

  const markAsReadMutation = useMutation({
    mutationFn: markNotificationAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: markAllNotificationsAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(d);
  };

  return (
    <DashboardLayout>
      <div className="p-8 max-w-4xl mx-auto flex flex-col h-full min-h-[calc(100vh-73px)]">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
              <Bell className="w-8 h-8 mr-3 text-[#0097b2]" />
              Notifications
            </h1>
            <p className="text-gray-500 mt-2 text-sm">
              View and manage all system alerts and updates.
            </p>
          </div>
          
          {(data?.unreadCount ?? 0) > 0 && (
            <button 
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>Mark All as Read</span>
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex-1 flex justify-center items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0097b2]"></div>
          </div>
        ) : !data?.notifications?.length ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl border border-gray-200 p-12 shadow-sm">
            <div className="bg-gray-50 p-4 rounded-full mb-4">
              <Bell className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">No notifications</h3>
            <p className="text-gray-500 mt-1">You're all caught up!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.notifications.map((notification: Notification) => (
              <div 
                key={notification._id}
                className={`bg-white rounded-xl border p-5 shadow-sm transition-colors flex items-start space-x-4
                  ${notification.isRead ? 'border-gray-100 opacity-75' : 'border-[#0097b2]/30 bg-[#0097b2]/5'}`}
              >
                <div className={`p-2 rounded-full mt-1 ${notification.isRead ? 'bg-gray-100 text-gray-400' : 'bg-red-100 text-red-500'}`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h4 className={`text-base font-bold ${notification.isRead ? 'text-gray-700' : 'text-gray-900'}`}>
                      {notification.title}
                    </h4>
                    <span className="text-xs font-medium text-gray-400 flex items-center shrink-0 ml-4">
                      <Clock className="w-3 h-3 mr-1" />
                      {formatDate(notification.createdAt)}
                    </span>
                  </div>
                  
                  <p className={`mt-1 text-sm ${notification.isRead ? 'text-gray-500' : 'text-gray-700 font-medium'}`}>
                    {notification.message}
                  </p>
                </div>

                {!notification.isRead && (
                  <button
                    onClick={() => markAsReadMutation.mutate(notification._id)}
                    className="ml-4 p-2 text-gray-400 hover:text-[#0097b2] hover:bg-[#0097b2]/10 rounded-lg transition-colors tooltip-trigger relative group"
                    title="Mark as read"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
