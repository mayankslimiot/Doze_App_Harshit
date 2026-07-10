import { useState } from 'react';
import { Bell, LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getUserProfile } from '@/services/deviceService';
import { getNotifications } from '@/services/notificationService';
import { apiUrl } from '@/services/api';
import logoImage from '@/assets/dozemate512.jpg';

export default function Header() {
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['user_profile'],
    queryFn: getUserProfile,
    staleTime: 60000 * 5, // 5 minutes
  });

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(1), // Just need the unreadCount
    enabled: !!localStorage.getItem('token'),
  });

  const isViewer = profile?.role === 'viewer';
  const firstName = profile?.name ? profile.name.split(' ')[0] : (isViewer ? 'Viewer' : 'Admin');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.clear();
    navigate('/', { replace: true });
  };

  const isOtherOrg = profile?.account?.organizationId?.organizationType === 'other';

  return (
    <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center w-1/3 space-x-3">
        {isViewer && (
          <div className="flex items-center space-x-2 mr-3 shrink-0">
            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-gray-200 bg-white">
              <img src={logoImage} alt="dozemate" className="w-full h-full object-cover" />
            </div>
            <span className="text-lg font-bold tracking-tight leading-none">
              <span className="text-black">doze</span>
              <span className="text-primary">mate</span>
            </span>
          </div>
        )}
        <div className="flex items-center space-x-3 shrink-0 mr-6">
          {isViewer ? (
            <h1 className="text-xl font-bold text-[#0097b2]">Live Monitoring</h1>
          ) : (profile?.role === 'admin' && profile?.account?.organizationId?.name) ? (
            <Link to="/settings/organization" className="flex items-center space-x-3 group hover:opacity-95 transition-opacity">
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 shadow-sm overflow-hidden"
                style={{ 
                  backgroundColor: profile.account.organizationId.accentColor || '#007b90',
                  color: '#ffffff'
                }}
              >
                {profile.account.organizationId.logo && !profile.account.organizationId.logo.includes('default-org-logo.png') ? (
                  <img src={apiUrl(profile.account.organizationId.logo)} alt={profile.account.organizationId.name} className="w-full h-full object-contain bg-white p-0.5" />
                ) : (
                  profile.account.organizationId.name.charAt(0).toUpperCase()
                )}
              </div>
              <h1 className="text-xl font-bold text-[#0097b2] group-hover:text-[#007b90] transition-colors">
                {profile.account.organizationId.name}
              </h1>
            </Link>
          ) : (
            <h1 className="text-xl font-bold text-[#0097b2]">Dashboard</h1>
          )}
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <Link to="/dashboard" className="text-sm font-bold text-gray-500 hover:text-[#0097b2] transition-colors bg-gray-100 hover:bg-teal-50 px-3 py-1 rounded-full">
            {isOtherOrg ? 'User' : 'Patient'}
          </Link>
          <Link to="/live" className="text-sm font-bold text-gray-500 hover:text-[#0097b2] transition-colors bg-gray-100 hover:bg-teal-50 px-3 py-1 rounded-full">
            View All Live
          </Link>
        </div>
      </div>

      <div className="flex-1 flex px-6 max-w-2xl mx-auto">
        {/* Search removed as requested */}
      </div>

      <div className="flex items-center justify-end w-1/3 space-x-5">
        {!isViewer && (
          <Link to="/notifications" className="relative cursor-pointer group">
            <Bell className="w-5 h-5 text-gray-500 group-hover:text-gray-700 transition-colors" />
            {(notifData?.unreadCount ?? 0) > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 rounded-full border border-white text-[10px] font-bold text-white flex items-center justify-center shadow-sm">
                {(notifData?.unreadCount ?? 0) > 99 ? '99+' : notifData?.unreadCount}
              </span>
            )}
          </Link>
        )}
        
        <div className="flex items-center space-x-4 pl-4 border-l border-gray-200">
          <Link to="/settings/account" className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity">
            {profile?.profileImage && !profile.profileImage.includes('default') ? (
              <img 
                src={apiUrl(profile.profileImage)} 
                alt={firstName} 
                className="w-8 h-8 rounded-full object-cover shadow-sm border border-gray-200"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#0097b2] flex items-center justify-center text-white text-xs font-bold shadow-sm">
                MA
              </div>
            )}
            <span className="text-sm font-bold text-gray-700">{firstName}</span>
          </Link>
        </div>

        {isViewer && (
          <button 
            onClick={() => setShowLogoutConfirm(true)}
            title="Logout"
            className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors shadow-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        )}
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 border border-gray-100">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Logout</h3>
            <p className="text-sm text-gray-500 mb-6">Are you sure you want to end your session?</p>
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setShowLogoutConfirm(false)}
                className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 rounded-lg transition-colors border border-gray-200 shadow-sm"
              >
                Cancel
              </button>
              <button 
                onClick={handleLogout}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
