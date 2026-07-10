import { Heart, Wind, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function VitalsSummary({ 
  monitoringSession, 
  sleepSession, 
  selectedDate 
}: { 
  monitoringSession: any, 
  sleepSession?: any,
  selectedDate?: string 
}) {
  const navigate = useNavigate();

  let isCurrentCycle = true;
  if (selectedDate) {
    const nowTarget = new Date();
    nowTarget.setHours(0, 0, 0, 0);
    if (new Date().getHours() >= 12) {
      nowTarget.setDate(nowTarget.getDate() + 1);
    }
    const yyyy = nowTarget.getFullYear();
    const mm = String(nowTarget.getMonth() + 1).padStart(2, '0');
    const dd = String(nowTarget.getDate()).padStart(2, '0');
    const currentCycleStr = `${yyyy}-${mm}-${dd}`;
    isCurrentCycle = selectedDate === currentCycleStr;
  }

  // Use real-time data for the current cycle, historical averages for past dates
  const heartRate = isCurrentCycle 
    ? (monitoringSession?.currentHeartRate || '—') 
    : (sleepSession?.avgHeartRate ? Math.round(sleepSession.avgHeartRate) : '—');
    
  const respiration = isCurrentCycle 
    ? (monitoringSession?.currentRespiration || '—') 
    : (sleepSession?.avgRespRate ? Math.round(sleepSession.avgRespRate) : '—');


  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* 1x3 Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
        {/* Heart Rate */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Heart Rate</div>
            <div className="text-2xl font-bold text-gray-900 flex items-baseline">
              {heartRate} <span className="text-xs font-normal text-gray-500 ml-1">bpm</span>
            </div>
          </div>
          <Heart className="w-8 h-8 text-red-500 opacity-20" />
        </div>

        {/* Respiration */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Respiration</div>
            <div className="text-2xl font-bold text-gray-900 flex items-baseline">
              {respiration} <span className="text-xs font-normal text-gray-500 ml-1">rpm</span>
            </div>
          </div>
          <Wind className="w-8 h-8 text-blue-500 opacity-20" />
        </div>
      </div>

      {/* Button */}
      <button 
        onClick={() => navigate(`/live/${monitoringSession.deviceId}`)}
        className="bg-white border border-gray-200 rounded-xl px-4 py-4 shadow-sm flex flex-col items-center justify-center text-[#0097b2] hover:bg-gray-50 transition-colors w-full md:w-48 shrink-0"
      >
        <TrendingUp className="w-6 h-6 mb-1" />
        <span className="font-bold text-sm">View Long Trends</span>
      </button>
    </div>
  );
}
