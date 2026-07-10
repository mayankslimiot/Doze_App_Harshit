import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatCard from '@/components/dashboard/StatCard';
import SleepSessionsTable from '@/components/dashboard/SleepSessionsTable';
import { TrendingUp, MonitorSmartphone } from 'lucide-react';
import { getDashboardStats, getUserProfile } from '@/services/deviceService';

import { useState } from 'react';

export default function Dashboard() {
  const [activeFilter, setActiveFilter] = useState('');
  const { data: stats } = useQuery({
    queryKey: ['dashboard_stats'],
    queryFn: getDashboardStats,
    placeholderData: {
      activeSessions: 0,
      devicesOnline: 0,
      totalDevices: 0,
      pendingReviews: 0,
      activeAlerts: 0
    },
    staleTime: 0, // always refetch on mount
  });

  const { data: profile } = useQuery<any>({
    queryKey: ['user_profile'],
    queryFn: getUserProfile,
    staleTime: 60000 * 5,
  });

  const isOtherOrg = profile?.account?.organizationId?.organizationType === 'other';

  return (
    <DashboardLayout>
      <div className="p-8 max-w-7xl mx-auto flex flex-col h-full min-h-[calc(100vh-73px)]">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div 
            onClick={() => setActiveFilter(activeFilter === 'Monitoring' ? '' : 'Monitoring')}
            className={`cursor-pointer transition-all ${activeFilter === 'Monitoring' ? 'ring-2 ring-[#00c4b5] rounded-xl' : ''}`}
          >
            <StatCard
              title={isOtherOrg ? "Active Users" : "Active Patients"}
              value={<span className="text-[#00c4b5]">{stats.activeSessions}</span>}
              icon={TrendingUp}
              iconClassName="text-[#00c4b5]"
            />
          </div>
          <StatCard
            title="Devices Online"
            value={
              <>
                <span className="text-green-500">{stats.devicesOnline}</span>
                <span className="text-gray-400 text-xl font-medium ml-1">/{stats.totalDevices}</span>
              </>
            }
            icon={MonitorSmartphone}
          />
        </div>


        {/* Main Split Content */}
        <div className="flex-1 flex flex-col gap-6 mb-8">
          <SleepSessionsTable externalFilter={activeFilter} onFilterChange={setActiveFilter} />
        </div>

        {/* Footer */}
        <div className="mt-auto">
          <div className="bg-gray-100/50 rounded-lg py-4 px-6 text-center text-xs text-gray-500">
            <p className="mb-2 italic">
              Dozemate is currently under clinical evaluation. Data presented is for trial monitoring purposes only.
            </p>
            <div className="flex justify-center space-x-6 font-medium underline-offset-2">
              <Link to="/privacy" className="hover:text-gray-900 hover:underline">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-gray-900 hover:underline">Terms of Service</Link>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
