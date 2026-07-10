import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import DeviceMetrics from '@/components/dashboard/DeviceMetrics';
import DeviceTable from '@/components/dashboard/DeviceTable';
import { RefreshCw } from 'lucide-react';
import { getDevices } from '@/services/deviceService';

export default function Devices() {
  const { data: devices = [], isLoading: loading, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard_devices'],
    queryFn: getDevices,
    staleTime: 30000, // consider data fresh for 30s
  });

  return (
    <DashboardLayout>
      <div className="p-8 max-w-7xl mx-auto flex flex-col h-full min-h-[calc(100vh-73px)]">
        
        {/* Page Header Section */}
        <div className="flex justify-between items-end mb-8">
          <div className="flex items-center">
            <h1 className="text-3xl font-bold text-gray-900 mr-2">Bed Overlay</h1>
            <span className="text-2xl font-normal text-gray-500">({devices.length})</span>
          </div>
          
          <div className="flex space-x-3">
            <button 
              onClick={() => refetch()}
              disabled={isRefetching || loading}
              className="flex items-center px-4 py-2 bg-white border border-[#0097b2] text-[#0097b2] rounded-md text-sm font-bold hover:bg-[#0097b2]/5 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Device Metrics */}
        <div className="mb-8">
          <DeviceMetrics devices={devices} />
        </div>

        {/* Devices Table */}
        <div className="flex-1 min-w-0 mb-8">
          <DeviceTable devices={devices} loading={loading} />
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
