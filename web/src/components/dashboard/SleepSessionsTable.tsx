import { useState, useEffect } from 'react';
import { Search, MoreVertical, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDashboardSessions, getUserProfile } from '@/services/deviceService';
import { deleteSession, updateSessionDetails } from '@/services/sessionService';
import { createManualEntry } from '@/services/manualEntryService';

export default function SleepSessionsTable({
  externalFilter = '',
  onFilterChange
}: {
  externalFilter?: string;
  onFilterChange?: (filter: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: sessions = [], isLoading: loading } = useQuery({
    queryKey: ['dashboard_sessions'],
    queryFn: getDashboardSessions,
    staleTime: 30000, // 30s cache — avoids spinner on quick back-navigation and StrictMode double-mount flash
  });

  const { data: profile } = useQuery({
    queryKey: ['user_profile'],
    queryFn: getUserProfile,
    staleTime: 60000 * 5,
  });
  const isViewer = profile?.role === 'viewer';
  const isOtherOrg = profile?.account?.organizationId?.organizationType === 'other';

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateSort, setDateSort] = useState('desc');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  
  const [sessionToRemove, setSessionToRemove] = useState<any | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Manual Entry state
  const [sessionForManualEntry, setSessionForManualEntry] = useState<any | null>(null);
  const [manualHr, setManualHr] = useState('');
  const [manualResp, setManualResp] = useState('');
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualTime, setManualTime] = useState(new Date().toTimeString().slice(0, 5));
  const [isSavingManual, setIsSavingManual] = useState(false);

  // Manage Patient State
  const [sessionToManage, setSessionToManage] = useState<any | null>(null);
  const [manageName, setManageName] = useState('');
  const [managePatientCode, setManagePatientCode] = useState('');
  const [manageAdmissionDate, setManageAdmissionDate] = useState('');
  const [manageDischargeDate, setManageDischargeDate] = useState('');
  const [isManaging, setIsManaging] = useState(false);

  useEffect(() => {
    setStatusFilter(externalFilter);
  }, [externalFilter]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    if (onFilterChange) onFilterChange(val);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-US');
  };

  const confirmRemove = async () => {
    if (sessionToRemove) {
      setIsRemoving(true);
      try {
        await deleteSession(sessionToRemove.id);
        queryClient.invalidateQueries({ queryKey: ['dashboard_sessions'] });
        queryClient.invalidateQueries({ queryKey: ['org_rooms_beds'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      } catch (error) {
        console.error(error);
        alert('Failed to delete session');
      } finally {
        setIsRemoving(false);
        setSessionToRemove(null);
      }
    }
  };

  const handleManualEntrySubmit = async () => {
    if (!sessionForManualEntry) return;
    if (!manualHr || !manualResp) {
      alert("Please enter HR and Respiration.");
      return;
    }
    
    setIsSavingManual(true);
    try {
      await createManualEntry({
        deviceId: sessionForManualEntry.deviceId,
        room: sessionForManualEntry.room,
        bed: sessionForManualEntry.bedId || sessionForManualEntry.bed,
        heartRate: Number(manualHr),
        respiration: Number(manualResp),
        date: manualDate,
        time: manualTime,
      });
      alert('Manual entry saved successfully');
      setSessionForManualEntry(null);
      setManualHr('');
      setManualResp('');
    } catch (error) {
      console.error(error);
      alert('Failed to save manual entry');
    } finally {
      setIsSavingManual(false);
    }
  };

  const handleManageSubmit = async () => {
    if (!sessionToManage) return;
    setIsManaging(true);
    try {
      await updateSessionDetails(sessionToManage.id, {
        name: manageName,
        patientCode: managePatientCode,
        admissionDate: manageAdmissionDate ? new Date(manageAdmissionDate).toISOString() : undefined,
        dischargeDate: manageDischargeDate ? new Date(manageDischargeDate).toISOString() : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['dashboard_sessions'] });
      queryClient.invalidateQueries({ queryKey: ['org_rooms_beds'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      setSessionToManage(null);
    } catch (error) {
      console.error(error);
      alert('Failed to update patient details');
    } finally {
      setIsManaging(false);
    }
  };

  let filteredSessions = sessions.filter((session: any) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = 
      (session.name?.toLowerCase() || '').includes(q) ||
      (session.patientCode?.toLowerCase() || '').includes(q) ||
      (session.room?.toLowerCase() || '').includes(q) ||
      (session.bedId?.toLowerCase() || '').includes(q);
    const matchesStatus = statusFilter ? session.status === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

  if (dateSort === 'asc') {
    filteredSessions = [...filteredSessions].reverse();
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
      {/* Table Toolbar */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center space-x-3 flex-1">
          <div className="relative w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search Name, Room, Bed or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-9 pr-3 py-2 bg-gray-100 border-transparent rounded-md text-sm placeholder-gray-500 focus:bg-white focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] transition-colors"
            />
          </div>
          <select
            value={dateSort}
            onChange={(e) => setDateSort(e.target.value)}
            className="bg-gray-100 border-transparent text-gray-700 text-sm rounded-md focus:ring-[#0097b2] focus:border-[#0097b2] block p-2 pr-8"
          >
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="bg-gray-100 border-transparent text-gray-700 text-sm rounded-md focus:ring-[#0097b2] focus:border-[#0097b2] block p-2 pr-8"
          >
            <option value="">All Statuses</option>
            <option value="Monitoring">Monitoring</option>
            <option value="Completed">Completed</option>
            <option value="Offline">Offline</option>
          </select>
        </div>
      </div>

      <div className="p-4 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 font-sans tracking-tight">
          {isOtherOrg ? 'All Users' : 'All Patients'} <span className="text-gray-500 font-normal text-base">({filteredSessions.length} sessions)</span>
        </h2>
      </div>

      <div className="overflow-visible">
        <table className="w-full text-left text-sm table-fixed">
          <thead className="bg-white text-gray-500 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 font-semibold w-[5%]">Status</th>
              <th className="px-6 py-4 font-semibold w-[20%]">Name</th>
              <th className="px-6 py-4 font-semibold w-[8%]">Room</th>
              <th className="px-6 py-4 font-semibold w-[8%]">Bed</th>
              <th className="px-6 py-4 font-semibold w-[26%]">Admission Date</th>
              <th className="px-6 py-4 font-semibold w-[25%]">Discharge Date</th>
              {!isViewer && <th className="px-6 py-4 font-semibold w-[8%] text-right">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={isViewer ? 6 : 7} className="px-6 py-12 text-center text-gray-500">
                  Loading sessions...
                </td>
              </tr>
            ) : filteredSessions.length === 0 ? (
              <tr>
                <td colSpan={isViewer ? 6 : 7} className="px-6 py-12 text-center text-gray-500">
                  No patient record found.
                </td>
              </tr>
            ) : (
              filteredSessions.map((session: any, idx: number) => {
                const isDeviceOnline = (session.deviceStatus || '').toLowerCase() === 'online';
                return (
                  <tr
                    key={idx}
                    onClick={() => navigate(`/sessions/${session.id}`)}
                    className={`cursor-pointer transition-colors ${!isDeviceOnline ? 'bg-red-50/30 hover:bg-red-50/60' : 'hover:bg-gray-50'
                      }`}
                  >
                    <td className="px-6 py-4 w-[5%]">
                      <span className="flex items-center justify-start">
                        <span 
                          className={`w-3 h-3 rounded-full ${isDeviceOnline ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}
                          title={isDeviceOnline ? 'Online' : 'Offline'}
                        />
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[#0097b2] font-semibold w-[20%] truncate">
                      {session.name || session.patientCode || 'PT-XXXX'}
                    </td>
                    <td className="px-6 py-4 text-gray-900 font-medium w-[8%] truncate">
                      {session.room ? session.room.replace(/^Room\s+/i, '') : '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-900 font-medium w-[8%] truncate">
                      {session.bedId ? session.bedId.replace(/^Bed\s+/i, '') : '—'}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-600 w-[26%]">
                      {formatDate(session.admissionDate)}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-600 w-[25%]">
                      {formatDate(session.dischargeDate)}
                    </td>
                    {!isViewer && (
                      <td className="px-6 py-4 text-right w-[8%] relative">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenu(activeMenu === session.id ? null : session.id);
                          }}
                          className="p-1.5 text-gray-400 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        {activeMenu === session.id && (
                          <div className="absolute right-6 top-10 w-36 bg-white rounded-md shadow-lg border border-gray-100 z-10 py-1 text-left" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSessionForManualEntry(session);
                                setActiveMenu(null);
                              }}
                              className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left font-medium border-b border-gray-50"
                            >
                              Manual Entry
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setManageName(session.name || '');
                                setManagePatientCode(session.patientCode || '');
                                
                                // Format dates for datetime-local input (YYYY-MM-DDThh:mm)
                                const formatForInput = (dStr: string) => {
                                  if (!dStr) return '';
                                  const d = new Date(dStr);
                                  if (isNaN(d.getTime())) return '';
                                  return d.toISOString().slice(0, 16);
                                };
                                
                                setManageAdmissionDate(formatForInput(session.admissionDate));
                                setManageDischargeDate(formatForInput(session.dischargeDate));
                                setSessionToManage(session);
                                setActiveMenu(null);
                              }}
                              className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left font-medium border-b border-gray-50"
                            >
                              Manage
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSessionToRemove(session);
                                setActiveMenu(null);
                              }}
                              disabled={isRemoving}
                              className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left font-medium disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Remove Confirmation Modal */}
      {sessionToRemove && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm overflow-hidden text-center p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{isOtherOrg ? 'Delete User' : 'Delete Patient'}</h2>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              Delete {isOtherOrg ? 'user' : 'patient'} <span className="font-bold text-gray-700">{sessionToRemove.name || sessionToRemove.patientCode}</span>? This action cannot be undone.
            </p>
            <div className="flex space-x-3">
              <button 
                onClick={(e) => { e.stopPropagation(); setSessionToRemove(null); }}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                No
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); confirmRemove(); }}
                disabled={isRemoving}
                className="flex-1 px-4 py-2 text-sm font-bold text-white bg-red-500 rounded-md hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {isRemoving ? 'Deleting...' : 'Yes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {sessionForManualEntry && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Manual Entry</h2>
              <button onClick={() => setSessionForManualEntry(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="space-y-4 mb-6 text-left">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Heart Rate (bpm)</label>
                  <input type="number" value={manualHr} onChange={e => setManualHr(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Respiration (rpm)</label>
                  <input type="number" value={manualResp} onChange={e => setManualResp(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Date</label>
                  <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Time</label>
                  <input type="time" value={manualTime} onChange={e => setManualTime(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] outline-none" />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setSessionForManualEntry(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleManualEntrySubmit}
                disabled={isSavingManual || !manualHr || !manualResp}
                className="px-4 py-2 text-sm font-bold text-white bg-[#0097b2] rounded-md hover:bg-[#00829a] disabled:opacity-50 transition-colors"
              >
                {isSavingManual ? 'Saving...' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Patient Modal */}
      {sessionToManage && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">{isOtherOrg ? 'Manage User' : 'Manage Patient'}</h2>
              <button onClick={() => setSessionToManage(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="space-y-4 mb-6 text-left">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{isOtherOrg ? 'User Name' : 'Patient Name'}</label>
                <input type="text" value={manageName} onChange={e => setManageName(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{isOtherOrg ? 'User ID / Code' : 'Patient ID / Code'}</label>
                <input type="text" value={managePatientCode} onChange={e => setManagePatientCode(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Admission Date & Time</label>
                <input type="datetime-local" value={manageAdmissionDate} max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={e => setManageAdmissionDate(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Discharge Date & Time (Optional)</label>
                <input type="datetime-local" value={manageDischargeDate} min={manageAdmissionDate} max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={e => setManageDischargeDate(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] outline-none" />
                <p className="text-[10px] text-gray-500 mt-1">Setting a discharge date will automatically mark this session as Completed.</p>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setSessionToManage(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleManageSubmit}
                disabled={isManaging}
                className="px-4 py-2 text-sm font-bold text-white bg-[#0097b2] rounded-md hover:bg-[#00829a] disabled:opacity-50 transition-colors"
              >
                {isManaging ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
