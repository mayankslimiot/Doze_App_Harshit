import { ArrowLeft, Calendar, Bed, HardDrive, UserCircle, Loader2, X, Pencil, FileText } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getUserProfile, getHealthDataRange } from '@/services/deviceService';
import { useState, useEffect, useRef, useCallback } from 'react';
import { apiUrl } from '@/services/api';
import {
  connectWebSocket,
  subscribeToDevice,
  addHealthDataHandler,
  removeHealthDataHandler,
  disconnectWebSocket,
} from '@/services/websocketService';
import type { HealthDataUpdate } from '@/services/websocketService';
import { getManualEntries } from '@/services/manualEntryService';
import DashboardLayout from '@/components/layout/DashboardLayout';
import VitalsSummary from '@/components/dashboard/VitalsSummary';
import NightMetrics from '@/components/dashboard/NightMetrics';
import IncidentTimeline from '@/components/dashboard/IncidentTimeline';
import IncidentCards from '@/components/dashboard/IncidentCards';
import ClinicalNotes from '@/components/dashboard/ClinicalNotes';
import ReviewActions from '@/components/dashboard/ReviewActions';
import { jsPDF } from 'jspdf';

const getSessionDateString = (dateObj: Date) => {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

function drawVitalsTrend(canvas: HTMLCanvasElement, stageTimeline: any[], rawHistory: any[], xAxisRange?: { min: number; max: number }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  let points: { x: number; hr: number | null; rr: number | null }[] = [];
  if (stageTimeline && stageTimeline.length > 0) {
    points = stageTimeline.map(pt => ({
      x: pt.ts * 1000,
      hr: pt.hr || null,
      rr: pt.rr || null
    }));
  } else if (rawHistory && rawHistory.length > 0) {
    points = rawHistory.map(pt => ({
      x: pt.timestamp ? new Date(pt.timestamp).getTime() : 0,
      hr: pt.heartRate || null,
      rr: pt.respiration || null
    }));
  }
  
  points.sort((a, b) => a.x - b.x);

  const margin = { top: 40, right: 60, bottom: 50, left: 60 };
  const graphWidth = canvas.width - margin.left - margin.right;
  const graphHeight = canvas.height - margin.top - margin.bottom;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Heart Rate & Respiration Rate Trends', margin.left, 25);

  const hasData = points.some(pt => (pt.hr && pt.hr > 0) || (pt.rr && pt.rr > 0));

  if (points.length === 0 || !hasData) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px sans-serif';
    ctx.fillText('No vitals telemetry data recorded for this cycle.', canvas.width / 2 - 150, canvas.height / 2);
    return;
  }

  const validTimes = points.filter(pt => (pt.hr && pt.hr > 0) || (pt.rr && pt.rr > 0)).map(pt => pt.x);
  const tMin = xAxisRange ? xAxisRange.min : Math.min(...validTimes);
  const tMax = xAxisRange ? xAxisRange.max : Math.max(...validTimes);
  
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

  // Determine gap threshold dynamically based on median/average rate (max 30m filter to avoid massive offline times biasing calculations)
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

  // Draw Respiration Rate line in segments
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

  ctx.fillStyle = '#ef4444';
  ctx.fillRect(margin.left, margin.top + graphHeight + 32, 18, 10);
  ctx.fillStyle = '#0f172a';
  ctx.font = '12px sans-serif';
  ctx.fillText('Heart Rate', margin.left + 26, margin.top + graphHeight + 41);

  ctx.fillStyle = '#0097b2';
  ctx.fillRect(margin.left + 140, margin.top + graphHeight + 32, 18, 10);
  ctx.fillStyle = '#0f172a';
  ctx.fillText('Respiration Rate', margin.left + 166, margin.top + graphHeight + 41);
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

  if (!stageTimeline || stageTimeline.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px sans-serif';
    ctx.fillText('No hypnogram data recorded for this cycle.', canvas.width / 2 - 150, canvas.height / 2);
    return;
  }

  const stages = ['AWAKE', 'REM', 'LIGHT', 'DEEP'];
  const getStageY = (stage: string) => {
    const idx = stages.indexOf(stage);
    const segment = graphHeight / (stages.length - 1);
    return margin.top + (idx >= 0 ? idx : 0) * segment;
  };

  const tMin = xAxisRange ? xAxisRange.min : Math.min(...stageTimeline.map(p => p.ts * 1000));
  const tMax = xAxisRange ? xAxisRange.max : Math.max(...stageTimeline.map(p => p.ts * 1000));
  
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

  stageTimeline.forEach((pt, idx) => {
    const x = getX(pt.ts);
    const y = getStageY(pt.stage);

    if (idx === 0) {
      ctx.moveTo(x, y);
    } else {
      const prevPt = stageTimeline[idx - 1];
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

export default function SessionDetails() {
  const { id } = useParams<{ id: string }>();
  const [monitoringSession, setMonitoringSession] = useState<any>(null);
  const [sleepSession, setSleepSession] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [sleepLoading, setSleepLoading] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);

  const { data: profile } = useQuery<any>({
    queryKey: ['user_profile'],
    queryFn: getUserProfile,
    staleTime: 60000 * 5,
  });

  const isOtherOrg = profile?.account?.organizationId?.organizationType === 'other';

  // Edit patient modal states
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editPatientId, setEditPatientId] = useState<string>('');
  const [editAge, setEditAge] = useState<string>('');
  const [editSex, setEditSex] = useState<string>('');
  const [editRoom, setEditRoom] = useState<string>('');
  const [editBed, setEditBed] = useState<string>('');
  const [editAdmissionDate, setEditAdmissionDate] = useState<string>('');
  const [editDischargeDate, setEditDischargeDate] = useState<string>('');
  const [editPatientPhone, setEditPatientPhone] = useState<string>('');
  const [editPatientEmail, setEditPatientEmail] = useState<string>('');
  const [editCaretakerPhone, setEditCaretakerPhone] = useState<string>('');
  const [editCaretakerEmail, setEditCaretakerEmail] = useState<string>('');
  const [editConsentVerified, setEditConsentVerified] = useState<boolean>(false);
  const [editNotes, setEditNotes] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);

  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        setIsSuperAdmin(user.role === 'superadmin');
      }
    } catch (e) {
      console.error('Error parsing user storage:', e);
    }
  }, []);

  const handleOpenEditModal = () => {
    if (!monitoringSession) return;
    setEditName(monitoringSession.name || '');
    setEditPatientId(monitoringSession.patientId || monitoringSession.patientCode || '');
    setEditAge(monitoringSession.age ? String(monitoringSession.age) : '');
    setEditSex(monitoringSession.sex || 'male');
    setEditRoom(monitoringSession.room || '');
    setEditBed(monitoringSession.bed || monitoringSession.bedId || '');
    setEditAdmissionDate(monitoringSession.admissionDate ? monitoringSession.admissionDate.split('T')[0] : monitoringSession.startTime ? monitoringSession.startTime.split('T')[0] : '');
    setEditDischargeDate(monitoringSession.dischargeDate ? monitoringSession.dischargeDate.split('T')[0] : '');
    setEditPatientPhone(monitoringSession.patientPhone || '');
    setEditPatientEmail(monitoringSession.patientEmail || '');
    setEditCaretakerPhone(monitoringSession.caretakerPhone || '');
    setEditCaretakerEmail(monitoringSession.caretakerEmail || '');
    setEditConsentVerified(!!monitoringSession.consentVerified);
    setEditNotes(monitoringSession.technicianNotes || '');
    setEditError(null);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    setEditSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const payload = {
        name: editName.trim(),
        patientCode: editPatientId.trim(),
        patientId: editPatientId.trim(),
        age: editAge ? parseInt(editAge, 10) : undefined,
        sex: editSex,
        room: editRoom.trim(),
        bed: editBed.trim(),
        admissionDate: editAdmissionDate || undefined,
        dischargeDate: editDischargeDate || null,
        patientPhone: editPatientPhone.trim() || null,
        patientEmail: editPatientEmail.trim() || null,
        caretakerPhone: editCaretakerPhone.trim() || null,
        caretakerEmail: editCaretakerEmail.trim() || null,
        consentVerified: editConsentVerified,
        technicianNotes: editNotes.trim()
      };

      const res = await fetch(apiUrl(`/api/sessions/${monitoringSession._id || id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setShowEditModal(false);
        fetchSessionData();
      } else {
        setEditError(data.message || 'Failed to update patient details');
      }
    } catch (err) {
      console.error('Error updating patient details:', err);
      setEditError('Server error while saving details');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Manual Entries Modal State
  const [showManualEntriesModal, setShowManualEntriesModal] = useState(false);
  const [manualEntries, setManualEntries] = useState<any[]>([]);
  const [entriesFilterDate, setEntriesFilterDate] = useState('');

  const fetchManualEntriesData = async () => {
    if (!monitoringSession?.deviceId) return;
    try {
      const res = await getManualEntries(monitoringSession.deviceId);
      setManualEntries(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenManualEntries = () => {
    fetchManualEntriesData();
    setShowManualEntriesModal(true);
  };

  useEffect(() => {
    if (showManualEntriesModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showManualEntriesModal]);

  const fetchSessionData = async () => {
    try {
      const token = localStorage.getItem('token');
      // Fetch monitoring session details
      const sessionRes = await fetch(apiUrl(`/api/sessions/${id}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const sessionJson = await sessionRes.json();
      
      if (!sessionRes.ok || !sessionJson.success || !sessionJson.data) {
        setError(sessionJson.message || 'Session not found');
        setLoading(false);
        return;
      }

      const mSession = sessionJson.data;
      setMonitoringSession(mSession);

      let targetDate = new Date();
      if (mSession.status === 'completed' && mSession.dischargeDate) {
        targetDate = new Date(mSession.dischargeDate);
      } else {
        targetDate = new Date();
        targetDate.setHours(0, 0, 0, 0);
        if (new Date().getHours() >= 12) {
          targetDate.setDate(targetDate.getDate() + 1);
        }
      }

      const primaryDate = getSessionDateString(targetDate);

      if (!selectedDate) {
        setSelectedDate(primaryDate);
      }
      
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch session details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchSleepData = async () => {
      if (!monitoringSession?.deviceId || !selectedDate) return;
      setSleepLoading(true);
      try {
        const token = localStorage.getItem('token');
        const sleepRes = await fetch(apiUrl(`/api/sleep/session/${monitoringSession.deviceId}?date=${selectedDate}`), {
          headers: { Authorization: `Bearer ${token}` }
        });
        const sleepJson = await sleepRes.json();
        
        if (sleepJson.success && sleepJson.data) {
          setSleepSession(sleepJson.data);
        } else {
          setSleepSession(null); // No data for this date
        }
      } catch (err) {
        console.error(err);
        setSleepSession(null);
      } finally {
        setSleepLoading(false);
      }
    };

    fetchSleepData();
  }, [selectedDate, monitoringSession?.deviceId]);

  useEffect(() => {
    if (id) {
      fetchSessionData();
    }
  }, [id]);

  const handlerRef = useRef<((data: HealthDataUpdate) => void) | null>(null);

  const handleHealthData = useCallback(
    (data: HealthDataUpdate) => {
      setMonitoringSession((prev: any) => {
        if (!prev || prev.deviceId !== data.deviceId) return prev;
        let changed = false;
        const next = { ...prev };
        if (data.heartRate != null && data.heartRate > 0) {
          next.currentHeartRate = Math.round(data.heartRate);
          changed = true;
        }
        if (data.respiration != null && data.respiration > 0) {
          next.currentRespiration = Math.round(data.respiration);
          changed = true;
        }
        if (data.temperature != null && data.temperature > 0) {
          next.currentTemperature = data.temperature;
          changed = true;
        }
        return changed ? next : prev;
      });
    },
    []
  );

  useEffect(() => {
    if (!monitoringSession?.deviceId) return;
    connectWebSocket();
    subscribeToDevice(monitoringSession.deviceId);

    handlerRef.current = handleHealthData;
    addHealthDataHandler(handleHealthData);

    return () => {
      if (handlerRef.current) removeHealthDataHandler(handlerRef.current);
      disconnectWebSocket();
    };
  }, [monitoringSession?.deviceId, handleHealthData]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatCycleDate = (dateStr: string) => {
    if (!dateStr) return '';
    const end = new Date(dateStr);
    const start = new Date(dateStr);
    start.setDate(start.getDate() - 1);

    const startDay = start.getDate();
    const endDay = end.getDate();
    const month = end.toLocaleDateString('en-US', { month: 'short' });
    const year = end.getFullYear();

    return `${startDay}-${endDay} ${month} ${year}`;
  };


  const getDisplayStatus = (session: any) => {
    if (!session) return 'N/A';
    let status = session.status === 'active' ? 'Monitoring' : session.status;
    if (session.status === 'active' && session.expectedEndTime && new Date() > new Date(session.expectedEndTime)) {
      status = 'Completed';
    }
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const handleExportPDF = async () => {
    if (!monitoringSession) return;
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
        doc.text('DOZEMATE PILOT CLINICAL RECORD', 15, 12);
        
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

      // -------------------------------------------------------------
      // PAGE 1: Detailed Patient Summary
      // -------------------------------------------------------------
      addPageHeader(1);
      
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(isOtherOrg ? 'User Session Summary' : 'Patient Session Summary', 15, 32);
      
      doc.setDrawColor(0, 151, 178); // teal
      doc.setLineWidth(1);
      doc.line(15, 35, 80, 35);
      
      // General Metadata Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(13, 42, pageWidth - 26, 56, 'F');
      doc.rect(13, 42, pageWidth - 26, 56);
      
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
      
      // Row 1
      drawMetaField(isOtherOrg ? 'User Code' : 'Patient Code', monitoringSession.patientId || monitoringSession.patientCode, 20);
      drawMetaField('Name', monitoringSession.name, 80);
      drawMetaField('Device ID', monitoringSession.deviceId, 145);
      
      // Row 2
      y += 16;
      drawMetaField('Age', monitoringSession.age ? String(monitoringSession.age) : '—', 20);
      drawMetaField('Gender', monitoringSession.sex ? monitoringSession.sex.charAt(0).toUpperCase() + monitoringSession.sex.slice(1) : '—', 80);
      drawMetaField('Room & Bed', `Room ${monitoringSession.room || '—'} · Bed ${monitoringSession.bed || '—'}`, 145);
      
      // Row 3
      y += 16;
      drawMetaField('Admission Date', formatDate(monitoringSession.admissionDate || monitoringSession.startTime), 20);
      drawMetaField('Session Cycle', formatCycleDate(selectedDate), 80);
      drawMetaField('Review Status', monitoringSession.isReviewed ? 'REVIEWED' : 'PENDING REVIEW', 145);
      
      // Clinical Notes
      y = 110;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('Technician / Clinical Notes', 15, y);
      
      const noteText = monitoringSession.technicianNotes || 'No clinical notes recorded for this session.';
      const splitNotes = doc.splitTextToSize(noteText, pageWidth - 36);
      const notesBoxHeight = splitNotes.length * 5 + 10;
      
      doc.setDrawColor(241, 245, 249);
      doc.setFillColor(255, 255, 255);
      doc.rect(15, y + 3, pageWidth - 30, notesBoxHeight, 'F');
      doc.rect(15, y + 3, pageWidth - 30, notesBoxHeight);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(51, 65, 85);
      doc.text(splitNotes, 20, y + 9);
      
      // Review Checklist
      y += notesBoxHeight + 15;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('Review Actions Checklist', 15, y);
      
      const eventsList: string[] = [];
      if (monitoringSession.technicianNotes?.trim()) {
        eventsList.push("Review technician notes");
      } else {
        eventsList.push("Verify session setup notes");
      }
      if (sleepSession) {
        if ((sleepSession.sleepEfficiency || 0) < 75) {
          eventsList.push(`Review Low Sleep Efficiency (${Math.round(sleepSession.sleepEfficiency || 0)}%)`);
        }
        if ((sleepSession.sleepScore || 0) < 70) {
          eventsList.push(`Review Low Sleep Score (${Math.round(sleepSession.sleepScore || 0)})`);
        }
        if ((sleepSession.awakenings || 0) > 5) {
          eventsList.push(`Review high awakenings (${sleepSession.awakenings} events)`);
        }
        if ((sleepSession.dataQuality || 0) < 90) {
          eventsList.push(`Signal loss check: Data Quality (${Math.round(sleepSession.dataQuality || 0)}%)`);
        }
      } else {
        eventsList.push("Physician sign-off requirement");
        eventsList.push("Review signal quality & device logs");
      }
      
      const reviewedEvents = monitoringSession.reviewedEvents || [];
      
      eventsList.forEach((ev, index) => {
        const isReviewed = reviewedEvents.includes(ev);
        const checkStr = isReviewed ? ' [X] ' : ' [  ] ';
        
        doc.setFont('helvetica', isReviewed ? 'bold' : 'normal');
        if (isReviewed) {
          doc.setTextColor(16, 185, 129); // green
        } else {
          doc.setTextColor(239, 68, 68); // red
        }
        doc.text(`${checkStr}  ${ev}`, 18, y + 7 + index * 6.5);
      });
      
      addPageFooter();
      
      // -------------------------------------------------------------
      // PAGE 2: Two Graphs (Vitals Trend & Sleep Stage Hypnogram)
      // -------------------------------------------------------------
      doc.addPage();
      addPageHeader(2);
      
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('Session Timelines & Analytics', 15, 30);
      
      const vitalsCanvas = document.createElement('canvas');
      vitalsCanvas.width = 1000;
      vitalsCanvas.height = 400;
      
      const [year, month, day] = selectedDate.split('-').map(Number);
      const startObj = new Date(year, month - 1, day - 1, 12, 0, 0, 0);
      let endObj = new Date(year, month - 1, day, 12, 0, 0, 0);
      
      const nowTarget = new Date();
      nowTarget.setHours(0, 0, 0, 0);
      if (new Date().getHours() >= 12) {
        nowTarget.setDate(nowTarget.getDate() + 1);
      }
      const currCycleStr = getSessionDateString(nowTarget);
      if (selectedDate === currCycleStr) {
        endObj = new Date();
      }

      const cycleRange = { min: startObj.getTime(), max: endObj.getTime() };

      let rawHistory: any[] = [];
      if (!sleepSession?.stageTimeline || sleepSession.stageTimeline.length === 0) {
        try {
          const startISO = startObj.toISOString();
          const endISO = endObj.toISOString();
          rawHistory = await getHealthDataRange(monitoringSession.deviceId, startISO, endISO);
        } catch (e) {
          console.error('Error fetching backup data for graph:', e);
        }
      }
      
      drawVitalsTrend(vitalsCanvas, sleepSession?.stageTimeline, rawHistory, cycleRange);
      const vitalsImgData = vitalsCanvas.toDataURL('image/png');
      doc.addImage(vitalsImgData, 'PNG', 15, 38, 180, 75);
      
      const hypCanvas = document.createElement('canvas');
      hypCanvas.width = 1000;
      hypCanvas.height = 400;
      
      const sortedTimeline = [...(sleepSession?.stageTimeline || [])].sort((a: any, b: any) => a.ts - b.ts);
      drawHypnogram(hypCanvas, sortedTimeline, cycleRange);
      const hypImgData = hypCanvas.toDataURL('image/png');
      doc.addImage(hypImgData, 'PNG', 15, 128, 180, 75);
      
      addPageFooter();
      
      // -------------------------------------------------------------
      // PAGE 3: Detailed Sleep Metrics (Optional)
      // -------------------------------------------------------------
      if (sleepSession) {
        doc.addPage();
        addPageHeader(3);
        
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('Detailed Sleep Analysis', 15, 30);
        
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.rect(15, 38, 180, 26, 'F');
        doc.rect(15, 38, 180, 26);
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text('SLEEP QUALITY SCORE', 25, 46);
        doc.setFontSize(22);
        doc.setTextColor(0, 151, 178); // teal
        doc.text(sleepSession.sleepScore ? `${Math.round(sleepSession.sleepScore)}` : 'N/A', 25, 58);
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text('SLEEP EFFICIENCY', 105, 46);
        doc.setFontSize(22);
        doc.setTextColor(79, 70, 229); // indigo
        doc.text(sleepSession.sleepEfficiency ? `${Math.round(sleepSession.sleepEfficiency)}%` : 'N/A', 105, 58);
        
        let tableY = 72;
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        
        const drawTableRow = (metric: string, val: string) => {
          doc.setFont('helvetica', 'bold');
          doc.text(metric, 18, tableY + 5);
          doc.setFont('helvetica', 'normal');
          doc.text(val, 135, tableY + 5);
          doc.setDrawColor(241, 245, 249);
          doc.line(15, tableY + 8, 195, tableY + 8);
          tableY += 10;
        };
        
        const formatMins = (m: number) => {
          if (m == null) return 'N/A';
          const hrs = Math.floor(m / 60);
          const mins = Math.round(m % 60);
          return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
        };
        
        drawTableRow('Time In Bed (TIB)', formatMins(sleepSession.timeInBed));
        drawTableRow('Total Sleep Time (TST)', formatMins(sleepSession.totalSleepTime));
        drawTableRow('Sleep Latency (Onset Delay)', `${sleepSession.sleepLatency ?? 0} minutes`);
        drawTableRow('Wake After Sleep Onset (WASO)', `${sleepSession.awakeMinutes ?? 0} minutes`);
        drawTableRow('Awakenings Count', `${sleepSession.awakenings ?? 0} times`);
        drawTableRow('Out of Bed Duration', `${sleepSession.outOfBedTime ?? 0} minutes`);
        drawTableRow('Resting Heart Rate', sleepSession.restingHeartRate ? `${sleepSession.restingHeartRate} bpm` : 'N/A');
        drawTableRow('Data Quality (Signal Integrity)', `${Math.round(sleepSession.dataQuality ?? 0)}%`);
        
        tableY += 12;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Sleep Stage Distribution', 18, tableY);
        
        tableY += 5;
        const totalMins = (sleepSession.deepSleepMinutes || 0) + (sleepSession.remMinutes || 0) + (sleepSession.lightSleepMinutes || 0) + (sleepSession.awakeMinutes || 0) || 1;
        const getPct = (m: number) => Math.round(((m || 0) / totalMins) * 100);
        
        const deepPct = getPct(sleepSession.deepSleepMinutes);
        const remPct = getPct(sleepSession.remMinutes);
        const lightPct = getPct(sleepSession.lightSleepMinutes);
        const awakePct = getPct(sleepSession.awakeMinutes);
        
        const barWidth = 180;
        const barHeight = 12;
        let currentX = 15;
        
        const drawSegment = (pct: number, color: [number, number, number]) => {
          if (pct <= 0) return;
          const w = (pct / 100) * barWidth;
          doc.setFillColor(...color);
          doc.rect(currentX, tableY, w, barHeight, 'F');
          currentX += w;
        };
        
        drawSegment(deepPct, [30, 58, 138]);
        drawSegment(remPct, [6, 182, 212]);
        drawSegment(lightPct, [59, 130, 246]);
        drawSegment(awakePct, [249, 115, 22]);
        
        tableY += 20;
        
        const drawLegendItem = (label: string, pct: number, mins: number, color: [number, number, number], x: number) => {
          doc.setFillColor(...color);
          doc.rect(x, tableY, 4, 4, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(15, 23, 42);
          doc.text(label, x + 7, tableY + 3.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(`${pct}% (${Math.round(mins)} min)`, x + 7, tableY + 7.5);
        };
        
        drawLegendItem('Deep Sleep', deepPct, sleepSession.deepSleepMinutes || 0, [30, 58, 138], 15);
        drawLegendItem('REM Sleep', remPct, sleepSession.remMinutes || 0, [6, 182, 212], 60);
        drawLegendItem('Light Sleep', lightPct, sleepSession.lightSleepMinutes || 0, [59, 130, 246], 105);
        drawLegendItem('Awake Time', awakePct, sleepSession.awakeMinutes || 0, [249, 115, 22], 150);
        
        addPageFooter();
      }
      
      const pdfName = `Dozemate_Session_${monitoringSession.patientId || monitoringSession.patientCode}_${selectedDate}.pdf`;
      doc.save(pdfName);
    } catch (error) {
      console.error('Failed to generate report PDF:', error);
      alert('Error generating PDF report. Please try again.');
    } finally {
      setExporting(false);
    }
  };


  let maxDateStr = '';
  let minDateStr = '';

  if (monitoringSession) {
    let targetDate = new Date();
    if (monitoringSession.status === 'completed' && monitoringSession.dischargeDate) {
      targetDate = new Date(monitoringSession.dischargeDate);
    } else {
      targetDate.setHours(0, 0, 0, 0);
      if (new Date().getHours() >= 12) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
    }
    maxDateStr = getSessionDateString(targetDate);
    
    if (monitoringSession.admissionDate || monitoringSession.startTime) {
      minDateStr = getSessionDateString(new Date(monitoringSession.admissionDate || monitoringSession.startTime));
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[calc(100vh-73px)]">
          <Loader2 className="w-8 h-8 animate-spin text-[#0097b2]" />
          <span className="ml-3 text-sm font-semibold text-gray-500">Loading session summary...</span>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !monitoringSession) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-73px)] text-center p-8">
          <div className="text-red-500 font-bold mb-4">Error loading session details</div>
          <div className="text-gray-500 text-sm mb-6">{error || 'Session details not found'}</div>
          <Link to="/dashboard" className="px-4 py-2 bg-[#00c4b5] text-white rounded-md text-sm font-medium hover:bg-[#00b0a3] transition-colors shadow-sm">
            Back to Dashboard
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-8 max-w-7xl mx-auto flex flex-col h-full min-h-[calc(100vh-73px)]">
        
        {/* Page Header Section */}
        <div className="flex justify-between items-end mb-6">
          <div>
            <div className="flex items-center text-sm text-gray-500 mb-2">
              <Link to="/dashboard" className="hover:text-gray-900 transition-colors">
                <ArrowLeft className="w-4 h-4 mr-1 inline" />
              </Link>
              <span>{isOtherOrg ? 'User' : 'Patient'} / {formatDate(monitoringSession.admissionDate || monitoringSession.startTime)}</span>
            </div>
            <div className="flex items-center">
              <h1 className="text-3xl font-bold text-gray-900 mr-4">{isOtherOrg ? 'User Summary' : 'Patient Summary'}</h1>
              {isSuperAdmin && (
                <button
                  onClick={handleOpenEditModal}
                  className="mr-3 p-1.5 text-gray-500 hover:text-[#0097b2] hover:bg-teal-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-teal-200"
                  title={isOtherOrg ? "Edit User Details" : "Edit Patient Details"}
                >
                  <Pencil className="w-5 h-5" />
                </button>
              )}
              <span className="bg-teal-50 text-teal-700 border border-teal-200 px-3 py-1 rounded-full text-xs font-semibold tracking-wider">
                {monitoringSession.patientId || monitoringSession.patientCode}
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="bg-[#0097b2] hover:bg-[#00829a] text-white font-bold text-sm px-4 py-2 rounded-lg transition-colors flex items-center shadow-sm cursor-pointer disabled:opacity-50"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Export PDF
                </>
              )}
            </button>
            <div className="h-8 w-px bg-gray-200"></div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Monitoring Cycle</span>
              <span className="text-sm font-bold text-[#0097b2]">{formatCycleDate(selectedDate)}</span>
            </div>
            <div className="h-8 w-px bg-gray-200"></div>
            <input 
              type="date" 
              value={selectedDate}
              min={minDateStr}
              max={maxDateStr}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border-none bg-transparent hover:bg-gray-50 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none cursor-pointer transition-colors"
            />
          </div>
        </div>

        {/* Meta Bar */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex flex-wrap items-center justify-between text-sm text-gray-600 mb-8">
          <div className="flex flex-wrap items-center gap-6 px-2">
            <div className="flex items-center"><Calendar className="w-4 h-4 mr-2 text-gray-400"/> {formatDate(monitoringSession.admissionDate || monitoringSession.startTime)}</div>
            <div className="flex items-center"><Bed className="w-4 h-4 mr-2 text-gray-400"/> Room {monitoringSession.room || '—'} · Bed {monitoringSession.bed || monitoringSession.bedId || 'N/A'}</div>
            <div className="flex items-center"><HardDrive className="w-4 h-4 mr-2 text-gray-400"/> {monitoringSession.deviceId}</div>
            <div className="flex items-center"><UserCircle className="w-4 h-4 mr-2 text-gray-400"/> Status: {getDisplayStatus(monitoringSession)}</div>
            <div className="flex items-center">
              <button onClick={handleOpenManualEntries} className="flex items-center text-[#0097b2] hover:text-[#00829a] font-bold text-xs bg-teal-50 px-3 py-1 rounded-full border border-teal-200 transition-colors">
                View Manual Entries
              </button>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {monitoringSession.flagged && (
              <div className="bg-red-100 text-red-700 px-3 py-1 rounded border border-red-200 text-xs font-bold tracking-wider flex items-center">
                 FLAGGED
              </div>
            )}
            <div className={`px-3 py-1 rounded border text-xs font-bold tracking-wider flex items-center ${
              monitoringSession.isReviewed 
                ? 'bg-green-100 text-green-700 border-green-200' 
                : 'bg-orange-100 text-orange-700 border-orange-200'
            }`}>
               {monitoringSession.isReviewed ? 'REVIEWED' : 'PENDING REVIEW'}
            </div>
          </div>
        </div>

        {/* Main Split Layout */}
        <div className="flex-1 flex flex-col lg:flex-row gap-8 mb-8">
          
          {/* Left Column (Main Content) */}
          <div className="flex-1 min-w-0 space-y-8 relative">
            {sleepLoading && (
              <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-[1px] flex items-center justify-center rounded-xl border border-gray-100 transition-opacity duration-300">
                <Loader2 className="w-8 h-8 animate-spin text-[#0097b2]" />
              </div>
            )}
            <VitalsSummary monitoringSession={monitoringSession} sleepSession={sleepSession} selectedDate={selectedDate} />
            <NightMetrics sleepSession={sleepSession} />
            <IncidentTimeline sleepSession={sleepSession} />
            <IncidentCards sleepSession={sleepSession} />
            <ClinicalNotes monitoringSession={monitoringSession} onNoteUpdated={fetchSessionData} />
          </div>
          
          {/* Right Column (Sidebar) */}
          <div className="w-full lg:w-[320px] flex-shrink-0">
            <ReviewActions 
              monitoringSession={monitoringSession} 
              sleepSession={sleepSession} 
              onReviewUpdated={fetchSessionData} 
            />

            {/* Contact Information Sidebar Card */}
            {(monitoringSession.patientPhone || monitoringSession.patientEmail || monitoringSession.caretakerPhone || monitoringSession.caretakerEmail) && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mt-6">
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center">
                  <span className="w-2 h-2 rounded-full bg-[#0097b2] mr-2"></span>
                  Contact Details
                </h3>
                <div className="space-y-3.5 text-xs text-gray-600">
                  {(monitoringSession.patientPhone || monitoringSession.patientEmail) && (
                    <div>
                      <div className="font-bold text-gray-500 mb-1">{isOtherOrg ? 'User Contact' : 'Patient Contact'}</div>
                      {monitoringSession.patientPhone && <div className="font-medium text-gray-800 mb-0.5">📞 {monitoringSession.patientPhone}</div>}
                      {monitoringSession.patientEmail && <div className="font-medium text-gray-800">✉️ {monitoringSession.patientEmail}</div>}
                    </div>
                  )}
                  {(monitoringSession.caretakerPhone || monitoringSession.caretakerEmail) && (
                    <div className="pt-2.5 border-t border-gray-100">
                      <div className="font-bold text-gray-500 mb-1">Caretaker Contact</div>
                      {monitoringSession.caretakerPhone && <div className="font-medium text-gray-800 mb-0.5">📞 {monitoringSession.caretakerPhone}</div>}
                      {monitoringSession.caretakerEmail && <div className="font-medium text-gray-800">✉️ {monitoringSession.caretakerEmail}</div>}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

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

      {/* Manual Entries Modal */}
      {showManualEntriesModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowManualEntriesModal(false)}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-4xl overflow-hidden flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-gray-100 shrink-0">
              <h2 className="text-xl font-bold text-gray-900">Manual Entries</h2>
              <button onClick={() => setShowManualEntriesModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="p-6 shrink-0 bg-gray-50/50 border-b border-gray-100 flex items-center space-x-4">
              <label className="text-sm font-semibold text-gray-700">Filter by Date:</label>
              <input 
                type="date" 
                value={entriesFilterDate} 
                onChange={(e) => setEntriesFilterDate(e.target.value)} 
                className="bg-white border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] outline-none"
              />
              {entriesFilterDate && (
                <button 
                  onClick={() => setEntriesFilterDate('')}
                  className="text-xs text-gray-500 hover:text-red-500 underline underline-offset-2"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1 p-6">
              <table className="w-full text-left text-sm table-fixed">
                <thead className="bg-gray-50 text-gray-500 rounded-t-lg">
                  <tr>
                    <th className="px-4 py-3 font-semibold rounded-tl-lg">Date & Time</th>
                    <th className="px-4 py-3 font-semibold leading-tight">
                      Heart Rate (bpm) <br />
                      <span className="text-[10px] font-normal text-gray-400">Manual / Device</span>
                    </th>
                    <th className="px-4 py-3 font-semibold rounded-tr-lg leading-tight">
                      Respiration (rpm) <br />
                      <span className="text-[10px] font-normal text-gray-400">Manual / Device</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {manualEntries.filter((entry: any) => {
                    if (!entriesFilterDate) return true;
                    return new Date(entry.date).toISOString().split('T')[0] === entriesFilterDate;
                  }).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                        No manual entries found.
                      </td>
                    </tr>
                  ) : (
                    manualEntries
                      .filter((entry: any) => {
                        if (!entriesFilterDate) return true;
                        return new Date(entry.date).toISOString().split('T')[0] === entriesFilterDate;
                      })
                      .map((entry: any, idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3 text-gray-900">
                            {new Date(entry.date).toLocaleDateString()} {entry.time}
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold">
                            <span className="text-[#0097b2]">{entry.heartRate}</span>
                            <span className="text-gray-300 font-normal mx-1.5">/</span>
                            <span className="text-gray-600">{entry.deviceAvgHr != null ? entry.deviceAvgHr : '--'}</span>
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold">
                            <span className="text-[#0097b2]">{entry.respiration}</span>
                            <span className="text-gray-300 font-normal mx-1.5">/</span>
                            <span className="text-gray-600">{entry.deviceAvgResp != null ? entry.deviceAvgResp : '--'}</span>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}

      {/* Edit Patient Details Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-gray-100 shrink-0">
              <h2 className="text-xl font-bold text-gray-900 font-sans">{isOtherOrg ? 'Edit User Details' : 'Edit Patient Details'}</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="overflow-y-auto flex-1 p-6 space-y-6">
              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm font-semibold">
                  {editError}
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Full Name</label>
                  <input 
                    type="text" 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{isOtherOrg ? 'User ID / Code' : 'Patient ID / Code'}</label>
                  <input 
                    type="text" 
                    value={editPatientId}
                    onChange={(e) => setEditPatientId(e.target.value)}
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Age</label>
                  <input 
                    type="number" 
                    value={editAge}
                    onChange={(e) => setEditAge(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Gender</label>
                  <select 
                    value={editSex}
                    onChange={(e) => setEditSex(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] outline-none transition-all appearance-none"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Room Number</label>
                  <input 
                    type="text" 
                    value={editRoom}
                    onChange={(e) => setEditRoom(e.target.value)}
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Bed Number</label>
                  <input 
                    type="text" 
                    value={editBed}
                    onChange={(e) => setEditBed(e.target.value)}
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Admission Date</label>
                  <input 
                    type="date" 
                    value={editAdmissionDate}
                    onChange={(e) => setEditAdmissionDate(e.target.value)}
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Discharge Date</label>
                  <input 
                    type="date" 
                    value={editDischargeDate}
                    onChange={(e) => setEditDischargeDate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    {isOtherOrg ? 'User Phone' : 'Patient Phone'}
                  </label>
                  <input 
                    type="text" 
                    value={editPatientPhone}
                    onChange={(e) => setEditPatientPhone(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    {isOtherOrg ? 'User Email' : 'Patient Email'}
                  </label>
                  <input 
                    type="email" 
                    value={editPatientEmail}
                    onChange={(e) => setEditPatientEmail(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Caretaker Phone</label>
                  <input 
                    type="text" 
                    value={editCaretakerPhone}
                    onChange={(e) => setEditCaretakerPhone(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Caretaker Email</label>
                  <input 
                    type="email" 
                    value={editCaretakerEmail}
                    onChange={(e) => setEditCaretakerEmail(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] outline-none transition-all"
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <input 
                  type="checkbox" 
                  id="editConsentVerified"
                  checked={editConsentVerified}
                  onChange={(e) => setEditConsentVerified(e.target.checked)}
                  className="rounded text-[#0097b2] focus:ring-[#0097b2] h-4 w-4"
                />
                <label htmlFor="editConsentVerified" className="text-sm font-semibold text-gray-700 select-none">
                  Clinical Consent Documents Verified
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Technician / Clinical Notes</label>
                <textarea 
                  rows={4}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] outline-none transition-all resize-none"
                ></textarea>
              </div>
              
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100 shrink-0">
                <button 
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition-colors text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 bg-[#0097b2] text-white font-bold rounded-lg hover:bg-[#00829a] transition-colors text-sm disabled:opacity-50 cursor-pointer"
                >
                  {editSubmitting ? 'Saving...' : 'Save Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}
