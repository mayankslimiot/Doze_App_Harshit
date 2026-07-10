import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Building2,
  MonitorSmartphone,
  Users,
  Activity,
  LogOut,
  Bell,
  MoreVertical,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Signal,
  MapPin,
  Archive,
  MessageSquare,
  Stethoscope
} from 'lucide-react';
import logoImage from '@/assets/dozemate512.jpg';
import AdminHospitalsView from '@/components/admin/AdminHospitalsView';
import AdminProvisionHospitalView from '@/components/admin/AdminProvisionHospitalView';
import AdminHospitalDetailView from '@/components/admin/AdminHospitalDetailView';
import AdminPatientDetailView from '@/components/admin/AdminPatientDetailView';
import AdminDevicesView from '@/components/admin/AdminDevicesView';
import AdminAppUsersView from '@/components/admin/AdminAppUsersView';
import AdminTrashView from '@/components/admin/AdminTrashView';
import AdminProfileView from '@/components/admin/AdminProfileView';
import AdminFeedbacksView from '@/components/admin/AdminFeedbacksView';
import { useQuery } from '@tanstack/react-query';
import { getUserProfile } from '@/services/deviceService';
import { apiUrl } from '@/services/api';
import AdminNotificationsView from '@/components/admin/AdminNotificationsView';
import { getNotifications } from '@/services/notificationService';
import GlobalToast from '@/components/common/GlobalToast';
import { connectWebSocket } from '@/services/websocketService';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('hospitals');
  const [selectedHospital, setSelectedHospital] = useState<any>(null);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['user_profile'],
    queryFn: getUserProfile,
    staleTime: 60000 * 5,
  });

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(1),
    enabled: !!localStorage.getItem('token'),
  });

  const token = localStorage.getItem('token');

  useEffect(() => {
    if (token) {
      connectWebSocket();
    }
  }, [token]);



  useEffect(() => {
    if (error) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.clear();
      navigate('/', { replace: true });
      return;
    }
    if (!token) {
      navigate('/', { replace: true });
    }
  }, [navigate, token, error]);

  if (!token) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm transition-opacity">
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

  const profileImage = profile?.profileImage && !profile.profileImage.includes('default')
    ? apiUrl(profile.profileImage)
    : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(profile?.name || 'Super Admin') + '&background=0097b2&color=fff&size=100';


  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.clear();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#f4f7f6] flex text-gray-900 font-sans">
      <GlobalToast />
      {/* Sidebar */}
      <aside className="w-56 bg-[#f8fafc] border-r border-gray-200 flex flex-col fixed h-full z-20">
        {/* Sidebar Header */}
        <div className="p-6 flex items-center space-x-3 border-b border-gray-100">
          <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-gray-200 bg-white">
            <img src={logoImage} alt="dozemate" className="w-full h-full object-cover" />
          </div>
          <div>
            <h2 className="text-sm font-bold"><span className="text-black">doze</span><span className="text-[#0097b2]">mate</span> Admin</h2>
            <p className="text-[10px] text-gray-500 font-medium">Global Controller</p>
          </div>
        </div>

        {/* Sidebar Links */}
        <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
          {[
            { id: 'hospitals', icon: Building2, label: 'Organizations' },
            { id: 'devices', icon: MonitorSmartphone, label: 'Devices' },
            { id: 'app_users', icon: Users, label: 'App Users' },
            { id: 'notifications', icon: Bell, label: 'Notifications', badge: true },
            { id: 'feedbacks', icon: MessageSquare, label: 'Feedbacks' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center px-5 py-2.5 text-sm font-medium transition-colors ${activeTab === item.id
                  ? 'bg-[#eaf4f6] text-[#007b90] border-r-4 border-[#007b90]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
            >
              <span className="flex items-center flex-1">
                <item.icon className={`w-5 h-5 mr-3 ${activeTab === item.id ? 'text-[#007b90]' : 'text-gray-400'}`} />
                {item.label}
              </span>
              {item.badge && (notifData?.unreadCount ?? 0) > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 shadow-sm mr-2">
                  {notifData?.unreadCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Trash & Logout */}
        <div className="p-4 border-t border-gray-200 space-y-1">
          <button
            onClick={() => setActiveTab('archive')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${activeTab === 'archive'
                ? 'bg-[#eaf4f6] text-[#007b90]'
                : 'text-gray-600 hover:text-[#007b90] hover:bg-[#eaf4f6]'
              }`}
          >
            <Archive className={`w-5 h-5 mr-3 ${activeTab === 'archive' ? 'text-[#007b90]' : 'text-gray-400'}`} />
            Archive
          </button>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center px-4 py-3 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5 mr-3 text-gray-400" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-56 flex flex-col min-h-screen min-w-0">
        {/* Top Navbar */}
        <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="flex items-center space-x-8">
            <div className="flex items-center">
              <span className="text-lg font-bold tracking-tight mr-6"><span className="text-black">doze</span><span className="text-[#0097b2]">mate</span></span>
              <Link to="/live" className="text-sm font-bold text-gray-500 hover:text-[#0097b2] transition-colors bg-gray-100 hover:bg-teal-50 px-3 py-1 rounded-full">
                View All Live
              </Link>
              {activeTab === 'provision_hospital' && (
                <div className="hidden md:flex items-center ml-4 border-l border-gray-300 pl-4">
                  <span className="text-sm font-medium text-gray-500">Super Admin Console</span>
                </div>
              )}
            </div>
            <nav className="hidden md:flex space-x-6">
              {activeTab === 'hospitals' && <a href="#" className="text-sm font-bold text-[#007b90] border-b-2 border-[#007b90] py-5">Organizations</a>}
              {activeTab === 'devices' && <a href="#" className="text-sm font-bold text-[#007b90] border-b-2 border-[#007b90] py-5">Devices</a>}
              {activeTab === 'app_users' && <a href="#" className="text-sm font-bold text-[#007b90] border-b-2 border-[#007b90] py-5">App Users</a>}
              {activeTab === 'notifications' && <a href="#" className="text-sm font-bold text-[#007b90] border-b-2 border-[#007b90] py-5">Global Notifications</a>}
              {activeTab === 'feedbacks' && <a href="#" className="text-sm font-bold text-[#007b90] border-b-2 border-[#007b90] py-5">Trial Feedbacks</a>}
              {activeTab !== 'hospitals' && activeTab !== 'devices' && activeTab !== 'app_users' && activeTab !== 'notifications' && activeTab !== 'feedbacks' && activeTab !== 'profile' && activeTab !== 'provision_hospital' && (
                <a href="#" className="text-sm font-bold text-[#007b90] border-b-2 border-[#007b90] py-5">Global Overview</a>
              )}
              {activeTab === 'profile' && <a href="#" className="text-sm font-bold text-[#007b90] border-b-2 border-[#007b90] py-5">Profile Settings</a>}
            </nav>
          </div>

          <div className="flex items-center space-x-6">
            {/* Icons */}
            <div className="flex items-center space-x-4 text-gray-400">
              <button 
                onClick={() => setActiveTab('notifications')}
                className={`relative cursor-pointer transition-colors ${activeTab === 'notifications' ? 'text-[#007b90]' : 'hover:text-gray-600'}`}
                title="Notifications"
              >
                <Bell className="w-5 h-5" />
                {(notifData?.unreadCount ?? 0) > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 bg-red-500 rounded-full border border-white text-[8px] font-bold text-white flex items-center justify-center shadow-sm">
                    {notifData?.unreadCount}
                  </span>
                )}
              </button>
            </div>

            {/* Profile */}
            <button
              onClick={() => setActiveTab('profile')}
              title="View Profile"
              className={`w-8 h-8 rounded-full overflow-hidden border-2 transition-all duration-200 focus:outline-none ${activeTab === 'profile' ? 'border-[#007b90] scale-105 shadow-sm' : 'border-gray-300 hover:border-gray-400'
                }`}
            >
              <img src={profileImage} alt="Admin Profile" className="w-full h-full object-cover" />
            </button>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-8 flex-1 overflow-y-auto relative">
          {activeTab === 'provision_hospital' ? (
            <AdminProvisionHospitalView
              onCancel={() => setActiveTab('hospitals')}
              onSubmit={() => setActiveTab('hospitals')}
            />
          ) : activeTab === 'hospitals' ? (
            <AdminHospitalsView
              onAddHospital={() => setActiveTab('provision_hospital')}
              onManageHospital={(hospital) => {
                setSelectedHospital(hospital);
                setActiveTab('hospital_detail');
              }}
            />
          ) : activeTab === 'hospital_detail' && selectedHospital ? (
            <AdminHospitalDetailView
              hospital={selectedHospital}
              onBack={() => setActiveTab('hospitals')}
              onSelectPatient={(patient) => {
                setSelectedPatient(patient);
                setActiveTab('patient_detail');
              }}
            />
          ) : activeTab === 'patient_detail' && selectedPatient ? (
            <AdminPatientDetailView
              patient={selectedPatient}
              onBack={() => setActiveTab('hospital_detail')}
            />
          ) : activeTab === 'devices' ? (
            <AdminDevicesView />
          ) : activeTab === 'app_users' ? (
            <AdminAppUsersView />
          ) : activeTab === 'notifications' ? (
            <AdminNotificationsView />
          ) : activeTab === 'feedbacks' ? (
            <AdminFeedbacksView />
          ) : activeTab === 'profile' ? (
            <AdminProfileView />
          ) : activeTab === 'archive' ? (
            <AdminTrashView onRestoreHospital={() => setActiveTab('hospitals')} />
          ) : (
            <>
              {/* KPI Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Total Hospitals */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Organizations</h3>
                    <Building2 className="w-5 h-5 text-[#007b90]" />
                  </div>
                  <div className="text-4xl font-bold text-[#007b90] mb-2">14</div>
                  <div className="text-xs font-medium text-green-600 bg-green-50 inline-block px-2 py-0.5 rounded">
                    ↗ +2 this quarter
                  </div>
                </div>

                {/* Active Devices */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Active Devices</h3>
                    <Signal className="w-5 h-5 text-[#007b90]" />
                  </div>
                  <div className="text-4xl font-bold text-[#007b90] mb-2">1,240</div>
                  <div className="text-xs font-medium text-gray-500 font-mono">
                    98.5% reporting status
                  </div>
                </div>

                {/* Total Patients */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Patients</h3>
                    <Activity className="w-5 h-5 text-[#007b90]" />
                  </div>
                  <div className="text-4xl font-bold text-[#007b90] mb-2">3,500</div>
                  <div className="text-xs font-medium text-gray-500 font-mono">
                    Real-time monitoring active
                  </div>
                </div>

                {/* System Health */}
                <div className="bg-white rounded-xl border-l-4 border-l-green-500 border-y border-r border-gray-200 p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">System Health</h3>
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  </div>
                  <div className="text-4xl font-bold text-gray-900 mb-2">99.98%</div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Uptime Status: Optimal
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column (Main Content) */}
                <div className="lg:col-span-2 space-y-8">

                  {/* Hospital Performance Table */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-[#007b90]">Global Organization Performance</h3>
                      <div className="space-x-3">
                        <button className="text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors">
                          Export Data
                        </button>
                        <button onClick={() => setActiveTab('hospitals')} className="text-xs font-bold text-white bg-[#007b90] hover:bg-[#00687a] px-4 py-2 rounded-lg transition-colors">
                          Add Organization
                        </button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="py-3 px-6 text-xs font-bold text-gray-500">Organization Name</th>
                            <th className="py-3 px-6 text-xs font-bold text-gray-500">Region</th>
                            <th className="py-3 px-6 text-xs font-bold text-gray-500 text-center">Devices</th>
                            <th className="py-3 px-6 text-xs font-bold text-gray-500">Trial Status</th>
                            <th className="py-3 px-6 text-xs font-bold text-gray-500 text-center">Health</th>
                            <th className="py-3 px-6 text-xs font-bold text-gray-500 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm">
                          {/* Row 1 */}
                          <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="py-4 px-6 font-bold text-[#007b90]">City General Organization</td>
                            <td className="py-4 px-6 text-gray-600">North America</td>
                            <td className="py-4 px-6 text-center font-mono">412</td>
                            <td className="py-4 px-6">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="font-bold text-gray-700">PHASE 3</span>
                                <span className="font-mono text-gray-500">85%</span>
                              </div>
                              <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-[#007b90]" style={{ width: '85%' }}></div>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-center">
                              <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2.5 py-1 rounded-full">Stable</span>
                            </td>
                            <td className="py-4 px-6 text-center text-gray-400 hover:text-gray-600 cursor-pointer">
                              <MoreVertical className="w-4 h-4 mx-auto" />
                            </td>
                          </tr>
                          {/* Row 2 */}
                          <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="py-4 px-6 font-bold text-[#007b90]">St. Mary's Medical</td>
                            <td className="py-4 px-6 text-gray-600">Europe</td>
                            <td className="py-4 px-6 text-center font-mono">205</td>
                            <td className="py-4 px-6">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="font-bold text-gray-700">PHASE 2</span>
                                <span className="font-mono text-gray-500">40%</span>
                              </div>
                              <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-[#007b90]" style={{ width: '40%' }}></div>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-center">
                              <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-2.5 py-1 rounded-full">Warning</span>
                            </td>
                            <td className="py-4 px-6 text-center text-gray-400 hover:text-gray-600 cursor-pointer">
                              <MoreVertical className="w-4 h-4 mx-auto" />
                            </td>
                          </tr>
                          {/* Row 3 */}
                          <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="py-4 px-6 font-bold text-[#007b90]">Pacific Health Care</td>
                            <td className="py-4 px-6 text-gray-600">APAC</td>
                            <td className="py-4 px-6 text-center font-mono">593</td>
                            <td className="py-4 px-6">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="font-bold text-gray-700">LIVE</span>
                                <span className="font-mono text-gray-500">100%</span>
                              </div>
                              <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500" style={{ width: '100%' }}></div>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-center">
                              <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2.5 py-1 rounded-full">Optimal</span>
                            </td>
                            <td className="py-4 px-6 text-center text-gray-400 hover:text-gray-600 cursor-pointer">
                              <MoreVertical className="w-4 h-4 mx-auto" />
                            </td>
                          </tr>
                          {/* Row 4 */}
                          <tr className="hover:bg-gray-50/50 transition-colors">
                            <td className="py-4 px-6 font-bold text-[#007b90]">Metro Children's</td>
                            <td className="py-4 px-6 text-gray-600">North America</td>
                            <td className="py-4 px-6 text-center font-mono">30</td>
                            <td className="py-4 px-6">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="font-bold text-gray-700">PHASE 1</span>
                                <span className="font-mono text-gray-500">15%</span>
                              </div>
                              <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-[#007b90]" style={{ width: '15%' }}></div>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-center">
                              <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2.5 py-1 rounded-full">Setup</span>
                            </td>
                            <td className="py-4 px-6 text-center text-gray-400 hover:text-gray-600 cursor-pointer">
                              <MoreVertical className="w-4 h-4 mx-auto" />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Bottom Row inside Left Column */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Device Distribution */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6">Device Distribution</h3>
                      <div className="flex items-end h-32 space-x-2">
                        <div className="flex-1 bg-[#c2d8d8] rounded-t-sm h-[40%] group relative hover:bg-[#007b90] transition-colors"><span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-mono text-gray-500">US-EAST</span></div>
                        <div className="flex-1 bg-[#a3c4c4] rounded-t-sm h-[60%] group relative hover:bg-[#007b90] transition-colors"><span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-mono text-gray-500">US-WEST</span></div>
                        <div className="flex-1 bg-[#84b0b0] rounded-t-sm h-[30%] group relative hover:bg-[#007b90] transition-colors"><span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-mono text-gray-500">EU-CENT</span></div>
                        <div className="flex-1 bg-[#478787] rounded-t-sm h-[80%] group relative hover:bg-[#007b90] transition-colors"><span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-mono text-gray-500">AS-PAC</span></div>
                        <div className="flex-1 bg-[#1a5b5b] rounded-t-sm h-[50%] group relative hover:bg-[#007b90] transition-colors"><span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-mono text-gray-500">SA-SOUTH</span></div>
                      </div>
                      <div className="mt-8 text-center text-xs text-gray-500">
                        Highest concentration in Asia Pacific region
                      </div>
                    </div>

                    {/* System Integrity Check */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col items-center justify-center text-center">
                      <div className="w-24 h-24 mb-6 relative">
                        <div className="absolute inset-0 border-4 border-[#007b90]/20 rounded-xl transform rotate-12"></div>
                        <div className="absolute inset-0 bg-white border-4 border-[#007b90] rounded-xl flex items-center justify-center shadow-lg">
                          <Stethoscope className="w-8 h-8 text-[#007b90]" />
                        </div>
                      </div>
                      <h3 className="text-lg font-bold text-[#007b90] mb-2">System Integrity Check</h3>
                      <p className="text-sm text-gray-600 px-4">
                        Global nodes responding within 15ms. No anomalies detected.
                      </p>
                    </div>
                  </div>

                </div>

                {/* Right Column (Sidebar content) */}
                <div className="space-y-8">

                  {/* Alert Box */}
                  <div className="bg-[#fff9eb] border border-[#fbdc9b] rounded-xl p-5 shadow-sm flex items-start">
                    <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mr-3 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-orange-800 uppercase tracking-widest mb-1">System Maintenance</h4>
                      <p className="text-sm text-orange-700">Scheduled database optimization for EU-Central cluster at 02:00 UTC.</p>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <h3 className="text-lg font-bold text-[#007b90] mb-6">Recent Activity</h3>

                    <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">

                      {/* Item 1 */}
                      <div className="relative flex items-start space-x-4">
                        <div className="w-6 h-6 rounded-full bg-white border-2 border-[#007b90] flex items-center justify-center shrink-0 z-10 mt-1">
                          <div className="w-2 h-2 bg-[#007b90] rounded-full"></div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">10 Minutes Ago</div>
                          <div className="text-sm font-bold text-gray-900">City General Organization</div>
                          <p className="text-xs text-gray-600 mt-1">Added 20 new patient monitoring devices to the North Wing cluster.</p>
                        </div>
                      </div>

                      {/* Item 2 */}
                      <div className="relative flex items-start space-x-4">
                        <div className="w-6 h-6 rounded-full bg-white border-2 border-green-500 flex items-center justify-center shrink-0 z-10 mt-1">
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">2 Hours Ago</div>
                          <div className="text-sm font-bold text-gray-900">St. Mary's Medical</div>
                          <p className="text-xs text-gray-600 mt-1">Trial Phase 2 successfully initiated. 15 staff members onboarded.</p>
                        </div>
                      </div>

                      {/* Item 3 */}
                      <div className="relative flex items-start space-x-4">
                        <div className="w-6 h-6 rounded-full bg-white border-2 border-red-500 flex items-center justify-center shrink-0 z-10 mt-1">
                          <AlertTriangle className="w-3 h-3 text-red-500" />
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Yesterday</div>
                          <div className="text-sm font-bold text-gray-900">Pacific Health Care</div>
                          <p className="text-xs text-gray-600 mt-1">Network timeout detected in Hub #4. Issue resolved by local IT.</p>
                        </div>
                      </div>

                      {/* Item 4 */}
                      <div className="relative flex items-start space-x-4">
                        <div className="w-6 h-6 rounded-full bg-white border-2 border-blue-500 flex items-center justify-center shrink-0 z-10 mt-1">
                          <Clock className="w-3 h-3 text-blue-500" />
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Yesterday</div>
                          <div className="text-sm font-bold text-gray-900">System Wide</div>
                          <p className="text-xs text-gray-600 mt-1">Security patch v4.2.1 deployed across all 1,240 active devices.</p>
                        </div>
                      </div>

                    </div>

                    <button className="w-full mt-6 py-3 border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors border-dashed">
                      View Full Audit Log
                    </button>
                  </div>

                  {/* Map Box */}
                  <div className="bg-[#021f24] rounded-xl p-6 shadow-sm relative overflow-hidden h-48 flex items-center justify-center border border-[#04333b]">
                    {/* Fake map background using gradients */}
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#004f5e] via-[#021f24] to-[#011417]"></div>
                    <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(#4fd1c5 1px, transparent 1px)', backgroundSize: '12px 12px' }}></div>

                    {/* Fake points on map */}
                    <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-teal-400 rounded-full animate-ping"></div>
                    <div className="absolute top-1/2 left-1/3 w-3 h-3 bg-teal-400 rounded-full opacity-50 shadow-[0_0_15px_rgba(45,212,191,0.8)]"></div>
                    <div className="absolute bottom-1/3 right-1/4 w-2 h-2 bg-teal-400 rounded-full animate-ping"></div>
                    <div className="absolute top-1/3 right-1/3 w-1.5 h-1.5 bg-teal-300 rounded-full shadow-[0_0_10px_rgba(45,212,191,0.8)]"></div>

                    <button className="relative z-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white text-sm font-bold py-2.5 px-6 rounded-lg transition-colors flex items-center shadow-lg">
                      <MapPin className="w-4 h-4 mr-2" />
                      View Live Network
                    </button>
                  </div>

                </div>
              </div>
            </>
          )}

          {/* Footer (Hide when provisioning to keep focus on form actions) */}
          {activeTab !== 'provision_hospital' && (
            <div className="mt-12 pt-6 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center text-xs text-gray-500 font-mono">
              <div>© 2026 <span className="text-black">doze</span><span className="text-[#0097b2]">mate</span> Clinical Systems. All rights reserved.</div>
              <div className="flex space-x-6 mt-4 md:mt-0">
                <Link to="/privacy" className="hover:text-gray-900 transition-colors">Privacy Policy</Link>
                <Link to="/terms" className="hover:text-gray-900 transition-colors">Terms of Service</Link>
              </div>
            </div>
          )}
        </div>
      </main>

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
