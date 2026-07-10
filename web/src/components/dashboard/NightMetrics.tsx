import { Activity, ArrowUp } from 'lucide-react';

const formatMinutes = (mins: number) => {
  if (mins === undefined || mins === null || isNaN(mins)) return '0h 00m';
  const hours = Math.floor(mins / 60);
  const minutes = Math.round(mins % 60);
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
};

const getQualityLabel = (score: number) => {
  if (!score && score !== 0) return 'N/A';
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Poor';
};

export default function NightMetrics({ sleepSession }: { sleepSession: any }) {
  if (!sleepSession) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm text-center text-gray-500 font-medium">
        No sleep session analysis data available for this monitoring window.
      </div>
    );
  }

  const {
    timeInBed = 0,
    totalSleepTime = 0,
    sleepScore = 0,
    awakenings = 0
  } = sleepSession;

  const scoreColor = sleepScore >= 85 ? 'text-green-500' : sleepScore >= 70 ? 'text-[#00c4b5]' : sleepScore >= 50 ? 'text-orange-500' : 'text-red-500';

  return (
    <div>
      <div className="flex items-center mb-4">
        <Activity className="w-5 h-5 text-[#0097b2] mr-2" />
        <h2 className="text-xl font-bold text-gray-900">Night Metrics</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Monitored */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-24">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Total Monitored</div>
          <div className="text-2xl font-bold text-gray-900 mb-2">{formatMinutes(timeInBed)}</div>
          <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mt-auto">
            <div className="bg-[#00c4b5] h-full" style={{ width: '100%' }}></div>
          </div>
        </div>

        {/* Estimated Sleep */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-24">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Estimated Sleep</div>
          <div className="text-2xl font-bold text-gray-900 mb-1">{formatMinutes(totalSleepTime)}</div>
          <div className="flex items-center text-[10px] font-bold text-green-500 mt-auto">
            <ArrowUp className="w-3 h-3 mr-1" strokeWidth={3} />
            Efficiency: {Math.round(sleepSession.sleepEfficiency || 0)}%
          </div>
        </div>

        {/* Quality Score */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between h-24">
          <div className="flex flex-col h-full justify-between py-1">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Quality Score</div>
            <div className="text-lg font-bold text-gray-900">{getQualityLabel(sleepScore)}</div>
          </div>
          <div className="relative w-12 h-12">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-gray-100"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className={scoreColor}
                strokeDasharray={`${sleepScore}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700">
              {Math.round(sleepScore)}%
            </div>
          </div>
        </div>

        {/* Wake Events */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-24">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Wake Events</div>
          <div className="text-2xl font-bold text-gray-900 mb-1">{awakenings}</div>
        </div>
      </div>
    </div>
  );
}
