import { CheckCircle2, XCircle, MonitorSmartphone } from 'lucide-react';

interface DeviceMetricsProps {
  devices?: any[];
}

export default function DeviceMetrics({ devices = [] }: DeviceMetricsProps) {
  const onlineCount = devices.filter(d => d.status === 'Online' || d.status === 'Monitoring').length;
  const offlineCount = devices.filter(d => d.status === 'Offline').length;
  const totalCount = devices.length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Online */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-24">
        <div className="flex justify-between items-start">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Online</span>
          <CheckCircle2 className="w-4 h-4 text-green-500" strokeWidth={2.5} />
        </div>
        <div className="text-3xl font-bold text-green-500">{onlineCount}</div>
      </div>

      {/* Offline */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-24">
        <div className="flex justify-between items-start">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Offline</span>
          <XCircle className="w-4 h-4 text-red-500" strokeWidth={2.5} />
        </div>
        <div className="text-3xl font-bold text-red-500">{offlineCount}</div>
      </div>

      {/* Total */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-24">
        <div className="flex justify-between items-start">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total</span>
          <MonitorSmartphone className="w-4 h-4 text-[#0097b2]" strokeWidth={2.5} />
        </div>
        <div className="text-3xl font-bold text-[#0097b2]">{totalCount}</div>
      </div>
    </div>
  );
}
