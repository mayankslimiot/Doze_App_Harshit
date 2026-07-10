import { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getUserProfile } from '@/services/deviceService';
import {
  LayoutDashboard,
  Bed,
  FileText,
  MessageSquare,
  Settings2,
  HelpCircle,
  Settings,
  LogOut,
} from 'lucide-react';
import logoImage from '@/assets/dozemate512.jpg';

export default function Sidebar() {
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const { data: profile } = useQuery<any>({
    queryKey: ['user_profile'],
    queryFn: getUserProfile,
    staleTime: 60000 * 5,
  });

  const isOtherOrg = profile?.account?.organizationId?.organizationType === 'other';

  const navItems = [
    { name: isOtherOrg ? 'User' : 'Patient', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Bed Overlay', path: '/devices', icon: Bed },
    { name: 'Reports', path: '/reports', icon: FileText },
    { name: 'Configuration', path: '/configuration', icon: Settings2 },
    { name: 'Support', path: '/support', icon: HelpCircle },
    { name: 'Feedback', path: '/feedback', icon: MessageSquare },
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.clear();
    navigate('/', { replace: true });
  };

  return (
    <div className="w-56 bg-white border-r border-gray-200 h-screen flex flex-col fixed left-0 top-0 z-50">
      {/* Logo */}
      <div className="p-6">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-gray-200 bg-white">
            <img src={logoImage} alt="dozemate" className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight leading-none">
              <span className="text-black">doze</span>
              <span className="text-primary">mate</span>
            </span>
            <span className="text-[10px] text-gray-500 font-medium mt-1">
              by <span className="text-black">slim</span>
              <span className="text-primary">iot</span>
            </span>
          </div>
        </div>
      </div>

      {/* New Session Button */}
      <div className="px-8 mb-6">
        <Link to="/sessions/new" className="w-full bg-[#0097b2] hover:bg-[#007b90] text-white flex items-center justify-center py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm">
          {isOtherOrg ? 'User Onboarding' : 'Patient Onboarding'}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center px-4 py-2.5 text-sm font-medium rounded-r-lg transition-colors border-l-4 ${isActive
                ? 'bg-primary/10 text-primary border-primary'
                : 'text-gray-600 border-transparent hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <item.icon
              className={`mr-3 h-5 w-5 flex-shrink-0 ${
                // React router active classes logic needs to access isActive state inside children typically,
                // but we can just let css inherit colors.
                ''
                }`}
              aria-hidden="true"
            />
            {item.name}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Links */}
      <div className="p-4 border-t border-gray-200 space-y-1">
        <Link to="/settings" className="flex items-center w-full px-4 py-2.5 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors">
          <Settings className="mr-3 h-5 w-5" />
          Settings
        </Link>
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="flex items-center w-full px-4 py-2.5 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <LogOut className="mr-3 h-5 w-5" />
          Logout
        </button>
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
    </div>
  );
}
