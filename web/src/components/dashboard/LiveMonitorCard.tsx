import { Heart, Wind, MoreVertical } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import VitalsGraph from './VitalsGraph';
import type { DataPoint } from './VitalsGraph';

export interface LiveMonitorData {
  id: string;           // deviceId
  deviceId: string;     // e.g. "SC-4092"
  bed: string;          // location or custom name
  patientName: string;  // display name
  heartRate: number | null;
  respiration: number | null;
  status: 'normal' | 'warning' | 'alert';
  statusText: string;
  hrHistory: DataPoint[];    // rolling HR graph data
  respHistory: DataPoint[];  // rolling Respiration graph data
  lastCycleLabel: string;    // e.g. "29-30 Jun 2026"
}

export default function LiveMonitorCard({ data }: { data: LiveMonitorData }) {
  const navigate = useNavigate();
  const isAlert = data.status === 'alert';
  const isWarning = data.status === 'warning';

  const hrColor = isAlert ? 'text-red-500' : isWarning ? 'text-orange-500' : 'text-[#0097b2]';
  const hrLineColor = isAlert ? '#ef4444' : '#0097b2';
  const respLineColor = isAlert ? '#ef4444' : '#4b5563';

  return (
    <div
      onClick={() => navigate(`/live/${data.deviceId}`)}
      className={`bg-white border cursor-pointer hover:border-[#0097b2] hover:shadow-md transition-all duration-200 ${
        isAlert
          ? 'border-red-200 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
          : 'border-gray-200 shadow-sm'
      } rounded-xl overflow-hidden flex flex-col h-full`}
    >
      {/* Card Header */}
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <div className="flex items-center space-x-3">
          <span className="bg-gray-700 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider font-mono">
            {data.deviceId}
          </span>
          <span className="font-bold text-gray-900 text-lg">{data.patientName || data.bed || 'Device'}</span>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="text-gray-400 hover:text-gray-600 p-1"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      {/* Heart Rate Section */}
      <div className="p-4 border-b border-gray-100 relative">
        <div className="flex justify-between items-start mb-1 z-10 relative">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              Heart Rate
            </div>
            <div className="flex items-baseline space-x-1">
              <span className={`text-3xl font-bold ${hrColor}`}>
                {data.heartRate != null ? Math.round(data.heartRate) : '--'}
              </span>
              <span className="text-xs font-bold text-gray-400">BPM</span>
            </div>
          </div>
          <Heart className={`w-4 h-4 ${hrColor}`} />
        </div>

        <div className="h-20 w-full -mx-2">
          <VitalsGraph
            data={data.hrHistory}
            lineColor={hrLineColor}
            areaColor={`${hrLineColor}18`}
            yAxisLabel="BPM"
            height={80}
            compact
          />
        </div>
      </div>

      {/* Respiration Section */}
      <div className="p-4 border-b border-gray-100 relative">
        <div className="flex justify-between items-start mb-1 z-10 relative">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              Respiration
            </div>
            <div className="flex items-baseline space-x-1">
              <span className={`text-3xl font-bold ${isAlert ? 'text-red-500' : 'text-gray-900'}`}>
                {data.respiration != null ? Math.round(data.respiration) : '--'}
              </span>
              <span className="text-xs font-bold text-gray-400">BR/M</span>
            </div>
          </div>
          <Wind className="w-4 h-4 text-gray-500" />
        </div>

        <div className="h-20 w-full -mx-2">
          <VitalsGraph
            data={data.respHistory}
            lineColor={respLineColor}
            areaColor={`${respLineColor}18`}
            yAxisLabel="RPM"
            height={80}
            compact
          />
        </div>
      </div>

      {/* Card Footer */}
      <div className={`mt-auto p-4 flex justify-between items-center ${isAlert ? 'bg-red-50/50' : 'bg-gray-50/50'}`}>
        {data.lastCycleLabel ? (
          <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{data.lastCycleLabel}</span>
        ) : (
          <span className="text-[10px] font-bold text-gray-300 tracking-wider">No Data</span>
        )}
        <Link
          to={`/live/${data.deviceId}`}
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-bold text-[#0097b2] hover:text-[#007b90] transition-colors"
        >
          Details
        </Link>
      </div>
    </div>
  );
}
