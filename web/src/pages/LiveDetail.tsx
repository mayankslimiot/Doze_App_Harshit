import {
  ArrowLeft,
  Heart,
  Wind,
  HelpCircle,
  Thermometer,
  Droplets,
  Leaf,
  FlaskConical,
  Loader2,
  ChevronDown,
  ChevronUp,
  WifiOff,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import DetailGraphCard from '@/components/dashboard/DetailGraphCard';
import type { DataPoint } from '@/components/dashboard/VitalsGraph';
import { ZOOM_LEVELS } from '@/components/dashboard/VitalsGraph';
import type { HealthDataPoint } from '@/services/deviceService';
import {
  connectWebSocket,
  subscribeToDevice,
  addHealthDataHandler,
  removeHealthDataHandler,
  disconnectWebSocket,
} from '@/services/websocketService';
import type { HealthDataUpdate } from '@/services/websocketService';
import { getHealthDataRange, getLatestHealthDataPoint } from '@/services/deviceService';

const getSessionDateString = (dateObj: Date) => {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatCycleDate = (dateStr: string) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const end = new Date(y, m - 1, d);
  const start = new Date(y, m - 1, d - 1);

  const startDay = start.getDate();
  const endDay = end.getDate();
  const month = end.toLocaleDateString('en-US', { month: 'short' });
  const year = end.getFullYear();

  return `${startDay}-${endDay} ${month} ${year}`;
};

const MAX_HISTORY = 100_000;

export default function LiveDetail() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const [time, setTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [zoomIndex, setZoomIndex] = useState(0); // 10m default

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [hasNoData, setHasNoData] = useState(false);
  
  // Compute default max date (current cycle)
  let targetDate = new Date();
  targetDate.setHours(0, 0, 0, 0);
  if (new Date().getHours() >= 12) {
    targetDate.setDate(targetDate.getDate() + 1);
  }
  const maxDateStr = getSessionDateString(targetDate);
  const isCurrentCycle = selectedDate === maxDateStr;

  useEffect(() => {
    if (!deviceId) return;
    async function initDefaultDate() {
      try {
        const latestPoint = await getLatestHealthDataPoint(deviceId!);
        if (latestPoint) {
          const d = new Date(latestPoint.timestamp);
          d.setHours(0, 0, 0, 0);
          if (new Date(latestPoint.timestamp).getHours() >= 12) {
            d.setDate(d.getDate() + 1);
          }
          const latestCycleDateStr = getSessionDateString(d);
          setSelectedDate(latestCycleDateStr);
          setHasNoData(false);
        } else {
          setHasNoData(true);
          setSelectedDate(maxDateStr);
        }
      } catch (err) {
        console.error('Failed to init default date:', err);
        setHasNoData(true);
        setSelectedDate(maxDateStr);
      }
    }
    initDefaultDate();
  }, [deviceId, maxDateStr]);

  // Rolling data buffers
  const [hrData, setHrData] = useState<DataPoint[]>([]);
  const [respData, setRespData] = useState<DataPoint[]>([]);
  const [tempData, setTempData] = useState<DataPoint[]>([]);
  const [humidityData, setHumidityData] = useState<DataPoint[]>([]);
  const [iaqData, setIaqData] = useState<DataPoint[]>([]);
  const [tvocData, setTvocData] = useState<DataPoint[]>([]);
  const [stressData, setStressData] = useState<DataPoint[]>([]);

  const [showAllGraphs, setShowAllGraphs] = useState(false);

  // Latest values for header display
  const [latestHr, setLatestHr] = useState<number | null>(null);
  const [latestResp, setLatestResp] = useState<number | null>(null);

  const handlerRef = useRef<((data: HealthDataUpdate) => void) | null>(null);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch historical data on mount or when selectedDate changes
  useEffect(() => {
    if (!deviceId || !selectedDate) return;
    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      try {
        // Parse selectedDate as local date (not UTC)
        const [year, month, day] = selectedDate.split('-').map(Number);
        const endObj = new Date(year, month - 1, day, 12, 0, 0, 0); // noon local on target date
        const startObj = new Date(year, month - 1, day - 1, 12, 0, 0, 0); // noon local day prior

        const startISO = startObj.toISOString();
        let endISO = endObj.toISOString();

        // If it's the current cycle, we only want history up to *now*
        if (selectedDate === maxDateStr) {
          endISO = new Date().toISOString();
        }

        // Fetch range
        const history = await getHealthDataRange(deviceId!, startISO, endISO);
        if (cancelled) return;

        const hr: DataPoint[] = [];
        const resp: DataPoint[] = [];
        const temp: DataPoint[] = [];
        const hum: DataPoint[] = [];
        const iaq: DataPoint[] = [];
        const tvoc: DataPoint[] = [];
        const stress: DataPoint[] = [];

        history.forEach((pt: HealthDataPoint) => {
          if (pt.heartRate != null && pt.heartRate > 0) hr.push({ x: pt.timestamp, y: pt.heartRate });
          if (pt.respiration != null && pt.respiration > 0) resp.push({ x: pt.timestamp, y: pt.respiration });
          if (pt.temperature != null && pt.temperature > 0) temp.push({ x: pt.timestamp, y: pt.temperature });
          if (pt.humidity != null && pt.humidity > 0) hum.push({ x: pt.timestamp, y: pt.humidity });
          if (pt.iaq != null && pt.iaq > 0) iaq.push({ x: pt.timestamp, y: pt.iaq });
          if (pt.tvoc != null && pt.tvoc > 0) tvoc.push({ x: pt.timestamp, y: pt.tvoc });
          if (pt.stress != null && pt.stress > 0) stress.push({ x: pt.timestamp, y: pt.stress });
        });

        // Backend returns data sorted descending (newest first).
        // Sort ascending (oldest first) so getMinAvgMaxMeta and VitalsGraph
        // correctly identify the latest timestamp and compute zoom windows.
        const sortAsc = (a: DataPoint, b: DataPoint) => a.x - b.x;
        hr.sort(sortAsc);
        resp.sort(sortAsc);
        temp.sort(sortAsc);
        hum.sort(sortAsc);
        iaq.sort(sortAsc);
        tvoc.sort(sortAsc);
        stress.sort(sortAsc);

        setHrData(hr.slice(-MAX_HISTORY));
        setRespData(resp.slice(-MAX_HISTORY));
        setTempData(temp.slice(-MAX_HISTORY));
        setHumidityData(hum.slice(-MAX_HISTORY));
        setIaqData(iaq.slice(-MAX_HISTORY));
        setTvocData(tvoc.slice(-MAX_HISTORY));
        setStressData(stress.slice(-MAX_HISTORY));

        if (hr.length > 0) setLatestHr(hr[hr.length - 1].y);
        if (resp.length > 0) setLatestResp(resp[resp.length - 1].y);
      } catch (err) {
        console.error('[LiveDetail] Failed to load history', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHistory();
    return () => { cancelled = true; };
  }, [deviceId, selectedDate, maxDateStr]);

  // WebSocket live updates
  const handleHealthData = useCallback(
    (data: HealthDataUpdate) => {
      if (data.deviceId !== deviceId) return;
      const ts = data.timestampSeconds
        ? (data.timestampSeconds as number) * 1000
        : data.timestamp
        ? new Date(data.timestamp as string).getTime()
        : Date.now();

      const push = (
        setter: React.Dispatch<React.SetStateAction<DataPoint[]>>,
        value: number | null | undefined,
      ) => {
        if (value != null && value > 0) {
          setter((prev) => {
            const next = [...prev, { x: ts, y: value }];
            return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
          });
        }
      };

      push(setHrData, data.heartRate);
      push(setRespData, data.respiration);
      push(setTempData, data.temperature);
      push(setHumidityData, data.humidity);
      push(setIaqData, (data as Record<string, unknown>).iaq as number | null | undefined);
      push(setTvocData, (data as Record<string, unknown>).tvoc as number | null | undefined);
      push(setStressData, data.stress);

      if (data.heartRate != null && data.heartRate > 0) setLatestHr(data.heartRate);
      if (data.respiration != null && data.respiration > 0) setLatestResp(data.respiration);
      
      setHasNoData(false);
    },
    [deviceId],
  );

  useEffect(() => {
    if (!deviceId || !isCurrentCycle) return;
    connectWebSocket();
    subscribeToDevice(deviceId);

    handlerRef.current = handleHealthData;
    addHealthDataHandler(handleHealthData);

    return () => {
      if (handlerRef.current) removeHealthDataHandler(handlerRef.current);
      disconnectWebSocket();
    };
  }, [deviceId, handleHealthData, isCurrentCycle]);

  const handleZoomChange = useCallback((idx: number) => {
    setZoomIndex(idx);
  }, []);

  const getMinAvgMaxMeta = (data: DataPoint[], isFloat = false) => {
    if (data.length === 0) return 'NO DATA';

    // Find latest valid timestamp
    let latest = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].y !== null) {
        latest = data[i].x;
        break;
      }
    }
    if (latest === 0 && data.length > 0) {
      latest = data[data.length - 1].x;
    }

    // Filter data to the current zoom window (same as mobile app)
    const zoom = ZOOM_LEVELS[zoomIndex] ?? ZOOM_LEVELS[0];
    const rangeMs = zoom.rangeSec * 1000;
    const windowStart = latest - rangeMs;

    const windowData = data.filter((p) => p.x >= windowStart && p.x <= latest);
    const vals = windowData.map((p) => p.y).filter((y): y is number => y !== null && y > 0);

    if (vals.length === 0) return 'NO DATA';
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    
    if (isFloat) {
      return `MIN: ${min.toFixed(1)} • AVG: ${avg.toFixed(1)} • MAX: ${max.toFixed(1)}`;
    }
    return `MIN: ${Math.round(min)} • AVG: ${Math.round(avg)} • MAX: ${Math.round(max)}`;
  };



  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center space-x-6">
          <Link
            to="/live"
            className="flex items-center px-4 py-2 border border-gray-200 text-gray-700 rounded-md text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Live Monitoring
          </Link>

          <div>
            <h1 className="text-xl font-bold text-[#0097b2]">Device Detail</h1>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="bg-gray-100 border border-gray-200 text-gray-600 px-3 py-1 rounded-full flex items-center shadow-sm text-[10px] font-bold tracking-widest uppercase">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
            DEVICE: {deviceId || 'UNKNOWN'}
          </div>
          <div className="text-sm font-mono text-gray-500 font-bold tracking-wider">
            {time.toLocaleTimeString('en-US', { hour12: false })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-8 max-w-[1200px] mx-auto space-y-4">
        {/* Device Header Card */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-[#0097b2]" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Device {deviceId}</h2>
              <p className="text-[10px] text-gray-500 font-mono tracking-widest uppercase mt-0.5">
                DEVICE ID: {deviceId} • {isCurrentCycle ? 'LIVE MONITORING' : 'HISTORICAL DATA'}
              </p>
            </div>
          </div>
          
          <div className="flex space-x-12">
            <div className="text-center">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
                Heart Rate
              </div>
              <div className="text-xl font-bold text-[#0097b2]">
                {latestHr != null ? `${Math.round(latestHr)} BPM` : '-- BPM'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
                Respiration
              </div>
              <div className="text-xl font-bold text-blue-500">
                {latestResp != null ? `${Math.round(latestResp)} RPM` : '-- RPM'}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Monitoring Cycle</span>
              <span className="text-sm font-bold text-[#0097b2]">{formatCycleDate(selectedDate)}</span>
            </div>
            <div className="h-8 w-px bg-gray-200"></div>
            <input 
              type="date" 
              value={selectedDate}
              max={maxDateStr}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border-none bg-transparent hover:bg-gray-50 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none cursor-pointer transition-colors"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm font-medium">Loading device data…</p>
          </div>
        ) : hasNoData ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center shadow-sm">
            <WifiOff className="w-12 h-12 text-gray-300 mx-auto mb-4 animate-bounce" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">New Device: No Data Recorded</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              This device is brand new or hasn't recorded any telemetry vitals yet. Real-time data will display here automatically once the device starts transmitting.
            </p>
          </div>
        ) : hrData.length === 0 && respData.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center shadow-sm">
            <WifiOff className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">No Data For Selected Date</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              No telemetry recordings were found for {formatCycleDate(selectedDate)}. Try selecting a different date from the calendar picker.
            </p>
          </div>
        ) : (
          <>
            {/* 1. Heart Rate */}
            <DetailGraphCard
              title="Heart Rate (BPM)"
              icon={<Heart className="w-4 h-4" />}
              iconColor="text-red-500"
              metaText={getMinAvgMaxMeta(hrData)}
              metaColor="text-red-600"
              dataPoints={hrData}
              yAxisLabel="BPM"
              lineColor="#ef4444"
              zoomIndex={zoomIndex}
              onZoomChange={handleZoomChange}
              showZoomSelector
            />

            {/* 2. Respiration */}
            <DetailGraphCard
              title="Respiration (RPM)"
              icon={<Wind className="w-4 h-4" />}
              iconColor="text-blue-500"
              metaText={getMinAvgMaxMeta(respData, true)}
              metaColor="text-blue-600"
              dataPoints={respData}
              yAxisLabel="RPM"
              lineColor="#3b82f6"
              zoomIndex={zoomIndex}
              onZoomChange={handleZoomChange}
              showZoomSelector
            />

            {/* 3. Stress Level */}
            <DetailGraphCard
              title="Stress Level (HRV-BASED)"
              icon={<HelpCircle className="w-4 h-4" />}
              iconColor="text-purple-500"
              metaText={getMinAvgMaxMeta(stressData)}
              metaColor="text-purple-600"
              dataPoints={stressData}
              yAxisLabel="Level"
              lineColor="#8b5cf6"
              yDomain={[0, 100]}
              zoomIndex={zoomIndex}
              onZoomChange={handleZoomChange}
              showZoomSelector
            />

            {/* Toggler button just after stress card */}
            {!showAllGraphs && (
              <div className="flex justify-center my-6">
                <button
                  type="button"
                  onClick={() => setShowAllGraphs(true)}
                  className="inline-flex items-center px-6 py-2.5 bg-white border border-gray-200 rounded-full shadow-sm text-sm font-bold text-gray-700 hover:bg-gray-50 focus:outline-none transition-colors"
                >
                  View More <ChevronDown className="ml-2 w-4 h-4 text-gray-500" />
                </button>
              </div>
            )}

            {showAllGraphs && (
              <>
                {/* 4. Temperature */}
                <DetailGraphCard
                  title="Room Temperature (°C)"
                  icon={<Thermometer className="w-4 h-4" />}
                  iconColor="text-orange-500"
                  metaText={getMinAvgMaxMeta(tempData, true)}
                  metaColor="text-orange-600"
                  dataPoints={tempData}
                  yAxisLabel="°C"
                  lineColor="#f97316"
                  zoomIndex={zoomIndex}
                  onZoomChange={handleZoomChange}
                  showZoomSelector
                />

                {/* 5. Humidity */}
                <DetailGraphCard
                  title="Room Humidity (%)"
                  icon={<Droplets className="w-4 h-4" />}
                  iconColor="text-[#00c4b5]"
                  metaText={getMinAvgMaxMeta(humidityData)}
                  metaColor="text-[#00c4b5]"
                  dataPoints={humidityData}
                  yAxisLabel="%"
                  lineColor="#00c4b5"
                  zoomIndex={zoomIndex}
                  onZoomChange={handleZoomChange}
                  showZoomSelector
                />

                {/* 6. IAQ Score */}
                <DetailGraphCard
                  title="IAQ Score"
                  icon={<Leaf className="w-4 h-4" />}
                  iconColor="text-green-600"
                  metaText={getMinAvgMaxMeta(iaqData)}
                  metaColor="text-green-600"
                  dataPoints={iaqData}
                  yAxisLabel="IAQ"
                  lineColor="#16a34a"
                  yDomain={[0, 500]}
                  zoomIndex={zoomIndex}
                  onZoomChange={handleZoomChange}
                  showZoomSelector
                />

                {/* 7. TVOC */}
                <DetailGraphCard
                  title="TVOC (PPB)"
                  icon={<FlaskConical className="w-4 h-4" />}
                  iconColor="text-gray-700"
                  metaText={getMinAvgMaxMeta(tvocData)}
                  metaColor="text-gray-700"
                  dataPoints={tvocData}
                  yAxisLabel="PPB"
                  lineColor="#374151"
                  zoomIndex={zoomIndex}
                  onZoomChange={handleZoomChange}
                  showZoomSelector
                />

                {/* View Less button at the bottom */}
                <div className="flex justify-center mt-6 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAllGraphs(false);
                      // Scroll up back to stress area
                      window.scrollTo({ top: 300, behavior: 'smooth' });
                    }}
                    className="inline-flex items-center px-6 py-2.5 bg-white border border-gray-200 rounded-full shadow-sm text-sm font-bold text-gray-700 hover:bg-gray-50 focus:outline-none transition-colors"
                  >
                    View Less <ChevronUp className="ml-2 w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </>
            )}
          </>
        )}


      </div>
    </div>
  );
}
