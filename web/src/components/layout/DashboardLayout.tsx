import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getUserProfile } from '@/services/deviceService';
import Sidebar from './Sidebar';
import Header from './Header';
import GlobalToast from '../common/GlobalToast';
import { connectWebSocket } from '@/services/websocketService';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const { data: profile, isLoading, error } = useQuery<any, Error>({
    queryKey: ['user_profile'],
    queryFn: getUserProfile,
    staleTime: 60000 * 5,
    retry: false,
  });

  const token = localStorage.getItem('token');

  useEffect(() => {
    if (token) {
      connectWebSocket();
    }
  }, [token]);



  useEffect(() => {
    if (error) {
      const errMsg = error.message || '';
      const isSessionEnd = 
        errMsg.includes('expired') || 
        errMsg.includes('suspended') || 
        errMsg.includes('period is over') ||
        errMsg.toLowerCase().includes('not found') ||
        errMsg.toLowerCase().includes('unauthorized') ||
        errMsg.toLowerCase().includes('access denied') ||
        errMsg.toLowerCase().includes('token');

      if (isSessionEnd) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.clear();
        navigate('/?reason=expired', { replace: true });
        return;
      }
    }
  }, [error, navigate]);

  useEffect(() => {
    if (!token) {
      navigate('/', { replace: true });
      return;
    }

    if (profile?.role === 'viewer') {
      const allowedPaths = ['/live', '/settings/account', '/dashboard'];
      const isAllowed = allowedPaths.some(p => location.pathname.startsWith(p)) ||
                        (location.pathname.startsWith('/sessions') && location.pathname !== '/sessions/new');
      if (!isAllowed) {
        navigate('/live', { replace: true });
      }
    }
  }, [profile, location.pathname, navigate, token]);

  if (!token) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
        <div className="text-4xl md:text-5xl font-bold tracking-tight wave-text flex">
          <span className="text-black">D</span>
          <span className="text-black">o</span>
          <span className="text-black">z</span>
          <span className="text-black">e</span>
          <span className="text-[#0097b2]">m</span>
          <span className="text-[#0097b2]">a</span>
          <span className="text-[#0097b2]">t</span>
          <span className="text-[#0097b2]">e</span>
        </div>
      </div>
    );
  }

  const isViewer = profile?.role === 'viewer';

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      <GlobalToast />
      {!isViewer && <Sidebar />}
      <div className={`flex-1 ${isViewer ? 'ml-0' : 'ml-56'} flex flex-col min-h-screen`}>
        <Header />
        <main className="flex-1 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
