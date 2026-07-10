import { Activity } from 'lucide-react';

export default function IncidentTimeline({ sleepSession }: { sleepSession: any }) {
  const getStageY = (stage: string) => {
    switch (stage) {
      case 'AWAKE': return 10;
      case 'REM': return 30;
      case 'LIGHT': return 50;
      case 'DEEP': return 70;
      default: return 10;
    }
  };

  const activeTimeline = sleepSession?.stageTimeline || [];

  if (!sleepSession || activeTimeline.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
          <div className="flex items-center">
            <Activity className="w-5 h-5 text-[#0097b2] mr-2" />
            <h2 className="text-xl font-bold text-gray-900">Sleep Stage Timeline</h2>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Activity className="w-10 h-10 text-gray-300 mb-3 animate-pulse" />
          <h3 className="text-sm font-semibold text-gray-700">No Stage Timeline Data Available</h3>
        </div>
      </div>
    );
  }

  const formatMinutes = (mins: number) => {
    if (mins === undefined || mins === null || isNaN(mins)) return 'N/A';
    const hours = Math.floor(mins / 60);
    const minutes = Math.round(mins % 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  };

  const metrics = {
    score: sleepSession.sleepScore ? `${Math.round(sleepSession.sleepScore)}/100` : 'N/A',
    total: formatMinutes(sleepSession.timeInBed),
    sleep: formatMinutes(sleepSession.totalSleepTime),
    efficiency: sleepSession.sleepEfficiency ? `${Math.round(sleepSession.sleepEfficiency)}%` : 'N/A',
    deep: sleepSession.deepSleepMinutes ? `${Math.round(sleepSession.deepSleepMinutes)} min (${sleepSession.totalSleepTime ? Math.round((sleepSession.deepSleepMinutes / sleepSession.totalSleepTime) * 100) : 0}%)` : '0 min (0%)',
    rem: sleepSession.remMinutes ? `${Math.round(sleepSession.remMinutes)} min (${sleepSession.totalSleepTime ? Math.round((sleepSession.remMinutes / sleepSession.totalSleepTime) * 100) : 0}%)` : '0 min (0%)',
    waso: sleepSession.awakeMinutes ? `${Math.round(sleepSession.awakeMinutes)} min` : '0 min',
    awakenings: sleepSession.awakenings || 0
  };

  const formatTime = (tsInSeconds: number) => {
    const date = new Date(tsInSeconds * 1000);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const renderHypnogram = () => {
    const width = 1000;
    const height = 240;
    const paddingLeft = 55;
    const paddingRight = 25;
    const paddingTop = 15;
    const paddingBottom = 28;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const startTs = activeTimeline[0]?.ts || 0;
    const endTs = activeTimeline[activeTimeline.length - 1]?.ts || 1;
    const totalDuration = endTs - startTs || 1;

    const points = activeTimeline.map((epoch: any) => {
      const x = paddingLeft + ((epoch.ts - startTs) / totalDuration) * chartWidth;
      const y = paddingTop + (getStageY(epoch.stage) / 80) * chartHeight;
      return { x, y, stage: epoch.stage, ts: epoch.ts };
    });

    let pathD = '';
    if (points.length > 0) {
      pathD = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        pathD += ` H ${points[i].x} V ${points[i].y}`;
      }
    }

    // Determine the number of tick marks dynamically based on duration to ensure perfect equal spacing
    const totalDurationHours = totalDuration / 3600;
    let numTicks = 6;
    if (totalDurationHours <= 3) {
      numTicks = 4;
    } else if (totalDurationHours <= 6) {
      numTicks = 5;
    }

    const hourLabels = [];
    for (let i = 0; i < numTicks; i++) {
      const pct = i / (numTicks - 1);
      const x = paddingLeft + pct * chartWidth;
      const targetTs = startTs + pct * totalDuration;
      hourLabels.push({
        x,
        label: formatTime(targetTs)
      });
    }

    return (
      <div className="w-full bg-white p-0 flex flex-col">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {/* Chart Border */}
          <rect 
            x={paddingLeft} 
            y={paddingTop} 
            width={chartWidth} 
            height={chartHeight} 
            fill="none" 
            stroke="#000000" 
            strokeWidth="1" 
          />

          {/* Y labels and small ticks */}
          {['AWAKE', 'REM', 'LIGHT', 'DEEP'].map((stage) => {
            const yVal = paddingTop + (getStageY(stage) / 80) * chartHeight;
            const displayLabel = stage === 'AWAKE' ? 'Awake' : stage === 'REM' ? 'REM' : stage === 'LIGHT' ? 'Light' : 'Deep';
            return (
              <g key={stage}>
                <text 
                  x={paddingLeft - 10} 
                  y={yVal + 3.5} 
                  className="text-[11px] font-sans text-black text-right" 
                  textAnchor="end"
                  fill="#000000"
                >
                  {displayLabel}
                </text>
                <line 
                  x1={paddingLeft - 5} 
                  y1={yVal} 
                  x2={paddingLeft} 
                  y2={yVal} 
                  stroke="#000000" 
                  strokeWidth="1" 
                />
              </g>
            );
          })}

          {/* Hypnogram Line */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="#1f77b4"
              strokeWidth="2"
              strokeLinecap="square"
              strokeLinejoin="miter"
            />
          )}

          {/* X-Axis gridlines, ticks, and labels */}
          {hourLabels.map((lbl, idx) => (
            <g key={idx}>
              <line 
                x1={lbl.x} 
                y1={paddingTop} 
                x2={lbl.x} 
                y2={height - paddingBottom} 
                stroke="#e5e5e5" 
                strokeWidth="0.5" 
              />
              <line 
                x1={lbl.x} 
                y1={height - paddingBottom} 
                x2={lbl.x} 
                y2={height - paddingBottom + 5} 
                stroke="#000000" 
                strokeWidth="1" 
              />
              <text 
                x={lbl.x} 
                y={height - paddingBottom + 16} 
                className="text-[10px] font-sans text-black" 
                textAnchor="middle"
                fill="#000000"
              >
                {lbl.label}
              </text>
            </g>
          ))}

        </svg>
        <div className="flex justify-center items-center space-x-8 mt-2 pb-2 text-xs font-semibold text-gray-500">
          <span><span className="text-gray-400">Deep:</span> <span className="text-[#0097b2]">{metrics.deep}</span></span>
          <span><span className="text-gray-400">REM:</span> <span className="text-indigo-500">{metrics.rem}</span></span>
          <span><span className="text-gray-400">WASO:</span> <span className="text-orange-500">{metrics.waso}</span></span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 pb-2">
      <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
        <div className="flex items-center">
          <Activity className="w-5 h-5 text-[#0097b2] mr-2" />
          <h2 className="text-xl font-bold text-gray-900">Sleep Stage Timeline</h2>
        </div>
      </div>

      <div className="w-full">
        {renderHypnogram()}
      </div>
    </div>
  );
}
