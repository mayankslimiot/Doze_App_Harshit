import DashboardLayout from '@/components/layout/DashboardLayout';
import { ArrowLeft, User, FileText, Play, Check, ChevronDown } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getOrgRoomsBeds, getUserProfile } from '@/services/deviceService';
import { createMonitoringSession } from '@/services/sessionService';
import { useState, useEffect, useMemo } from 'react';
import { apiUrl } from '@/services/api';

const selectClass = 'w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] transition-colors appearance-none';
const inputClass  = 'w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] transition-colors';

export default function NewSession() {
  const now = new Date();
  const formatDateTime = (d: Date) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  // ── Org rooms/beds from API ──────────────────────────────────────────────
  const { data: orgRooms = [], isLoading: roomsLoading } = useQuery({
    queryKey: ['org_rooms_beds'],
    queryFn: getOrgRoomsBeds,
    staleTime: 60_000,
  });

  const { data: profile } = useQuery<any>({
    queryKey: ['user_profile'],
    queryFn: getUserProfile,
    staleTime: 60000 * 5,
  });

  const isOtherOrg = profile?.account?.organizationId?.organizationType === 'other';

  // ── Form state ───────────────────────────────────────────────────────────
  const [name, setName]                   = useState('');
  const [patientId, setPatientId]         = useState('');
  const [room, setRoom]                   = useState('');
  const [bed, setBed]                     = useState('');
  const [age, setAge]                     = useState('');
  const [sex, setSex]                     = useState('');
  const [admissionDate, setAdmissionDate] = useState(formatDateTime(now));
  const [dischargeDate, setDischargeDate] = useState('');
  
  const [patientPhone, setPatientPhone]   = useState('');
  const [patientEmail, setPatientEmail]   = useState('');
  const [caretakerPhone, setCaretakerPhone] = useState('');
  const [caretakerEmail, setCaretakerEmail] = useState('');
  const [showMore, setShowMore]           = useState(false);

  const [consentVerified, setConsentVerified] = useState(true);
  const [consentError, setConsentError]       = useState('');
  const [technicianNotes, setTechnicianNotes] = useState('');
  const [isSubmitting, setIsSubmitting]       = useState(false);
  const navigate = useNavigate();

  // ── Derived bed list based on selected room ──────────────────────────────
  const availableBeds = useMemo(() => {
    const found = orgRooms.find(r => r.room === room);
    return found ? found.beds : [];
  }, [orgRooms, room]);

  // Clear bed whenever room changes
  useEffect(() => { setBed(''); }, [room]);

  // Fetch unique generated Patient ID on component mount
  useEffect(() => {
    const fetchPatientId = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(apiUrl('/api/sessions/generate-patient-id'), {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.patientId) {
          setPatientId(data.patientId);
        }
      } catch (error) {
        console.error('Failed to generate patient ID:', error);
      }
    };
    fetchPatientId();
  }, []);



  // ── Consent & submit ─────────────────────────────────────────────────────
  const handleConsentClick = () => {
    setConsentVerified(v => !v);
    setConsentError('');
  };

  const handleStartMonitoring = async () => {
    if (!consentVerified) { setConsentError('Please verify patient consent first'); return; }
    try {
      setIsSubmitting(true);
      await createMonitoringSession({
        name, patientId, room, bed,
        age: age ? Number(age) : undefined,
        sex, admissionDate,
        dischargeDate: dischargeDate || undefined,
        technicianNotes, consentVerified,
        patientPhone: patientPhone || undefined,
        patientEmail: patientEmail || undefined,
        caretakerPhone: caretakerPhone || undefined,
        caretakerEmail: caretakerEmail || undefined,
      });
      navigate('/dashboard');
    } catch (error) {
      console.error(error);
      setConsentError(error instanceof Error ? error.message : 'Failed to start session. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="relative min-h-[calc(100vh-73px)] pb-24 bg-[#f9fafb]">
        <div className="max-w-4xl mx-auto p-8">

          {/* Header */}
          <div className="flex items-start mb-8">
            <Link to="/dashboard" className="mt-1 mr-4 text-gray-400 hover:text-gray-900 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{isOtherOrg ? 'New User Onboarding' : 'New Patient Onboarding'}</h1>
              <p className="text-sm text-gray-500 mt-1">{isOtherOrg ? 'Configure user details for the sleep study.' : 'Configure patient details for the sleep study.'}</p>
            </div>
          </div>

          <div className="space-y-6">

            {/* ── 1. Patient Details ──────────────────────────────────── */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center bg-gray-50/50">
                <User className="w-5 h-5 text-[#0097b2] mr-3" />
                <h2 className="text-lg font-bold text-gray-900">{isOtherOrg ? 'User Details' : 'Patient Details'}</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-6">

                  {/* Name */}
                  <div>
                    <label className="block text-xs font-bold text-gray-900 mb-2">Name *</label>
                    <input type="text" placeholder="e.g., John Doe" value={name}
                      onChange={e => setName(e.target.value)} required className={inputClass} />
                  </div>

                  {/* Patient ID */}
                  <div>
                    <label className="block text-xs font-bold text-gray-900 mb-2">{isOtherOrg ? 'User ID *' : 'Patient ID *'}</label>
                    <input type="text" placeholder={isOtherOrg ? 'e.g., U-10042' : 'e.g., P-10042'} value={patientId}
                      onChange={e => setPatientId(e.target.value)} required className={inputClass} />
                  </div>

                  {/* Room Number — cascading dropdown */}
                  <div>
                    <label className="block text-xs font-bold text-gray-900 mb-2">Room Number *</label>
                    <div className="relative">
                      <select value={room} onChange={e => setRoom(e.target.value)} required className={selectClass}
                        disabled={roomsLoading}>
                        <option value="">{roomsLoading ? 'Loading rooms…' : 'Select Room'}</option>
                        {orgRooms.map(r => (
                          <option key={r.room} value={r.room}>{r.room}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                    {!roomsLoading && orgRooms.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">No rooms configured. Please assign room/bed to devices first.</p>
                    )}
                  </div>

                  {/* Bed Number — filtered by selected room */}
                  <div>
                    <label className="block text-xs font-bold text-gray-900 mb-2">Bed Number *</label>
                    <div className="relative">
                      <select value={bed} onChange={e => setBed(e.target.value)} required className={selectClass}
                        disabled={!room || availableBeds.length === 0}>
                        <option value="">
                          {!room ? 'Select room first' : availableBeds.length === 0 ? 'No beds in this room' : 'Select Bed'}
                        </option>
                        {availableBeds.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                  </div>

                  {/* Age */}
                  <div>
                    <label className="block text-xs font-bold text-gray-900 mb-2">Age *</label>
                    <input type="number" placeholder="e.g., 45" value={age}
                      onChange={e => setAge(e.target.value)} required min="0" className={inputClass} />
                  </div>

                  {/* Sex */}
                  <div>
                    <label className="block text-xs font-bold text-gray-900 mb-2">Sex *</label>
                    <div className="relative">
                      <select value={sex} onChange={e => setSex(e.target.value)} required className={selectClass}>
                        <option value="" disabled>Select Sex</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                  </div>

                  {/* Admission Date */}
                  <div>
                    <label className="block text-xs font-bold text-gray-900 mb-2">Admission Date *</label>
                    <input type="datetime-local" value={admissionDate}
                      max={formatDateTime(now)}
                      onChange={e => setAdmissionDate(e.target.value)} required
                      className={`${inputClass} font-mono`} />
                  </div>

                  {/* Discharge Date */}
                  <div>
                    <label className="block text-xs font-bold text-gray-900 mb-2">Discharge Date</label>
                    <input type="datetime-local" value={dischargeDate}
                      min={admissionDate}
                      max={formatDateTime(now)}
                      onChange={e => setDischargeDate(e.target.value)}
                      className={`${inputClass} font-mono`} />
                  </div>

                </div>

                <div className="mt-6 flex justify-end">
                  <button 
                    type="button" 
                    onClick={() => setShowMore(!showMore)}
                    className="text-xs font-bold text-[#0097b2] hover:text-[#007b90] transition-colors flex items-center"
                  >
                    {showMore ? 'Less Options' : 'More Options'}
                    <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${showMore ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {showMore && (
                  <div className="mt-6 pt-6 border-t border-gray-100">
                    <h3 className="text-sm font-bold text-[#004f5e] mb-4">
                      {isOtherOrg ? 'Additional User & Caretaker Information' : 'Additional Patient & Caretaker Information'}
                    </h3>
                    <div className="grid grid-cols-2 gap-6">
                      {/* Patient/User Phone */}
                      <div>
                        <label className="block text-xs font-bold text-gray-900 mb-2">
                          {isOtherOrg ? 'User Phone Number' : 'Patient Phone Number'}
                        </label>
                        <input 
                          type="tel" 
                          placeholder="e.g., +91 98765 43210" 
                          value={patientPhone}
                          onChange={e => setPatientPhone(e.target.value)} 
                          className={inputClass} 
                        />
                      </div>

                      {/* Patient/User Email */}
                      <div>
                        <label className="block text-xs font-bold text-gray-900 mb-2">
                          {isOtherOrg ? 'User Email Address' : 'Patient Email Address'}
                        </label>
                        <input 
                          type="email" 
                          placeholder="e.g., email@example.com" 
                          value={patientEmail}
                          onChange={e => setPatientEmail(e.target.value)} 
                          className={inputClass} 
                        />
                      </div>

                      {/* Caretaker Phone */}
                      <div>
                        <label className="block text-xs font-bold text-gray-900 mb-2">
                          Caretaker Phone Number (for alerts)
                        </label>
                        <input 
                          type="tel" 
                          placeholder="e.g., +91 98765 43211" 
                          value={caretakerPhone}
                          onChange={e => setCaretakerPhone(e.target.value)} 
                          className={inputClass} 
                        />
                      </div>

                      {/* Caretaker Email */}
                      <div>
                        <label className="block text-xs font-bold text-gray-900 mb-2">
                          Caretaker Email Address
                        </label>
                        <input 
                          type="email" 
                          placeholder="e.g., caretaker@example.com" 
                          value={caretakerEmail}
                          onChange={e => setCaretakerEmail(e.target.value)} 
                          className={inputClass} 
                        />
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* ── 2. Clinical Notes ───────────────────────────────────── */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center bg-gray-50/50">
                <FileText className="w-5 h-5 text-[#0097b2] mr-3" />
                <h2 className="text-lg font-bold text-gray-900">Clinical Notes &amp; Method</h2>
              </div>
              <div className="p-6">
                <label className="block text-xs font-bold text-gray-900 mb-2">Technician Notes</label>
                <textarea placeholder="Enter any initial observations or setup notes…"
                  value={technicianNotes} onChange={e => setTechnicianNotes(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] min-h-[120px] resize-y"
                />
              </div>
            </div>

            {/* ── 3. Patient Consent ──────────────────────────────────── */}
            <div className="pt-2 px-1">
              <div className="flex items-center">
                <div
                  className={`w-5 h-5 rounded border ${consentVerified ? 'bg-[#0097b2] border-[#0097b2]' : 'bg-white border-gray-300'} mr-3 shrink-0 shadow-sm cursor-pointer hover:border-gray-400 flex items-center justify-center transition-colors`}
                  onClick={handleConsentClick}
                >
                  {consentVerified && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
                <div>
                  <p className="text-xs text-gray-500 italic">
                    {isOtherOrg 
                      ? 'I confirm that informed consent has been obtained from the user for this trial session, in accordance with clinical protocol.'
                      : 'I confirm that informed consent has been obtained from the patient for this trial session, in accordance with clinical protocol.'
                    }
                  </p>
                  {consentError && (
                    <p className="text-xs text-red-500 font-bold mt-1 bg-red-50 inline-block px-2 py-1 rounded-md border border-red-100">{consentError}</p>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Sticky Action Footer */}
        <div className="fixed bottom-0 left-56 right-0 bg-white border-t border-gray-200 p-4 px-8 flex justify-end items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-30">
          <div className="flex items-center space-x-4">
            <button className="px-6 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm"
              onClick={() => navigate('/dashboard')}>
              Cancel
            </button>
            <button
              className="px-6 py-2.5 bg-[#0097b2] hover:bg-[#007b90] text-white rounded-lg text-sm font-bold flex items-center transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleStartMonitoring} disabled={isSubmitting}>
              <Play className="w-4 h-4 mr-2 fill-current" />
              {isSubmitting ? 'Adding…' : (isOtherOrg ? 'Add User' : 'Add Patient')}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
