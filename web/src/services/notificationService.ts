import { apiUrl } from './api';

export interface Notification {
  _id: string;
  organizationId: string;
  deviceId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

export const getNotifications = async (limit: number = 50): Promise<NotificationsResponse> => {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl(`/api/notifications?limit=${limit}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
};

export const markNotificationAsRead = async (id: string): Promise<void> => {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl(`/api/notifications/${id}/read`), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to mark as read');
};

export const markAllNotificationsAsRead = async (): Promise<void> => {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl('/api/notifications/read-all'), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to mark all as read');
};
