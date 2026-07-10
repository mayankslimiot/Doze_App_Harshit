import DashboardLayout from '@/components/layout/DashboardLayout';
import { Download, CheckSquare, Square, Loader2, FileText, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDevices, getUserProfile, getSessions } from '@/services/deviceService';
import { apiUrl } from '@/services/api';
import { jsPDF } from 'jspdf';

function drawVitalsTrend(
  canvas: HTMLCanvasElement, 
  points: { x: number; hr: number | null; rr: number | null }[], 
  xAxisRange?: { min: number; max: number },
  selectedMetrics?: { hr: boolean; respiration: boolean }
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const drawHr = selectedMetrics ? selectedMetrics.hr : true;
  const drawRr = selectedMetrics ? selectedMetrics.respiration : true;

  const margin = { top: 40, right: 60, bottom: 50, left: 60 };
  const graphWidth = canvas.width - margin.left - margin.right;
  const graphHeight = canvas.height - margin.top - margin.bottom;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Heart Rate & Respiration Rate Trends', margin.left, 25);

  if (!drawHr && !drawRr) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px sans-serif';
    ctx.fillText('No vitals metrics selected for this chart.', canvas.width / 2 - 130, canvas.height / 2);
    return;
  }

  const validPoints = points.filter(pt => (drawHr && pt.hr && pt.hr > 0) || (drawRr && pt.rr && pt.rr > 0));

  if (validPoints.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px sans-serif';
    ctx.fillText('No vitals telemetry data recorded for this range.', canvas.width / 2 - 150, canvas.height / 2);
    return;
  }

  const tMin = xAxisRange ? xAxisRange.min : Math.min(...validPoints.map(p => p.x));
  const tMax = xAxisRange ? xAxisRange.max : Math.max(...validPoints.map(p => p.x));
  
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#64748b';
  ctx.font = '11px sans-serif';

  const numGridLines = 6;
  for (let i = 0; i <= numGridLines; i++) {
    const ratio = i / numGridLines;
    const x = margin.left + ratio * graphWidth;
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, margin.top + graphHeight);
    ctx.stroke();

    const t = tMin + ratio * (tMax - tMin);
    const timeStr = new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    ctx.fillText(timeStr, x - 18, margin.top + graphHeight + 18);
  }

  const hrRange = { min: 40, max: 140 };
  const rrRange = { min: 5, max: 35 };

  const numYLines = 5;
  for (let i = 0; i <= numYLines; i++) {
    const ratio = i / numYLines;
    const y = margin.top + graphHeight - ratio * graphHeight;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + graphWidth, y);
    ctx.stroke();

    const hrVal = Math.round(hrRange.min + ratio * (hrRange.max - hrRange.min));
    ctx.fillStyle = '#ef4444';
    ctx.fillText(String(hrVal), margin.left - 30, y + 4);

    const rrVal = Math.round(rrRange.min + ratio * (rrRange.max - rrRange.min));
    ctx.fillStyle = '#0097b2';
    ctx.fillText(String(rrVal), margin.left + graphWidth + 12, y + 4);
  }

  ctx.save();
  ctx.translate(18, margin.top + graphHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('Heart Rate (bpm)', -50, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(canvas.width - 18, margin.top + graphHeight / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = '#0097b2';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('Respiration (rpm)', -50, 0);
  ctx.restore();

  const getX = (t: number) => margin.left + ((t - tMin) / (tMax - tMin || 1)) * graphWidth;
  const getHrY = (val: number) => {
    const clamped = Math.max(hrRange.min, Math.min(hrRange.max, val));
    return margin.top + graphHeight - ((clamped - hrRange.min) / (hrRange.max - hrRange.min)) * graphHeight;
  };
  const getRrY = (val: number) => {
    const clamped = Math.max(rrRange.min, Math.min(rrRange.max, val));
    return margin.top + graphHeight - ((clamped - rrRange.min) / (rrRange.max - rrRange.min)) * graphHeight;
  };

  let gapThresholdMs = 90 * 1000; 
  if (points.length > 1) {
    const diffs = [];
    for (let i = 1; i < points.length; i++) {
      const diff = points[i].x - points[i - 1].x;
      if (diff > 0 && diff < 30 * 60 * 1000) {
        diffs.push(diff);
      }
    }
    if (diffs.length > 0) {
      const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      gapThresholdMs = Math.max(90 * 1000, avgDiff * 2.5);
    }
  }

  // Draw Heart Rate line in segments
  if (drawHr) {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    let inHrSegment = false;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const hasValidHr = p.hr !== null && p.hr > 0;
      const hasTimeGap = i > 0 && (p.x - points[i - 1].x > gapThresholdMs);

      if (hasValidHr && !hasTimeGap) {
        const x = getX(p.x);
        const y = getHrY(p.hr!);
        if (!inHrSegment) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          inHrSegment = true;
        } else {
          ctx.lineTo(x, y);
        }
      } else {
        if (inHrSegment) {
          ctx.stroke();
          inHrSegment = false;
        }
        if (hasValidHr) {
          ctx.beginPath();
          ctx.moveTo(getX(p.x), getHrY(p.hr!));
          inHrSegment = true;
        }
      }
    }
    if (inHrSegment) {
      ctx.stroke();
    }
  }

  // Draw Respiration Rate line in segments
  if (drawRr) {
    ctx.strokeStyle = '#0097b2';
    ctx.lineWidth = 2;
    let inRrSegment = false;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const hasValidRr = p.rr !== null && p.rr > 0;
      const hasTimeGap = i > 0 && (p.x - points[i - 1].x > gapThresholdMs);

      if (hasValidRr && !hasTimeGap) {
        const x = getX(p.x);
        const y = getRrY(p.rr!);
        if (!inRrSegment) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          inRrSegment = true;
        } else {
          ctx.lineTo(x, y);
        }
      } else {
        if (inRrSegment) {
          ctx.stroke();
          inRrSegment = false;
        }
        if (hasValidRr) {
          ctx.beginPath();
          ctx.moveTo(getX(p.x), getRrY(p.rr!));
          inRrSegment = true;
        }
      }
    }
    if (inRrSegment) {
      ctx.stroke();
    }
  }

  let legendX = margin.left;
  if (drawHr) {
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(legendX, margin.top + graphHeight + 32, 18, 10);
    ctx.fillStyle = '#0f172a';
    ctx.font = '12px sans-serif';
    ctx.fillText('Heart Rate', legendX + 26, margin.top + graphHeight + 41);
    legendX += 140;
  }

  if (drawRr) {
    ctx.fillStyle = '#0097b2';
    ctx.fillRect(legendX, margin.top + graphHeight + 32, 18, 10);
    ctx.fillStyle = '#0f172a';
    ctx.font = '12px sans-serif';
    ctx.fillText('Respiration Rate', legendX + 26, margin.top + graphHeight + 41);
  }
}

function drawHypnogram(canvas: HTMLCanvasElement, stageTimeline: any[], xAxisRange?: { min: number; max: number }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const margin = { top: 40, right: 60, bottom: 50, left: 60 };
  const graphWidth = canvas.width - margin.left - margin.right;
  const graphHeight = canvas.height - margin.top - margin.bottom;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Sleep Stage Hypnogram', margin.left, 25);

  const validTimeline = stageTimeline.filter(pt => pt.stage && pt.stage !== 'N/A');

  if (validTimeline.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px sans-serif';
    ctx.fillText('No sleep stage hypnogram data recorded.', canvas.width / 2 - 150, canvas.height / 2);
    return;
  }

  const stages = ['AWAKE', 'REM', 'LIGHT', 'DEEP'];
  const getStageY = (stage: string) => {
    const idx = stages.indexOf(stage);
    const segment = graphHeight / (stages.length - 1);
    return margin.top + (idx >= 0 ? idx : 0) * segment;
  };

  const tMin = xAxisRange ? xAxisRange.min : Math.min(...validTimeline.map(p => p.ts * 1000));
  const tMax = xAxisRange ? xAxisRange.max : Math.max(...validTimeline.map(p => p.ts * 1000));
  
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 1;
  ctx.font = '11px sans-serif';

  stages.forEach((stage) => {
    const y = getStageY(stage);
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + graphWidth, y);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.fillText(stage, margin.left - 52, y + 4);
  });

  const numGridLines = 6;
  ctx.fillStyle = '#64748b';
  for (let i = 0; i <= numGridLines; i++) {
    const ratio = i / numGridLines;
    const x = margin.left + ratio * graphWidth;
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, margin.top + graphHeight);
    ctx.stroke();

    const t = tMin + ratio * (tMax - tMin);
    const timeStr = new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    ctx.fillText(timeStr, x - 18, margin.top + graphHeight + 18);
  }

  const getX = (ts: number) => margin.left + ((ts * 1000 - tMin) / (tMax - tMin || 1)) * graphWidth;

  ctx.strokeStyle = '#4f46e5';
  ctx.lineWidth = 2.5;
  ctx.beginPath();

  validTimeline.forEach((pt, idx) => {
    const x = getX(pt.ts);
    const y = getStageY(pt.stage);

    if (idx === 0) {
      ctx.moveTo(x, y);
    } else {
      const prevPt = validTimeline[idx - 1];
      const prevY = getStageY(prevPt.stage);

      ctx.lineTo(x, prevY);
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  const legendColors: Record<string, string> = {
    AWAKE: '#f97316',
    REM: '#06b6d4',
    LIGHT: '#3b82f6',
    DEEP: '#1e3a8a'
  };

  stages.forEach((stage, idx) => {
    const xOffset = margin.left + idx * 120;
    ctx.fillStyle = legendColors[stage] || '#4f46e5';
    ctx.fillRect(xOffset, margin.top + graphHeight + 32, 15, 10);
    ctx.fillStyle = '#0f172a';
    ctx.font = '12px sans-serif';
    ctx.fillText(stage, xOffset + 22, margin.top + graphHeight + 41);
  });
}

function drawEnvironmentTrend(
  canvas: HTMLCanvasElement, 
  rawHistory: any[], 
  xAxisRange?: { min: number; max: number },
  selectedMetrics?: { temp: boolean; humidity: boolean }
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const drawTemp = selectedMetrics ? selectedMetrics.temp : true;
  const drawHum = selectedMetrics ? selectedMetrics.humidity : true;

  const margin = { top: 40, right: 60, bottom: 50, left: 60 };
  const graphWidth = canvas.width - margin.left - margin.right;
  const graphHeight = canvas.height - margin.top - margin.bottom;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Room Temperature & Humidity Trends', margin.left, 25);

  if (!drawTemp && !drawHum) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px sans-serif';
    ctx.fillText('No environment metrics selected for this chart.', canvas.width / 2 - 150, canvas.height / 2);
    return;
  }

  const points = rawHistory
    .map(d => ({
      x: new Date(d.timestamp).getTime(),
      temp: d.temperature,
      hum: d.humidity
    }))
    .filter(pt => (drawTemp && pt.temp && pt.temp > 0) || (drawHum && pt.hum && pt.hum > 0));

  if (points.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px sans-serif';
    ctx.fillText('No environment telemetry data recorded for this range.', canvas.width / 2 - 170, canvas.height / 2);
    return;
  }

  const tMin = xAxisRange ? xAxisRange.min : Math.min(...points.map(p => p.x));
  const tMax = xAxisRange ? xAxisRange.max : Math.max(...points.map(p => p.x));

  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#64748b';
  ctx.font = '11px sans-serif';

  const numGridLines = 6;
  for (let i = 0; i <= numGridLines; i++) {
    const ratio = i / numGridLines;
    const x = margin.left + ratio * graphWidth;
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, margin.top + graphHeight);
    ctx.stroke();

    const t = tMin + ratio * (tMax - tMin);
    const timeStr = new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    ctx.fillText(timeStr, x - 18, margin.top + graphHeight + 18);
  }

  const tempRange = { min: 10, max: 40 };
  const humRange = { min: 10, max: 90 };

  const numYLines = 5;
  for (let i = 0; i <= numYLines; i++) {
    const ratio = i / numYLines;
    const y = margin.top + graphHeight - ratio * graphHeight;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + graphWidth, y);
    ctx.stroke();

    const tempVal = Math.round(tempRange.min + ratio * (tempRange.max - tempRange.min));
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(`${tempVal}°C`, margin.left - 35, y + 4);

    const humVal = Math.round(humRange.min + ratio * (humRange.max - humRange.min));
    ctx.fillStyle = '#3b82f6';
    ctx.fillText(`${humVal}%`, margin.left + graphWidth + 12, y + 4);
  }

  const getX = (t: number) => margin.left + ((t - tMin) / (tMax - tMin || 1)) * graphWidth;
  const getTempY = (val: number) => {
    const clamped = Math.max(tempRange.min, Math.min(tempRange.max, val));
    return margin.top + graphHeight - ((clamped - tempRange.min) / (tempRange.max - tempRange.min)) * graphHeight;
  };
  const getHumY = (val: number) => {
    const clamped = Math.max(humRange.min, Math.min(humRange.max, val));
    return margin.top + graphHeight - ((clamped - humRange.min) / (humRange.max - humRange.min)) * graphHeight;
  };

  // Determine gap threshold dynamically based on median/average rate
  let gapThresholdMs = 90 * 1000;
  if (points.length > 1) {
    const diffs = [];
    for (let i = 1; i < points.length; i++) {
      const diff = points[i].x - points[i - 1].x;
      if (diff > 0 && diff < 30 * 60 * 1000) {
        diffs.push(diff);
      }
    }
    if (diffs.length > 0) {
      const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      gapThresholdMs = Math.max(90 * 1000, avgDiff * 2.5);
    }
  }

  // Draw Temperature line in segments
  if (drawTemp) {
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    let inTempSegment = false;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const hasValidTemp = p.temp !== null && p.temp > 0;
      const hasTimeGap = i > 0 && (p.x - points[i - 1].x > gapThresholdMs);

      if (hasValidTemp && !hasTimeGap) {
        const x = getX(p.x);
        const y = getTempY(p.temp!);
        if (!inTempSegment) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          inTempSegment = true;
        } else {
          ctx.lineTo(x, y);
        }
      } else {
        if (inTempSegment) {
          ctx.stroke();
          inTempSegment = false;
        }
        if (hasValidTemp) {
          ctx.beginPath();
          ctx.moveTo(getX(p.x), getTempY(p.temp!));
          inTempSegment = true;
        }
      }
    }
    if (inTempSegment) {
      ctx.stroke();
    }
  }

  // Draw Humidity line in segments
  if (drawHum) {
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    let inHumSegment = false;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const hasValidHum = p.hum !== null && p.hum > 0;
      const hasTimeGap = i > 0 && (p.x - points[i - 1].x > gapThresholdMs);

      if (hasValidHum && !hasTimeGap) {
        const x = getX(p.x);
        const y = getHumY(p.hum!);
        if (!inHumSegment) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          inHumSegment = true;
        } else {
          ctx.lineTo(x, y);
        }
      } else {
        if (inHumSegment) {
          ctx.stroke();
          inHumSegment = false;
        }
        if (hasValidHum) {
          ctx.beginPath();
          ctx.moveTo(getX(p.x), getHumY(p.hum!));
          inHumSegment = true;
        }
      }
    }
    if (inHumSegment) {
      ctx.stroke();
    }
  }

  let legendX = margin.left;
  if (drawTemp) {
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(legendX, margin.top + graphHeight + 32, 18, 10);
    ctx.fillStyle = '#0f172a';
    ctx.font = '12px sans-serif';
    ctx.fillText('Temperature (°C)', legendX + 26, margin.top + graphHeight + 41);
    legendX += 160;
  }

  if (drawHum) {
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(legendX, margin.top + graphHeight + 32, 18, 10);
    ctx.fillStyle = '#0f172a';
    ctx.font = '12px sans-serif';
    ctx.fillText('Humidity (%)', legendX + 26, margin.top + graphHeight + 41);
  }
}

function drawStressTrend(
  canvas: HTMLCanvasElement, 
  points: { x: number; stress: number | null }[], 
  xAxisRange?: { min: number; max: number }
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const margin = { top: 40, right: 60, bottom: 50, left: 60 };
  const graphWidth = canvas.width - margin.left - margin.right;
  const graphHeight = canvas.height - margin.top - margin.bottom;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Stress Index Trend', margin.left, 25);

  const validPoints = points.filter(pt => pt.stress !== null && pt.stress >= 0);

  if (validPoints.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px sans-serif';
    ctx.fillText('No stress index telemetry data recorded for this range.', canvas.width / 2 - 170, canvas.height / 2);
    return;
  }

  const tMin = xAxisRange ? xAxisRange.min : Math.min(...validPoints.map(p => p.x));
  const tMax = xAxisRange ? xAxisRange.max : Math.max(...validPoints.map(p => p.x));
  
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#64748b';
  ctx.font = '11px sans-serif';

  const numGridLines = 6;
  for (let i = 0; i <= numGridLines; i++) {
    const ratio = i / numGridLines;
    const x = margin.left + ratio * graphWidth;
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, margin.top + graphHeight);
    ctx.stroke();

    const t = tMin + ratio * (tMax - tMin);
    const timeStr = new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    ctx.fillText(timeStr, x - 18, margin.top + graphHeight + 18);
  }

  const stressRange = { min: 0, max: 100 };

  const numYLines = 5;
  for (let i = 0; i <= numYLines; i++) {
    const ratio = i / numYLines;
    const y = margin.top + graphHeight - ratio * graphHeight;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + graphWidth, y);
    ctx.stroke();

    const stressVal = Math.round(stressRange.min + ratio * (stressRange.max - stressRange.min));
    ctx.fillStyle = '#8b5cf6';
    ctx.fillText(String(stressVal), margin.left - 25, y + 4);
  }

  const getX = (t: number) => margin.left + ((t - tMin) / (tMax - tMin || 1)) * graphWidth;
  const getStressY = (val: number) => {
    const clamped = Math.max(stressRange.min, Math.min(stressRange.max, val));
    return margin.top + graphHeight - ((clamped - stressRange.min) / (stressRange.max - stressRange.min)) * graphHeight;
  };

  const gapThresholdMs = 90 * 1000;
  ctx.strokeStyle = '#8b5cf6';
  ctx.lineWidth = 2;
  let inSegment = false;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const hasValidStress = p.stress !== null && p.stress >= 0;
    const hasTimeGap = i > 0 && (p.x - points[i - 1].x > gapThresholdMs);

    if (hasValidStress && !hasTimeGap) {
      const x = getX(p.x);
      const y = getStressY(p.stress!);
      if (!inSegment) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        inSegment = true;
      } else {
        ctx.lineTo(x, y);
      }
    } else {
      if (inSegment) {
        ctx.stroke();
        inSegment = false;
      }
      if (hasValidStress) {
        ctx.beginPath();
        ctx.moveTo(getX(p.x), getStressY(p.stress!));
        inSegment = true;
      }
    }
  }
  if (inSegment) {
    ctx.stroke();
  }

  ctx.fillStyle = '#8b5cf6';
  ctx.fillRect(margin.left, margin.top + graphHeight + 32, 18, 10);
  ctx.fillStyle = '#0f172a';
  ctx.font = '12px sans-serif';
  ctx.fillText('Stress Index', margin.left + 26, margin.top + graphHeight + 41);
}

function drawAirQualityTrend(
  canvas: HTMLCanvasElement, 
  points: { x: number; tvoc: number | null; iaq: number | null }[], 
  xAxisRange?: { min: number; max: number },
  selectedMetrics?: { tvoc: boolean; iaq: boolean }
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const drawTvoc = selectedMetrics ? selectedMetrics.tvoc : true;
  const drawIaq = selectedMetrics ? selectedMetrics.iaq : true;

  const margin = { top: 40, right: 60, bottom: 50, left: 60 };
  const graphWidth = canvas.width - margin.left - margin.right;
  const graphHeight = canvas.height - margin.top - margin.bottom;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Indoor Air Quality (IAQ) & TVOC Trends', margin.left, 25);

  if (!drawTvoc && !drawIaq) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px sans-serif';
    ctx.fillText('No air quality metrics selected for this chart.', canvas.width / 2 - 140, canvas.height / 2);
    return;
  }

  const validPoints = points.filter(pt => (drawTvoc && pt.tvoc !== null && pt.tvoc >= 0) || (drawIaq && pt.iaq !== null && pt.iaq >= 0));

  if (validPoints.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px sans-serif';
    ctx.fillText('No air quality telemetry data recorded for this range.', canvas.width / 2 - 170, canvas.height / 2);
    return;
  }

  const tMin = xAxisRange ? xAxisRange.min : Math.min(...validPoints.map(p => p.x));
  const tMax = xAxisRange ? xAxisRange.max : Math.max(...validPoints.map(p => p.x));
  
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#64748b';
  ctx.font = '11px sans-serif';

  const numGridLines = 6;
  for (let i = 0; i <= numGridLines; i++) {
    const ratio = i / numGridLines;
    const x = margin.left + ratio * graphWidth;
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, margin.top + graphHeight);
    ctx.stroke();

    const t = tMin + ratio * (tMax - tMin);
    const timeStr = new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    ctx.fillText(timeStr, x - 18, margin.top + graphHeight + 18);
  }

  const tvocRange = { min: 0, max: 1200 };
  const iaqRange = { min: 0, max: 500 };

  const numYLines = 5;
  for (let i = 0; i <= numYLines; i++) {
    const ratio = i / numYLines;
    const y = margin.top + graphHeight - ratio * graphHeight;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + graphWidth, y);
    ctx.stroke();

    const iaqVal = Math.round(iaqRange.min + ratio * (iaqRange.max - iaqRange.min));
    ctx.fillStyle = '#10b981';
    ctx.fillText(String(iaqVal), margin.left - 30, y + 4);

    const tvocVal = Math.round(tvocRange.min + ratio * (tvocRange.max - tvocRange.min));
    ctx.fillStyle = '#d97706';
    ctx.fillText(String(tvocVal), margin.left + graphWidth + 12, y + 4);
  }

  ctx.save();
  ctx.translate(18, margin.top + graphHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('IAQ Score', -30, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(canvas.width - 18, margin.top + graphHeight / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = '#d97706';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('TVOC (ppb)', -30, 0);
  ctx.restore();

  const getX = (t: number) => margin.left + ((t - tMin) / (tMax - tMin || 1)) * graphWidth;
  const getIaqY = (val: number) => {
    const clamped = Math.max(iaqRange.min, Math.min(iaqRange.max, val));
    return margin.top + graphHeight - ((clamped - iaqRange.min) / (iaqRange.max - iaqRange.min)) * graphHeight;
  };
  const getTvocY = (val: number) => {
    const clamped = Math.max(tvocRange.min, Math.min(tvocRange.max, val));
    return margin.top + graphHeight - ((clamped - tvocRange.min) / (tvocRange.max - tvocRange.min)) * graphHeight;
  };

  const gapThresholdMs = 90 * 1000;

  if (drawIaq) {
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    let inIaqSegment = false;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const hasValidIaq = p.iaq !== null && p.iaq >= 0;
      const hasTimeGap = i > 0 && (p.x - points[i - 1].x > gapThresholdMs);

      if (hasValidIaq && !hasTimeGap) {
        const x = getX(p.x);
        const y = getIaqY(p.iaq!);
        if (!inIaqSegment) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          inIaqSegment = true;
        } else {
          ctx.lineTo(x, y);
        }
      } else {
        if (inIaqSegment) {
          ctx.stroke();
          inIaqSegment = false;
        }
        if (hasValidIaq) {
          ctx.beginPath();
          ctx.moveTo(getX(p.x), getIaqY(p.iaq!));
          inIaqSegment = true;
        }
      }
    }
    if (inIaqSegment) {
      ctx.stroke();
    }
  }

  if (drawTvoc) {
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    let inTvocSegment = false;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const hasValidTvoc = p.tvoc !== null && p.tvoc >= 0;
      const hasTimeGap = i > 0 && (p.x - points[i - 1].x > gapThresholdMs);

      if (hasValidTvoc && !hasTimeGap) {
        const x = getX(p.x);
        const y = getTvocY(p.tvoc!);
        if (!inTvocSegment) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          inTvocSegment = true;
        } else {
          ctx.lineTo(x, y);
        }
      } else {
        if (inTvocSegment) {
          ctx.stroke();
          inTvocSegment = false;
        }
        if (hasValidTvoc) {
          ctx.beginPath();
          ctx.moveTo(getX(p.x), getTvocY(p.tvoc!));
          inTvocSegment = true;
        }
      }
    }
    if (inTvocSegment) {
      ctx.stroke();
    }
  }

  let legendX = margin.left;
  if (drawIaq) {
    ctx.fillStyle = '#10b981';
    ctx.fillRect(legendX, margin.top + graphHeight + 32, 18, 10);
    ctx.fillStyle = '#0f172a';
    ctx.font = '12px sans-serif';
    ctx.fillText('IAQ Index', legendX + 26, margin.top + graphHeight + 41);
    legendX += 140;
  }

  if (drawTvoc) {
    ctx.fillStyle = '#d97706';
    ctx.fillRect(legendX, margin.top + graphHeight + 32, 18, 10);
    ctx.fillStyle = '#0f172a';
    ctx.font = '12px sans-serif';
    ctx.fillText('TVOC', legendX + 26, margin.top + graphHeight + 41);
  }
}

export default function Reports() {
  const getTodayDateString = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getYesterdayDateString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getCurrentTimeString = () => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [selectionMode, setSelectionMode] = useState<'device' | 'patient'>('device');
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  
  // Date/Time selection state pre-filled with last 24 hours
  const [startDate, setStartDate] = useState(getYesterdayDateString());
  const [startTime, setStartTime] = useState(getCurrentTimeString());
  const [endDate, setEndDate] = useState(getTodayDateString());
  const [endTime, setEndTime] = useState(getCurrentTimeString());

  const todayStr = getTodayDateString();
  const maxStartTime = startDate === todayStr ? getCurrentTimeString() : undefined;
  const maxEndTime = endDate === todayStr ? getCurrentTimeString() : undefined;

  // Checking data state
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ count: number; error: string | null; data: any[] | null } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [contents, setContents] = useState({
    hr: true,
    respiration: true,
    stress: true,
    temp: false,
    humidity: false,
    tvoc: false,
    iaq: false,
    sleep: true,
  });

  const isSleepStagePresent = (checkResult?.data || []).some(d => d.sleepStage && d.sleepStage !== 'N/A');

  const isAllChecked = Object.values(contents).every(Boolean);

  const toggleAll = () => {
    const nextState = !isAllChecked;
    setContents({
      hr: nextState,
      respiration: nextState,
      stress: nextState,
      temp: nextState,
      humidity: nextState,
      tvoc: nextState,
      iaq: nextState,
      sleep: nextState,
    });
  };

  const toggleContent = (key: keyof typeof contents) => {
    setContents(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Device list & User Profile from backend
  const { data: devices = [], isLoading: devicesLoading } = useQuery({
    queryKey: ['dashboard_devices'],
    queryFn: getDevices,
    staleTime: 30000,
  });

  const { data: sessions = [] } = useQuery<any[]>({
    queryKey: ['dashboard_sessions'],
    queryFn: getSessions,
    staleTime: 30000,
  });

  const uniquePatients = Array.from(
    new Map(
      sessions
        .filter(s => s.patientId || s.patientCode)
        .map(s => [s.patientId || s.patientCode, s])
    ).values()
  );

  const { data: profile } = useQuery<any>({
    queryKey: ['user_profile'],
    queryFn: getUserProfile,
    staleTime: 60000 * 5,
  });

  const isOtherOrg = profile?.account?.organizationId?.organizationType === 'other';

  // Reset check result when inputs change
  useEffect(() => {
    setCheckResult(null);
  }, [selectedDeviceId, selectedPatientId, selectionMode, startDate, startTime, endDate, endTime]);

  const handleCheckData = async () => {
    let targetDeviceId = selectedDeviceId;

    if (selectionMode === 'device') {
      if (!selectedDeviceId) {
        alert("Please select a device.");
        return;
      }
    } else {
      if (!selectedPatientId) {
        alert("Please select a patient.");
        return;
      }
      const patientSession = uniquePatients.find(p => (p.patientId || p.patientCode) === selectedPatientId);
      if (!patientSession || !patientSession.deviceId) {
        alert("Selected patient does not have an active device or session.");
        return;
      }
      targetDeviceId = patientSession.deviceId;
    }

    if (!startDate || !startTime || !endDate || !endTime) {
      alert("Please fill in all fields (Start Date/Time, End Date/Time).");
      return;
    }

    setIsChecking(true);
    setCheckResult(null);

    const startObj = new Date(`${startDate}T${startTime}:00`);
    const endObj = new Date(`${endDate}T${endTime}:00`);
    const now = new Date();

    if (startObj > now) {
      alert("Start date and time cannot be in the future.");
      setIsChecking(false);
      return;
    }
    if (endObj > now) {
      alert("End date and time cannot be in the future.");
      setIsChecking(false);
      return;
    }
    if (startObj >= endObj) {
      alert("Start date and time must be before End date and time.");
      setIsChecking(false);
      return;
    }

    const startDateTime = startObj.toISOString();
    const endDateTime = endObj.toISOString();

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/history?deviceId=${targetDeviceId}&start=${startDateTime}&end=${endDateTime}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (res.ok && Array.isArray(data)) {
        setCheckResult({ count: data.length, error: null, data: data });
      } else {
        setCheckResult({ count: 0, error: data.message || 'Failed to fetch data.', data: null });
      }
    } catch (err: any) {
      setCheckResult({ count: 0, error: 'Network error checking data.', data: null });
    } finally {
      setIsChecking(false);
    }
  };

  const handleExportPDF = async () => {
    if (!checkResult?.data || checkResult.data.length === 0) return;
    setExporting(true);
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      const addPageHeader = (pageNumber: number) => {
        doc.setFillColor(15, 23, 42); // slate-900
        doc.rect(0, 0, pageWidth, 20, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('DOZEMATE HISTORICAL ANALYTICS REPORT', 15, 12);
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Page ${pageNumber}`, pageWidth - 25, 12);
        
        doc.setDrawColor(226, 232, 240);
        doc.line(0, 20, pageWidth, 20);
      };

      const addPageFooter = () => {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text('Disclaimer: Dozemate is currently under clinical evaluation. Data presented is for trial monitoring purposes only and is non-diagnostic.', 15, pageHeight - 12, { maxWidth: pageWidth - 30 });
      };

      const patientSession = uniquePatients.find(p => (p.patientId || p.patientCode) === selectedPatientId);
      const deviceName = devices.find(d => d.id === selectedDeviceId)?.name || selectedDeviceId;

      // Calculate averages from data
      const hrPoints = checkResult.data.map(d => d.heartRate).filter(v => v && v > 0);
      const respPoints = checkResult.data.map(d => d.respiration).filter(v => v && v > 0);
      const tempPoints = checkResult.data.map(d => d.temperature).filter(v => v && v > 0);
      const humPoints = checkResult.data.map(d => d.humidity).filter(v => v && v > 0);

      const avgHr = hrPoints.length ? Math.round(hrPoints.reduce((a, b) => a + b, 0) / hrPoints.length) : null;
      const avgResp = respPoints.length ? Math.round(respPoints.reduce((a, b) => a + b, 0) / respPoints.length) : null;
      const avgTemp = tempPoints.length ? Math.round((tempPoints.reduce((a, b) => a + b, 0) / tempPoints.length) * 10) / 10 : null;
      const avgHum = humPoints.length ? Math.round(humPoints.reduce((a, b) => a + b, 0) / humPoints.length) : null;

      // -------------------------------------------------------------
      // PAGE 1: Complete Detailed Summary
      // -------------------------------------------------------------
      addPageHeader(1);
      
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      
      if (selectionMode === 'patient') {
        doc.text(isOtherOrg ? 'User Clinical Summary Report' : 'Patient Clinical Summary Report', 15, 32);
      } else {
        doc.text(isOtherOrg ? 'User Performance Summary' : 'Device Performance Summary', 15, 32);
      }
      
      doc.setDrawColor(0, 151, 178); // teal
      doc.setLineWidth(1);
      doc.line(15, 35, 80, 35);
      
      let averagesBoxY = 110;
      let y = 49;
      const drawMetaField = (label: string, value: string, x: number) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text(label.toUpperCase(), x, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42); // slate-900
        doc.text(value || 'N/A', x, y + 5);
      };

      if (selectionMode === 'patient' && patientSession) {
        // General Metadata Box for Patient
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.rect(13, 42, pageWidth - 26, 74, 'F');
        doc.rect(13, 42, pageWidth - 26, 74);

        drawMetaField(isOtherOrg ? 'User Name' : 'Patient Name', patientSession.name || 'Anonymous', 20);
        drawMetaField(isOtherOrg ? 'User Code' : 'Patient Code', selectedPatientId, 110);
        
        y += 16;
        drawMetaField('Age / Sex', `${patientSession.age || 'N/A'} / ${patientSession.sex || 'N/A'}`, 20);
        drawMetaField('Ward / Bed', `${patientSession.room || 'N/A'} / ${patientSession.bed || 'N/A'}`, 110);
        
        y += 16;
        drawMetaField('Admission Date', patientSession.admissionDate ? new Date(patientSession.admissionDate).toLocaleDateString() : 'N/A', 20);
        drawMetaField('Discharge Date', patientSession.dischargeDate ? new Date(patientSession.dischargeDate).toLocaleDateString() : 'N/A', 110);

        y += 16;
        drawMetaField('Assigned Device ID', patientSession.deviceId || 'N/A', 20);
        drawMetaField('Report Range', `${startDate} ${startTime} to ${endDate} ${endTime}`, 110);

        averagesBoxY = 128;
      } else {
        // General Metadata Box for Device Mode
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.rect(13, 42, pageWidth - 26, 56, 'F');
        doc.rect(13, 42, pageWidth - 26, 56);

        drawMetaField('Device Name', deviceName, 20);
        drawMetaField('Device ID', selectedDeviceId, 110);
        
        y += 16;
        drawMetaField('Report Start Range', `${startDate} ${startTime}`, 20);
        drawMetaField('Report End Range', `${endDate} ${endTime}`, 110);
        
        y += 16;
        drawMetaField('Total Data Points', `${checkResult.count} epochs`, 20);
        drawMetaField('Report Exported At', new Date().toLocaleString(), 110);

        averagesBoxY = 110;
      }

      // Averages Box
      y = averagesBoxY;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Performance Summary & Averages', 15, y);

      doc.setFillColor(255, 255, 255);
      doc.rect(15, y + 3, pageWidth - 30, 48);

      let tableY = y + 8;
      const drawTableRow = (label: string, val: string) => {
        doc.setFont('helvetica', 'bold');
        doc.text(label, 20, tableY + 2);
        doc.setFont('helvetica', 'normal');
        doc.text(val, 135, tableY + 2);
        doc.setDrawColor(241, 245, 249);
        doc.line(15, tableY + 5, 195, tableY + 5);
        tableY += 8;
      };

      drawTableRow('Average Heart Rate', avgHr ? `${avgHr} bpm` : 'N/A');
      drawTableRow('Average Respiration Rate', avgResp ? `${avgResp} rpm` : 'N/A');
      drawTableRow('Average Room Temperature', avgTemp ? `${avgTemp} °C` : 'N/A');
      drawTableRow('Average Room Humidity', avgHum ? `${avgHum} %` : 'N/A');
      drawTableRow('Total Recorded Epochs count', String(checkResult.count));

      // Included Metrics list
      y = averagesBoxY + 70;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Selected Telemetry Channels Included', 15, y);

      const metricsList = [];
      if (contents.hr) metricsList.push('Heart Rate Telemetry');
      if (contents.respiration) metricsList.push('Respiration Telemetry');
      if (contents.stress) metricsList.push('Stress Index');
      if (contents.temp) metricsList.push('Ambient Room Temperature');
      if (contents.humidity) metricsList.push('Ambient Room Humidity');
      if (contents.tvoc) metricsList.push('TVOC Gas Levels');
      if (contents.iaq) metricsList.push('Indoor Air Quality (IAQ)');
      if (contents.sleep) metricsList.push('Sleep Stage Classification');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      metricsList.forEach((metric, index) => {
        doc.text(`•  ${metric}`, 20, y + 6 + index * 6);
      });

      addPageFooter();

      // -------------------------------------------------------------
      // PAGES: Stacking selected charts (2 per page)
      // -------------------------------------------------------------
      const rangeMin = new Date(`${startDate}T${startTime}:00`).getTime();
      const rangeMax = new Date(`${endDate}T${endTime}:00`).getTime();
      const xAxisRange = { min: rangeMin, max: rangeMax };

      const chartTasks: { drawFn: (canvas: HTMLCanvasElement) => void; title: string }[] = [];

      // 1. Vitals
      if (contents.hr || contents.respiration) {
        const timelinePoints = checkResult.data.map(d => ({
          x: new Date(d.timestamp).getTime(),
          hr: d.heartRate,
          rr: d.respiration
        }));
        chartTasks.push({
          drawFn: (canvas) => drawVitalsTrend(canvas, timelinePoints, xAxisRange, { hr: contents.hr, respiration: contents.respiration }),
          title: 'Heart Rate & Respiration Rate Trends'
        });
      }

      // 2. Stress Index
      if (contents.stress) {
        const stressPoints = checkResult.data.map(d => ({
          x: new Date(d.timestamp).getTime(),
          stress: d.stressIndex
        }));
        chartTasks.push({
          drawFn: (canvas) => drawStressTrend(canvas, stressPoints, xAxisRange),
          title: 'Stress Index Trend'
        });
      }

      // 3. Environment (Temp & Humidity)
      if (contents.temp || contents.humidity) {
        chartTasks.push({
          drawFn: (canvas) => drawEnvironmentTrend(canvas, checkResult.data || [], xAxisRange, { temp: contents.temp, humidity: contents.humidity }),
          title: 'Room Temperature & Humidity Trends'
        });
      }

      // 4. Air Quality (TVOC & IAQ)
      if (contents.tvoc || contents.iaq) {
        const aqPoints = (checkResult.data || []).map(d => ({
          x: new Date(d.timestamp).getTime(),
          tvoc: d.voc || d.vocTVOC || null,
          iaq: d.iaq || null
        }));
        chartTasks.push({
          drawFn: (canvas) => drawAirQualityTrend(canvas, aqPoints, xAxisRange, { tvoc: contents.tvoc, iaq: contents.iaq }),
          title: 'Indoor Air Quality (IAQ) & TVOC Trends'
        });
      }

      // 5. Sleep Stage Hypnogram
      const isSleepStagePresent = (checkResult.data || []).some(d => d.sleepStage && d.sleepStage !== 'N/A');
      if (contents.sleep && isSleepStagePresent) {
        const sleepTimeline = (checkResult.data || [])
          .filter(d => d.sleepStage)
          .map(d => ({
            ts: new Date(d.timestamp).getTime() / 1000,
            stage: d.sleepStage
          }))
          .sort((a, b) => a.ts - b.ts);
        chartTasks.push({
          drawFn: (canvas) => drawHypnogram(canvas, sleepTimeline, xAxisRange),
          title: 'Sleep Stage Hypnogram'
        });
      }

      let currentPage = 1;
      let currentYOnPage = 38;

      chartTasks.forEach((task, index) => {
        // We put 2 charts per page.
        // If index is even (0, 2, 4...), we start a new PDF page!
        if (index % 2 === 0) {
          doc.addPage();
          currentPage++;
          addPageHeader(currentPage);
          doc.setTextColor(15, 23, 42);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(14);
          doc.text(index === 0 ? 'Historical Analytics Timelines' : 'Historical Analytics Timelines (Cont.)', 15, 30);
          currentYOnPage = 38;
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 1000;
        tempCanvas.height = 400;
        task.drawFn(tempCanvas);

        const imgData = tempCanvas.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 15, currentYOnPage, 180, 75);

        currentYOnPage += 90; // Move down by chart height (75) + padding (15)

        // If it's the last item on the page or the absolute last item in the list, write the footer
        if (index % 2 === 1 || index === chartTasks.length - 1) {
          addPageFooter();
        }
      });

      // -------------------------------------------------------------
      // PAGE 3: Detailed Sleep Metrics (Optional)
      // -------------------------------------------------------------
      if (contents.sleep && isSleepStagePresent) {
        doc.addPage();
        addPageHeader(3);

        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('Sleep Classification Summary', 15, 30);

        const deepEpochs = checkResult.data.filter(d => d.sleepStage === 'DEEP').length;
        const remEpochs = checkResult.data.filter(d => d.sleepStage === 'REM').length;
        const lightEpochs = checkResult.data.filter(d => d.sleepStage === 'LIGHT').length;
        const awakeEpochs = checkResult.data.filter(d => d.sleepStage === 'AWAKE').length;

        const epochMinutes = 0.5;
        const deepMin = deepEpochs * epochMinutes;
        const remMin = remEpochs * epochMinutes;
        const lightMin = lightEpochs * epochMinutes;
        const awakeMin = awakeEpochs * epochMinutes;
        const totalSleepMin = deepMin + remMin + lightMin;
        const totalTIBMin = totalSleepMin + awakeMin;
        const sleepEfficiencyPct = totalTIBMin > 0 ? Math.round((totalSleepMin / totalTIBMin) * 100) : 0;

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.rect(15, 38, 180, 24, 'F');
        doc.rect(15, 38, 180, 24);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(100, 116, 139);
        doc.text('TOTAL TIME IN BED (TIB)', 25, 45);
        doc.setFontSize(18);
        doc.setTextColor(0, 151, 178);
        doc.text(`${Math.round(totalTIBMin)} mins`, 25, 54);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(100, 116, 139);
        doc.text('SLEEP EFFICIENCY', 115, 45);
        doc.setFontSize(18);
        doc.setTextColor(79, 70, 229);
        doc.text(`${sleepEfficiencyPct}%`, 115, 54);

        let sleepTableY = 70;
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);

        const drawSleepTableRow = (metric: string, val: string) => {
          doc.setFont('helvetica', 'bold');
          doc.text(metric, 18, sleepTableY + 5);
          doc.setFont('helvetica', 'normal');
          doc.text(val, 135, sleepTableY + 5);
          doc.setDrawColor(241, 245, 249);
          doc.line(15, sleepTableY + 8, 195, sleepTableY + 8);
          sleepTableY += 10;
        };

        const formatMins = (m: number) => {
          const hrs = Math.floor(m / 60);
          const mins = Math.round(m % 60);
          return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
        };

        drawSleepTableRow('Deep Sleep Duration', formatMins(deepMin));
        drawSleepTableRow('REM Sleep Duration', formatMins(remMin));
        drawSleepTableRow('Light Sleep Duration', formatMins(lightMin));
        drawSleepTableRow('Awake Sleep Duration', formatMins(awakeMin));
        drawSleepTableRow('Total Sleep Time (TST)', formatMins(totalSleepMin));
        drawSleepTableRow('Total Epochs Classified', String(checkResult.data.filter(d => d.sleepStage && d.sleepStage !== 'N/A').length));

        sleepTableY += 10;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Sleep Stage Distribution', 18, sleepTableY);

        sleepTableY += 5;
        const sumMins = deepMin + remMin + lightMin + awakeMin || 1;
        const getPct = (m: number) => Math.round((m / sumMins) * 100);

        const deepPct = getPct(deepMin);
        const remPct = getPct(remMin);
        const lightPct = getPct(lightMin);
        const awakePct = getPct(awakeMin);

        const barWidth = 180;
        const barHeight = 12;
        let currentX = 15;

        const drawSegment = (pct: number, color: [number, number, number]) => {
          if (pct <= 0) return;
          const w = (pct / 100) * barWidth;
          doc.setFillColor(...color);
          doc.rect(currentX, sleepTableY, w, barHeight, 'F');
          currentX += w;
        };

        drawSegment(deepPct, [30, 58, 138]);
        drawSegment(remPct, [6, 182, 212]);
        drawSegment(lightPct, [59, 130, 246]);
        drawSegment(awakePct, [249, 115, 22]);

        sleepTableY += 20;
        const drawLegendItem = (label: string, pct: number, mins: number, color: [number, number, number], x: number) => {
          doc.setFillColor(...color);
          doc.rect(x, sleepTableY, 4, 4, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(15, 23, 42);
          doc.text(label, x + 7, sleepTableY + 3.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(`${pct}% (${Math.round(mins)} min)`, x + 7, sleepTableY + 7.5);
        };

        drawLegendItem('Deep Sleep', deepPct, deepMin, [30, 58, 138], 15);
        drawLegendItem('REM Sleep', remPct, remMin, [6, 182, 212], 60);
        drawLegendItem('Light Sleep', lightPct, lightMin, [59, 130, 246], 105);
        drawLegendItem('Awake Time', awakePct, awakeMin, [249, 115, 22], 150);

        addPageFooter();
      }

      const pdfName = `Dozemate_Report_${deviceName}_${startDate}_to_${endDate}.pdf`;
      doc.save(pdfName);

    } catch (e) {
      console.error(e);
      alert('Error generating PDF report. Please check the console and try again.');
    } finally {
      setExporting(false);
    }
  };

  const CheckboxItem = ({ label, isChecked, onClick }: { label: string, isChecked: boolean, onClick: () => void }) => (
    <div className="flex items-start cursor-pointer group" onClick={onClick}>
      {isChecked ? (
        <CheckSquare className="w-4 h-4 text-[#00c4b5] mt-0.5 mr-3 shrink-0" />
      ) : (
        <Square className="w-4 h-4 text-gray-300 group-hover:border-gray-400 mt-0.5 mr-3 shrink-0" />
      )}
      <div className="text-xs font-bold text-gray-900 mt-0.5">{label}</div>
    </div>
  );

  useEffect(() => {
    if (!checkResult?.data || checkResult.data.length === 0) return;

    const rangeMin = new Date(`${startDate}T${startTime}:00`).getTime();
    const rangeMax = new Date(`${endDate}T${endTime}:00`).getTime();
    const xAxisRange = { min: rangeMin, max: rangeMax };

    // 1. Vitals Preview
    const vitalsPrev = document.getElementById('vitals-preview-canvas') as HTMLCanvasElement;
    if (vitalsPrev) {
      vitalsPrev.width = vitalsPrev.parentElement?.clientWidth || 600;
      vitalsPrev.height = 250;
      const timelinePoints = checkResult.data.map(d => ({
        x: new Date(d.timestamp).getTime(),
        hr: d.heartRate,
        rr: d.respiration
      }));
      drawVitalsTrend(vitalsPrev, timelinePoints, xAxisRange, { hr: contents.hr, respiration: contents.respiration });
    }

    // 2. Stress Index Preview
    const stressPrev = document.getElementById('stress-preview-canvas') as HTMLCanvasElement;
    if (stressPrev) {
      stressPrev.width = stressPrev.parentElement?.clientWidth || 600;
      stressPrev.height = 250;
      const stressPoints = checkResult.data.map(d => ({
        x: new Date(d.timestamp).getTime(),
        stress: d.stressIndex
      }));
      drawStressTrend(stressPrev, stressPoints, xAxisRange);
    }

    // 3. Environment Preview
    const envPrev = document.getElementById('env-preview-canvas') as HTMLCanvasElement;
    if (envPrev) {
      envPrev.width = envPrev.parentElement?.clientWidth || 600;
      envPrev.height = 250;
      drawEnvironmentTrend(envPrev, checkResult.data, xAxisRange, { temp: contents.temp, humidity: contents.humidity });
    }

    // 4. Air Quality Preview
    const airPrev = document.getElementById('air-preview-canvas') as HTMLCanvasElement;
    if (airPrev) {
      airPrev.width = airPrev.parentElement?.clientWidth || 600;
      airPrev.height = 250;
      const aqPoints = checkResult.data.map(d => ({
        x: new Date(d.timestamp).getTime(),
        tvoc: d.voc || d.vocTVOC || null,
        iaq: d.iaq || null
      }));
      drawAirQualityTrend(airPrev, aqPoints, xAxisRange, { tvoc: contents.tvoc, iaq: contents.iaq });
    }

    // 5. Sleep Preview
    const sleepPrev = document.getElementById('sleep-preview-canvas') as HTMLCanvasElement;
    if (sleepPrev) {
      sleepPrev.width = sleepPrev.parentElement?.clientWidth || 600;
      sleepPrev.height = 250;
      const sleepTimeline = checkResult.data
        .filter(d => d.sleepStage)
        .map(d => ({
          ts: new Date(d.timestamp).getTime() / 1000,
          stage: d.sleepStage
        }))
        .sort((a, b) => a.ts - b.ts);
      drawHypnogram(sleepPrev, sleepTimeline, xAxisRange);
    }
  }, [checkResult, contents.sleep, contents.hr, contents.respiration, contents.stress, contents.temp, contents.humidity, contents.tvoc, contents.iaq, startDate, startTime, endDate, endTime]);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full min-h-[calc(100vh-73px)]">
        
        {/* Header Section */}
        <div className="px-8 py-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Export Data Report</h1>
            <p className="text-sm text-gray-500 font-medium">Download raw multi-metric time-series data as PDF Report.</p>
          </div>
        </div>

        {/* Main Grid */}
        <div className="flex-1 px-8 pb-8 flex flex-col lg:flex-row gap-6">
          
          {/* Left Column: Configuration */}
          <div className="w-full lg:w-[45%] space-y-6">
            
            {/* 1. Device & Range Selection */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center mb-4">
                <FileText className="w-4 h-4 text-[#0097b2] mr-2" />
                <h2 className="text-sm font-bold text-gray-900">Data Selection Range</h2>
              </div>
              {/* Selection Mode Selector */}
              <div className="flex gap-4 p-1 bg-gray-100 border border-gray-200 rounded-lg mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setSelectionMode('patient');
                    setSelectedDeviceId('');
                    setSelectedPatientId('');
                  }}
                  className={`flex-1 text-center py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${selectionMode === 'patient' ? 'bg-white text-[#0097b2] shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  Patient-wise
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectionMode('device');
                    setSelectedDeviceId('');
                    setSelectedPatientId('');
                  }}
                  className={`flex-1 text-center py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${selectionMode === 'device' ? 'bg-white text-[#0097b2] shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  Device-wise
                </button>
              </div>

              {devicesLoading ? (
                <div className="flex items-center justify-center py-4 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span className="text-xs">Loading organization details...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Conditional Select */}
                  {selectionMode === 'device' ? (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Select Device</label>
                      <select
                        value={selectedDeviceId}
                        onChange={(e) => setSelectedDeviceId(e.target.value)}
                        className="block w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 font-semibold focus:outline-none focus:border-[#0097b2]"
                      >
                        <option value="">-- Choose a Device --</option>
                        {devices.map(d => (
                          <option key={d.id} value={d.id}>
                            {d.name} ({d.id})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Select Patient</label>
                      <select
                        value={selectedPatientId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedPatientId(val);
                          const patientSession = uniquePatients.find(p => (p.patientId || p.patientCode) === val);
                          if (patientSession && patientSession.deviceId) {
                            setSelectedDeviceId(patientSession.deviceId);
                          } else {
                            setSelectedDeviceId('');
                          }
                        }}
                        className="block w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 font-semibold focus:outline-none focus:border-[#0097b2]"
                      >
                        <option value="">-- Choose a Patient --</option>
                        {uniquePatients.map(p => {
                          const code = p.patientId || p.patientCode;
                          return (
                            <option key={code} value={code}>
                              {p.name || 'Anonymous'} ({code})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  {((selectionMode === 'device' && selectedDeviceId) || (selectionMode === 'patient' && selectedPatientId)) && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Start Date</label>
                          <input 
                            type="date"
                            value={startDate}
                            max={todayStr}
                            onChange={e => setStartDate(e.target.value)}
                            className="block w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-[#0097b2]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Start Time</label>
                          <input 
                            type="time"
                            value={startTime}
                            max={maxStartTime}
                            onChange={e => setStartTime(e.target.value)}
                            className="block w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-[#0097b2]"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">End Date</label>
                          <input 
                            type="date"
                            value={endDate}
                            max={todayStr}
                            onChange={e => setEndDate(e.target.value)}
                            className="block w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-[#0097b2]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">End Time</label>
                          <input 
                            type="time"
                            value={endTime}
                            max={maxEndTime}
                            onChange={e => setEndTime(e.target.value)}
                            className="block w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-[#0097b2]"
                          />
                        </div>
                      </div>

                      <button 
                        onClick={handleCheckData}
                        disabled={isChecking || !startDate || !startTime || !endDate || !endTime || (selectionMode === 'device' && !selectedDeviceId) || (selectionMode === 'patient' && !selectedPatientId)}
                        className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                      >
                        {isChecking ? (
                          <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Checking data...</>
                        ) : (
                          "Check Data Availability"
                        )}
                      </button>

                      {checkResult && (
                        <div className={`mt-3 text-xs font-bold p-3 rounded border ${checkResult.count > 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                          {checkResult.error ? checkResult.error : (checkResult.count > 0 ? `Data available: ${checkResult.count} data points found.` : 'No data found for this time range.')}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 2. Report Contents */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center mb-4">
                <Activity className="w-4 h-4 text-[#0097b2] mr-2" />
                <h2 className="text-sm font-bold text-gray-900">Report Contents</h2>
              </div>

              <div className="border border-gray-100 rounded-lg p-4 space-y-4">
                <CheckboxItem label="Select All" isChecked={isAllChecked} onClick={toggleAll} />
                <hr className="border-gray-100" />
                <div className="grid grid-cols-2 gap-4">
                  <CheckboxItem label="Heart Rate (HR)" isChecked={contents.hr} onClick={() => toggleContent('hr')} />
                  <CheckboxItem label="Respiration" isChecked={contents.respiration} onClick={() => toggleContent('respiration')} />
                  <CheckboxItem label="Stress Index" isChecked={contents.stress} onClick={() => toggleContent('stress')} />
                  <CheckboxItem label="Room Temperature" isChecked={contents.temp} onClick={() => toggleContent('temp')} />
                  <CheckboxItem label="Humidity" isChecked={contents.humidity} onClick={() => toggleContent('humidity')} />
                  <CheckboxItem label="TVOC" isChecked={contents.tvoc} onClick={() => toggleContent('tvoc')} />
                  <CheckboxItem label="IAQ" isChecked={contents.iaq} onClick={() => toggleContent('iaq')} />
                  <CheckboxItem label="Sleep" isChecked={contents.sleep} onClick={() => toggleContent('sleep')} />
                </div>
              </div>
            </div>

            {/* 3. Export */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <button 
                onClick={handleExportPDF}
                disabled={!checkResult || checkResult.count === 0 || exporting}
                className={`w-full text-white py-3.5 rounded-lg text-sm font-bold flex items-center justify-center transition-colors shadow-sm ${
                  (!checkResult || checkResult.count === 0 || exporting)
                    ? 'bg-gray-300 cursor-not-allowed' 
                    : 'bg-[#00c4b5] hover:bg-[#00b0a3] cursor-pointer'
                }`}
              >
                {exporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Generating PDF...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Generate & Download PDF
                  </>
                )}
              </button>
            </div>

          </div>

          {/* Right Column: Live Preview */}
          <div className="w-full lg:w-[55%] bg-gray-100/70 border border-gray-200 rounded-xl flex flex-col overflow-hidden shadow-inner">
            <div className="bg-white/50 border-b border-gray-200 px-4 py-3 flex justify-between items-center backdrop-blur-sm">
              <div className="flex items-center text-gray-500">
                <FileText className="w-4 h-4 mr-2" />
                <span className="text-xs font-bold tracking-widest uppercase">Report Graph Preview</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col items-center">
              {!checkResult ? (
                <div className="bg-white w-full max-w-[500px] shadow-lg rounded-xl border border-gray-200 p-8 min-h-[300px] flex flex-col items-center justify-center text-center text-gray-400 my-auto">
                  <FileText className="w-12 h-12 mb-4 text-gray-300" />
                  <h3 className="font-bold text-sm text-gray-700 mb-1">No Data Checked</h3>
                  <p className="text-xs max-w-xs leading-relaxed">
                    Select a device, time range, and click "Check Data Availability" to preview your PDF report graphs.
                  </p>
                </div>
              ) : checkResult.count === 0 ? (
                <div className="bg-white w-full max-w-[500px] shadow-lg rounded-xl border border-gray-200 p-8 min-h-[300px] flex flex-col items-center justify-center text-center text-red-500 my-auto">
                  <FileText className="w-12 h-12 mb-4 text-red-300" />
                  <h3 className="font-bold text-sm mb-1">No Data Found</h3>
                  <p className="text-xs max-w-xs leading-relaxed text-gray-500">
                    {checkResult.error || "No data available in this time range."}
                  </p>
                </div>
              ) : (
                <div className="w-full space-y-6">
                  {(contents.hr || contents.respiration) && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                      <canvas id="vitals-preview-canvas" className="w-full h-[250px]"></canvas>
                    </div>
                  )}
                  {contents.stress && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                      <canvas id="stress-preview-canvas" className="w-full h-[250px]"></canvas>
                    </div>
                  )}
                  {(contents.temp || contents.humidity) && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                      <canvas id="env-preview-canvas" className="w-full h-[250px]"></canvas>
                    </div>
                  )}
                  {(contents.tvoc || contents.iaq) && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                      <canvas id="air-preview-canvas" className="w-full h-[250px]"></canvas>
                    </div>
                  )}
                  {contents.sleep && isSleepStagePresent && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                      <canvas id="sleep-preview-canvas" className="w-full h-[250px]"></canvas>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}
