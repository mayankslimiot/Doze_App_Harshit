import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead, type Notification } from '@/services/notificationService';
import { Bell, Check, Clock, AlertTriangle, Building2, MonitorSmartphone } from 'lucide-react';

export default function AdminNotificationsView() {
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
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1 flex items-center">
            <Bell className="w-7 h-7 mr-2.5 text-[#007b90]" />
            Global Notifications
          </h2>
          <p className="text-sm text-gray-500">
            View and manage system alerts and updates across all organizations.
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
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#007b90]"></div>
        </div>
      ) : !data?.notifications?.length ? (
        <div className="flex flex-col items-center justify-center bg-white rounded-xl border border-gray-200 p-12 shadow-sm">
          <div className="bg-gray-50 p-4 rounded-full mb-4">
            <Bell className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">No notifications</h3>
          <p className="text-sm text-gray-500 mt-1">System is healthy and all caught up!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.notifications.map((notification: Notification) => (
            <div 
              key={notification._id}
              className={`bg-white rounded-xl border p-5 shadow-sm transition-colors flex items-start space-x-4
                ${notification.isRead ? 'border-gray-100 opacity-75' : 'border-[#007b90]/30 bg-[#007b90]/5'}`}
            >
              <div className={`p-2 rounded-full mt-1 ${notification.isRead ? 'bg-gray-100 text-gray-400' : 'bg-red-100 text-red-500'}`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start flex-wrap gap-2">
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

                {/* Meta details for super admin */}
                <div className="flex items-center space-x-4 mt-3 text-xs text-gray-500">
                  {notification.organizationId && (
                    <span className="flex items-center bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                      <Building2 className="w-3.5 h-3.5 mr-1 text-gray-400" />
                      Org ID: <strong className="ml-1 text-gray-700">{notification.organizationId}</strong>
                    </span>
                  )}
                  {notification.deviceId && (
                    <span className="flex items-center bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                      <MonitorSmartphone className="w-3.5 h-3.5 mr-1 text-gray-400" />
                      Device: <strong className="ml-1 text-gray-700">{notification.deviceId}</strong>
                    </span>
                  )}
                </div>
              </div>

              {!notification.isRead && (
                <button
                  onClick={() => markAsReadMutation.mutate(notification._id)}
                  className="ml-4 p-2 text-gray-400 hover:text-[#007b90] hover:bg-[#007b90]/10 rounded-lg transition-colors tooltip-trigger relative group"
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
  );
}
