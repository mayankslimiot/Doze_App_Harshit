import DashboardLayout from '@/components/layout/DashboardLayout';
import { Home, ChevronRight, Users, User, Building2, Info, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Settings() {
  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-8">
        
        {/* Top Breadcrumb */}
        <div className="flex items-center text-xs font-bold text-gray-400 mb-6 tracking-widest uppercase">
          <Home className="w-3.5 h-3.5 mr-2" />
          <ChevronRight className="w-3 h-3 mx-1" />
          <span className="text-[#0097b2]">Settings</span>
        </div>

        {/* Header Section */}
        <div className="flex justify-between items-start mb-10">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">System Settings</h1>
            <p className="text-sm text-gray-500 leading-relaxed font-medium">
              Configure global laboratory parameters, clinical staff permissions, and branding settings for the Dozemate ecosystem.
            </p>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          
          {/* Card 1: User Management */}
          <Link to="/settings/users" className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:border-teal-100 hover:shadow-md transition-all group cursor-pointer flex flex-col h-[200px]">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center text-[#0097b2]">
                <Users className="w-5 h-5" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-[#0097b2] transition-colors" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">User Management</h3>
            <p className="text-sm text-gray-500 mb-auto leading-relaxed line-clamp-2 font-medium">Manage clinical staff, technicians, and temporary viewer permissions.</p>
          </Link>

          {/* Card 2: Account & Profile */}
          <Link to="/settings/account" className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:border-teal-100 hover:shadow-md transition-all group cursor-pointer flex flex-col h-[200px]">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center text-[#0097b2]">
                <User className="w-5 h-5" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-[#0097b2] transition-colors" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Account & Profile</h3>
            <p className="text-sm text-gray-500 mb-auto leading-relaxed line-clamp-2 font-medium">Update personal information, notification preferences, and security credentials.</p>
            <div className="flex items-center text-[#007b90] mt-4">
              <Info className="w-3.5 h-3.5 mr-1.5" />
              <span className="text-[10px] font-bold">Manage credentials</span>
            </div>
          </Link>

          {/* Card 3: Organization Profile */}
          <Link to="/settings/organization" className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:border-teal-100 hover:shadow-md transition-all group cursor-pointer flex flex-col h-[200px]">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center text-[#0097b2]">
                <Building2 className="w-5 h-5" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-[#0097b2] transition-colors" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Organization Profile</h3>
            <p className="text-sm text-gray-500 mb-auto leading-relaxed line-clamp-2 font-medium">Configure institutional details, branding identity, logo, and address settings.</p>
          </Link>

        </div>

      </div>
    </DashboardLayout>
  );
}
