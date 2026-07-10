import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  UserCircle, 
  Calendar, 
  Bed, 
  HardDrive, 
  FileText, 
  Heart, 
  Activity, 
  ShieldCheck,
  Clock,
  Pencil,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '@/services/api';
import IncidentTimeline from '@/components/dashboard/IncidentTimeline';

interface Props {
  patient: any;
  onBack: () => void;
}

const getSessionDateString = (dateObj: Date) => {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

export default function AdminPatientDetailView({ patient, onBack }: Props) {
  const navigate = useNavigate();
  const [sessionData, setSessionData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [sleepSession, setSleepSession] = useState<any>(null);
  const [sleepLoading, setSleepLoading] = useState<boolean>(false);

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
  const [editConsentVerified, setEditConsentVerified] = useState<boolean>(false);
  const [editNotes, setEditNotes] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState<boolean>(false);

  const handleOpenEditModal = () => {
    if (!sessionData) return;
    setEditName(sessionData.name || '');
    setEditPatientId(sessionData.patientId || sessionData.patientCode || '');
    setEditAge(sessionData.age ? String(sessionData.age) : '');
    setEditSex(sessionData.sex || 'male');
    setEditRoom(sessionData.room || '');
    setEditBed(sessionData.bed || '');
    setEditAdmissionDate(sessionData.admissionDate ? sessionData.admissionDate.split('T')[0] : '');
    setEditDischargeDate(sessionData.dischargeDate ? sessionData.dischargeDate.split('T')[0] : '');
    setEditConsentVerified(!!sessionData.consentVerified);
    setEditNotes(sessionData.technicianNotes || '');
    setEditError(null);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    setEditSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const patientId = patient.id || patient._id;
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
        consentVerified: editConsentVerified,
        technicianNotes: editNotes.trim()
      };

      const res = await fetch(apiUrl(`/api/sessions/${patientId}`), {
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
        fetchFullSession();
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

  const fetchFullSession = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const patientId = patient.id || patient._id;
      const res = await fetch(apiUrl(`/api/sessions/${patientId}`), { headers });
      const data = await res.json();
      if (res.ok && data.success) {
        const mSession = data.data;
        setSessionData(mSession);
        
        // Initialize default selectedDate if it hasn't been set yet
        if (mSession && !selectedDate) {
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
          setSelectedDate(getSessionDateString(targetDate));
        }
      } else {
        setError(data.message || 'Failed to load patient monitoring details');
      }
    } catch (err) {
      console.error('Error fetching patient session details:', err);
      setError('Server error loading details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (patient) {
      fetchFullSession();
    }
  }, [patient]);

  // Set up periodic polling for active vitals every 5 seconds
  useEffect(() => {
    let intervalId: any;
    if (sessionData && sessionData.status === 'active') {
      intervalId = setInterval(() => {
        fetchFullSession();
      }, 5000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [sessionData?.status]);

  useEffect(() => {
    const fetchSleepData = async () => {
      if (!sessionData?.deviceId || !selectedDate) return;
      setSleepLoading(true);
      try {
        const token = localStorage.getItem('token');
        const sleepRes = await fetch(apiUrl(`/api/sleep/session/${sessionData.deviceId}?date=${selectedDate}`), {
          headers: { Authorization: `Bearer ${token}` }
        });
        const sleepJson = await sleepRes.json();
        
        if (sleepJson.success && sleepJson.data) {
          setSleepSession(sleepJson.data);
        } else {
          setSleepSession(null);
        }
      } catch (err) {
        console.error('Error fetching sleep data:', err);
        setSleepSession(null);
      } finally {
        setSleepLoading(false);
      }
    };

    fetchSleepData();
  }, [selectedDate, sessionData?.deviceId]);

  let maxDateStr = '';
  let minDateStr = '';

  if (sessionData) {
    let targetDate = new Date();
    if (sessionData.status === 'completed' && sessionData.dischargeDate) {
      targetDate = new Date(sessionData.dischargeDate);
    } else {
      targetDate.setHours(0, 0, 0, 0);
      if (new Date().getHours() >= 12) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
    }
    maxDateStr = getSessionDateString(targetDate);
    
    if (sessionData.admissionDate || sessionData.startTime) {
      minDateStr = getSessionDateString(new Date(sessionData.admissionDate || sessionData.startTime));
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#007b90] mb-4"></div>
        <p className="text-sm text-gray-500 font-medium">Loading patient monitoring details...</p>
      </div>
    );
  }

  if (error || !sessionData) {
    return (
      <div className="p-8 bg-white rounded-xl border border-gray-200 shadow-sm">
        <button 
          onClick={onBack}
          className="inline-flex items-center text-sm font-bold text-[#007b90] hover:text-[#006070] mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Organization Details
        </button>
        <div className="text-center py-10">
          <p className="text-red-500 font-semibold mb-2">{error || 'Patient data not found'}</p>
          <p className="text-sm text-gray-500">Please try again or contact support.</p>
        </div>
      </div>
    );
  }

  const isMonitoring = sessionData.status === 'active';
  const admissionDateStr = sessionData.admissionDate ? new Date(sessionData.admissionDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }) : 'N/A';
  const dischargeDateStr = sessionData.dischargeDate ? new Date(sessionData.dischargeDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }) : 'Not Discharged';

  return (
    <div className="space-y-6">
      {/* Back navigation & Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <button 
            onClick={onBack}
            className="inline-flex items-center text-sm font-bold text-[#007b90] hover:text-[#006070] mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Organization Details
          </button>
          <div className="flex items-center space-x-3 mt-1">
            <h2 className="text-2xl font-bold text-gray-900">{sessionData.name || 'Unnamed Patient'}</h2>
            <button
              onClick={handleOpenEditModal}
              className="p-1 text-gray-500 hover:text-[#007b90] hover:bg-teal-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-teal-200"
              title="Edit Patient Details"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
              isMonitoring ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isMonitoring ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
              {isMonitoring ? 'Active Monitoring' : sessionData.status || 'Completed'}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {sessionData.deviceId && (
            <button
              onClick={() => navigate(`/live/${sessionData.deviceId}`)}
              className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-bold text-[#007b90] border border-[#007b90] hover:bg-[#007b90] hover:text-white transition-colors cursor-pointer bg-white"
            >
              <Activity className="w-4 h-4 mr-2" />
              View Live Trends
            </button>
          )}
          <div className="bg-gray-100 text-gray-800 text-xs font-mono font-bold px-3 py-1.5 rounded-lg border border-gray-200">
            Patient Code: {sessionData.patientId || sessionData.patientCode || 'N/A'}
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Columns (Core Info & Notes) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Patient Profile */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-3">
              <div className="flex items-center">
                <UserCircle className="w-5 h-5 text-[#007b90] mr-2" />
                <h3 className="text-lg font-bold text-[#007b90]">Patient Profile & Status</h3>
              </div>
              <button
                onClick={handleOpenEditModal}
                className="flex items-center space-x-1 px-2.5 py-1 text-xs font-bold text-[#007b90] hover:text-[#006070] bg-[#007b90]/10 hover:bg-[#007b90]/20 rounded-lg transition-all cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Details</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Full Name</label>
                <div className="text-gray-900 font-bold py-2 border-b border-gray-50">{sessionData.name || 'Unnamed Patient'}</div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Age</label>
                <div className="text-gray-900 font-bold py-2 border-b border-gray-50">{sessionData.age ? `${sessionData.age} Years` : 'N/A'}</div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Gender</label>
                <div className="text-gray-900 font-bold py-2 border-b border-gray-50 capitalize">{sessionData.sex || 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Monitoring Details */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center mb-6 border-b border-gray-100 pb-3">
              <Calendar className="w-5 h-5 text-[#007b90] mr-2" />
              <h3 className="text-lg font-bold text-[#007b90]">Admission & Duration Details</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Admission Date</label>
                <div className="text-gray-900 font-medium py-2 flex items-center">
                  <Clock className="w-4 h-4 text-gray-400 mr-2" />
                  {admissionDateStr}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Discharge Date</label>
                <div className="text-gray-900 font-medium py-2 flex items-center">
                  <Clock className="w-4 h-4 text-gray-400 mr-2" />
                  {dischargeDateStr}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Consent Verified</label>
                <div className="text-gray-900 font-bold py-2 flex items-center">
                  <ShieldCheck className={`w-4 h-4 mr-2 ${sessionData.consentVerified ? 'text-green-500' : 'text-red-500'}`} />
                  {sessionData.consentVerified ? 'Verified' : 'No Consent Documented'}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Device Room & Bed</label>
                <div className="text-gray-900 font-bold py-2 flex items-center">
                  <Bed className="w-4 h-4 text-gray-400 mr-2" />
                  Room {sessionData.room || 'N/A'} - Bed {sessionData.bed || 'N/A'}
                </div>
              </div>
            </div>
          </div>

          {/* Sleep Behaviour (Hypnogram) */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 relative">
            {sleepLoading && (
              <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-[1px] flex items-center justify-center rounded-xl border border-gray-100 transition-opacity duration-300">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#007b90]"></div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b border-gray-100 pb-3 space-y-3 sm:space-y-0">
              <div className="flex items-center">
                <Activity className="w-5 h-5 text-[#007b90] mr-2" />
                <h3 className="text-lg font-bold text-[#007b90]">Sleep Behaviour</h3>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Monitoring Cycle</span>
                  <span className="text-xs font-bold text-[#007b90]">{formatCycleDate(selectedDate)}</span>
                </div>
                <div className="h-8 w-px bg-gray-200"></div>
                <input 
                  type="date" 
                  value={selectedDate}
                  min={minDateStr}
                  max={maxDateStr}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="border border-gray-200 rounded-md px-2 py-1 text-xs font-medium text-gray-700 outline-none cursor-pointer hover:bg-gray-50 transition-colors"
                />
              </div>
            </div>
            
            <IncidentTimeline sleepSession={sleepSession} />
          </div>

          {/* Technician Notes */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center mb-4 border-b border-gray-100 pb-3">
              <FileText className="w-5 h-5 text-[#007b90] mr-2" />
              <h3 className="text-lg font-bold text-[#007b90]">Technician / Clinical Notes</h3>
            </div>
            <p className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg leading-relaxed font-medium min-h-[80px]">
              {sessionData.technicianNotes || 'No notes added for this monitoring session.'}
            </p>
          </div>

        </div>

        {/* Right Column: Vitals & IoT Device */}
        <div className="space-y-6">
          
          {/* Real-time Vitals Display (Active Vitals) */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center mb-6 border-b border-gray-100 pb-3">
              <Activity className="w-5 h-5 text-[#007b90] mr-2" />
              <h3 className="text-lg font-bold text-[#007b90]">Real-Time Vitals</h3>
            </div>

            {isMonitoring ? (
              <div className="space-y-4">
                {/* Heart Rate */}
                <div className="bg-red-50/50 border border-red-100 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-red-100 rounded-lg text-red-600">
                      <Heart className="w-5 h-5 fill-red-500 text-red-500" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-red-700">Heart Rate</div>
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-red-900 font-mono">
                    {sessionData.currentHeartRate || '--'}
                  </div>
                </div>

                {/* Respiration */}
                <div className="bg-teal-50/50 border border-teal-100 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-teal-100 rounded-lg text-teal-600">
                      <Activity className="w-5 h-5 text-teal-500" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-teal-700">Respiration</div>
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-teal-900 font-mono">
                    {sessionData.currentRespiration || '--'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-gray-500 uppercase">Monitoring Ended</p>
                <p className="text-[10px] text-gray-400 mt-1">Real-time vitals are only available during active sessions.</p>
              </div>
            )}
          </div>

          {/* Assigned Sensor Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center mb-6 border-b border-gray-100 pb-3">
              <HardDrive className="w-5 h-5 text-[#007b90] mr-2" />
              <h3 className="text-lg font-bold text-[#007b90]">Assigned IoT Sensor</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Device Hardware ID</label>
                <div className="text-sm font-mono font-bold text-gray-900 mt-1">{sessionData.deviceId || 'N/A'}</div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Room Assignment</label>
                <div className="text-sm font-bold text-gray-900 mt-1">Room {sessionData.room || 'N/A'}</div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Bed Assignment</label>
                <div className="text-sm font-bold text-gray-900 mt-1">Bed {sessionData.bed || 'N/A'}</div>
              </div>
              {sessionData.deviceId && (
                <button
                  onClick={() => navigate(`/live/${sessionData.deviceId}`)}
                  className="w-full mt-2 inline-flex justify-center items-center px-4 py-2 border border-[#007b90] text-[#007b90] hover:bg-[#007b90] hover:text-white rounded-lg transition-colors cursor-pointer font-bold text-xs"
                >
                  <Activity className="w-4 h-4 mr-1.5" />
                  View Live Trends
                </button>
              )}
            </div>
          </div>

      </div>
      
      {/* Edit Patient Details Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-gray-100 shrink-0">
              <h2 className="text-xl font-bold text-gray-900">Edit Patient Details</h2>
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
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Patient ID / Code</label>
                  <input 
                    type="text" 
                    value={editPatientId}
                    onChange={(e) => setEditPatientId(e.target.value)}
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Age</label>
                  <input 
                    type="number" 
                    value={editAge}
                    onChange={(e) => setEditAge(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Gender</label>
                  <select 
                    value={editSex}
                    onChange={(e) => setEditSex(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all appearance-none"
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
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Bed Number</label>
                  <input 
                    type="text" 
                    value={editBed}
                    onChange={(e) => setEditBed(e.target.value)}
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Admission Date</label>
                  <input 
                    type="date" 
                    value={editAdmissionDate}
                    onChange={(e) => setEditAdmissionDate(e.target.value)}
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Discharge Date</label>
                  <input 
                    type="date" 
                    value={editDischargeDate}
                    onChange={(e) => setEditDischargeDate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all"
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <input 
                  type="checkbox" 
                  id="editConsentVerified"
                  checked={editConsentVerified}
                  onChange={(e) => setEditConsentVerified(e.target.checked)}
                  className="rounded text-[#007b90] focus:ring-[#007b90] h-4 w-4"
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
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all resize-none"
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
                  className="px-4 py-2 bg-[#007b90] text-white font-bold rounded-lg hover:bg-[#006070] transition-colors text-sm disabled:opacity-50 cursor-pointer"
                >
                  {editSubmitting ? 'Saving...' : 'Save Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
