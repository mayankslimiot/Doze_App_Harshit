import React from 'react';
import VitalsGraph from './VitalsGraph';
import type { DataPoint } from './VitalsGraph';

interface DetailGraphCardProps {
  title: string;
  icon: React.ReactNode;
  iconColor?: string;
  metaText: React.ReactNode;
  metaColor?: string;
  /** Real data points for VitalsGraph */
  dataPoints?: DataPoint[];
  /** Y-axis label */
  yAxisLabel?: string;
  /** Line colour */
  lineColor: string;
  /** Chart height class — ignored when dataPoints is provided */
  heightClass?: string;
  /** Fixed Y domain */
  yDomain?: [number, number];
  /** Zoom index */
  zoomIndex?: number;
  /** Zoom change handler */
  onZoomChange?: (idx: number) => void;
  /** Domain change handler */
  onDomainChange?: (domain: [number, number]) => void;
  /** Show zoom selector */
  showZoomSelector?: boolean;

  // Legacy props (kept for backward compat if some cards still need static SVG)
  yAxisLabels?: string[];
  svgPath?: string;
}

export default function DetailGraphCard({
  title,
  icon,
  iconColor = 'text-gray-500',
  metaText,
  metaColor = 'text-gray-500',
  dataPoints,
  yAxisLabel = '',
  lineColor,
  heightClass = 'h-32',
  yDomain,
  zoomIndex = 0,
  onZoomChange,
  onDomainChange,
  showZoomSelector = false,
  yAxisLabels,
  svgPath,
}: DetailGraphCardProps) {
  const useVictory = dataPoints && dataPoints.length > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col mb-4">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
        <div className="flex items-center space-x-2">
          <div className={`${iconColor}`}>{icon}</div>
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{title}</span>
        </div>
        <div className={`text-[10px] font-bold tracking-wider uppercase ${metaColor}`}>
          {metaText}
        </div>
      </div>

      {/* Graph Area */}
      {useVictory ? (
        <div className="w-full p-2">
          <VitalsGraph
            data={dataPoints}
            lineColor={lineColor}
            areaColor={`${lineColor}18`}
            yAxisLabel={yAxisLabel}
            yDomain={yDomain}
            height={160}
            zoomIndex={zoomIndex}
            onZoomChange={onZoomChange}
            onDomainChange={onDomainChange}
            showZoomSelector={showZoomSelector}
          />
        </div>
      ) : (
        /* Legacy static SVG fallback */
        <div className={`w-full relative ${heightClass} p-4`}>
          {/* Background Grid */}
          <div className="absolute inset-0 px-12 py-4 flex flex-col justify-between z-0 pointer-events-none opacity-50">
            <div className="border-b border-gray-200 w-full"></div>
            <div className="border-b border-gray-100 w-full"></div>
            <div className="border-b border-gray-200 w-full"></div>
          </div>

          {/* Vertical Grid Lines */}
          <div className="absolute inset-0 px-12 py-4 flex justify-between z-0 pointer-events-none opacity-50">
            <div className="border-l border-gray-200 h-full"></div>
            <div className="border-l border-gray-100 h-full"></div>
            <div className="border-l border-gray-200 h-full"></div>
            <div className="border-l border-gray-100 h-full"></div>
            <div className="border-l border-gray-200 h-full"></div>
          </div>

          {/* Y Axis Labels */}
          {yAxisLabels && (
            <div className="absolute left-2 top-4 bottom-4 w-8 flex flex-col justify-between text-[9px] text-gray-400 font-mono text-right pr-2">
              {yAxisLabels.map((label, idx) => (
                <span key={idx}>{label}</span>
              ))}
            </div>
          )}

          {/* X Axis Labels */}
          <div className="absolute bottom-0 left-12 right-12 flex justify-between text-[9px] text-gray-400 font-mono pb-1">
            <span>22:00</span>
            <span>00:00</span>
            <span>02:00</span>
            <span>04:00</span>
            <span>06:00</span>
          </div>

          {/* The SVG Line */}
          {svgPath && (
            <div className="absolute inset-0 px-12 py-4 z-10 overflow-hidden pointer-events-none">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path
                  d={svgPath}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
