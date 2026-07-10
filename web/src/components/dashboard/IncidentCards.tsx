import { Activity, Heart, Wind, AlertTriangle } from 'lucide-react';

export default function IncidentCards({ sleepSession }: { sleepSession: any }) {
  if (!sleepSession) return null;

  // Snoring calculation
  const snoreDetail = sleepSession?.snoreDetail ?? null;
  const snoringMinutes = snoreDetail
    ? Math.round((snoreDetail.totalRawSeconds || 0) / 60)
    : 0;

  // Restlessness calculation based on epochs
  const awakeEpochs = (sleepSession?.stageTimeline || []).filter(
    (e: any) => e.stage === 'AWAKE'
  ).length;

  let restlessnessLevel = '--';
  if (awakeEpochs > 0) {
    if (awakeEpochs <= 4) restlessnessLevel = 'Low';
    else if (awakeEpochs <= 12) restlessnessLevel = 'Moderate';
    else restlessnessLevel = 'High';
  }

  // Heart Rate
  const restingHeartRate = sleepSession.restingHeartRate;

  return (
    <div className="mt-8">
      <div className="flex items-center mb-4 border-b border-gray-100 pb-3">
        <AlertTriangle className="w-5 h-5 text-[#0097b2] mr-2" />
        <h2 className="text-xl font-bold text-gray-900">Incidents Detected</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Snoring Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Snoring</div>
            <div className="text-2xl font-bold text-gray-900 flex items-baseline">
              {snoreDetail ? snoringMinutes : '--'} <span className="text-xs font-normal text-gray-500 ml-1">min</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
            <Wind className="w-5 h-5 text-purple-500" />
          </div>
        </div>

        {/* Restlessness Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Restlessness</div>
            <div className="text-2xl font-bold text-gray-900">
              {restlessnessLevel}
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
            <Activity className="w-5 h-5 text-orange-500" />
          </div>
        </div>

        {/* Avg Heart Rate Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Avg Heart Rate</div>
            <div className="text-2xl font-bold text-gray-900 flex items-baseline">
              {restingHeartRate != null ? restingHeartRate : '--'} <span className="text-xs font-normal text-gray-500 ml-1">bpm</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <Heart className="w-5 h-5 text-red-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
