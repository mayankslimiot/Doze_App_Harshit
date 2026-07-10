import DashboardLayout from '@/components/layout/DashboardLayout';
import { useState, useEffect } from 'react';
import { apiUrl } from '@/services/api';
import { Ticket, RefreshCw, Plus, Edit2, Trash2, X, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Tickets() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'Open' | 'In Progress' | 'Resolved'>('Open');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Form display toggle
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);

  // Form Fields state
  const [ticketType, setTicketType] = useState('Device Setup');
  const [priority, setPriority] = useState('Low');
  const [sessionId, setSessionId] = useState('');
  const [participantCode, setParticipantCode] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [wardBedId, setWardBedId] = useState('');
  const [issueTime, setIssueTime] = useState(new Date().toISOString().substring(0, 16));
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState('');
  const [impact, setImpact] = useState('Minimal');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/tickets'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setTickets(data.data);
      }
    } catch (err) {
      console.error("Failed to load tickets:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleCreateOrUpdateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      alert('Please enter a detailed description of the issue.');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const isEdit = !!editingTicketId;
      const url = isEdit ? apiUrl(`/api/tickets/${editingTicketId}`) : apiUrl('/api/tickets');
      const method = isEdit ? 'PATCH' : 'POST';

      // We only allow updating the ticket details (and status back to Open if modified)
      const payload: any = {
        ticketType,
        priority,
        sessionId,
        participantCode,
        deviceId,
        wardBedId,
        issueTime,
        description,
        screenshot,
        impact
      };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (json.success) {
        alert(isEdit ? 'Ticket updated successfully!' : 'Ticket submitted successfully!');
        setShowCreateForm(false);
        setEditingTicketId(null);
        resetForm();
        fetchTickets();
      } else {
        alert('Action failed: ' + (json.message || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Network error connecting to support server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (t: any) => {
    // Check if editable: must be status Open and assignedPerson is Unassigned
    if (t.status !== 'Open' || (t.assignedPerson && t.assignedPerson !== 'Unassigned')) {
      alert('Only unassigned tickets with "Open" status can be edited.');
      return;
    }

    setEditingTicketId(t._id);
    setTicketType(t.ticketType || 'Device Setup');
    setPriority(t.priority || 'Low');
    setSessionId(t.sessionId || '');
    setParticipantCode(t.participantCode || '');
    setDeviceId(t.deviceId || '');
    setWardBedId(t.wardBedId || '');
    setIssueTime(t.issueTime ? new Date(t.issueTime).toISOString().substring(0, 16) : new Date().toISOString().substring(0, 16));
    setDescription(t.description || '');
    setScreenshot(t.screenshot || '');
    setImpact(t.impact || 'Minimal');
    setShowCreateForm(true);
  };

  const handleDeleteTicket = async (id: string) => {
    const t = tickets.find(x => x._id === id);
    if (!t) return;
    
    if (t.status !== 'Open' || (t.assignedPerson && t.assignedPerson !== 'Unassigned')) {
      alert('Only unassigned tickets with "Open" status can be deleted.');
      return;
    }

    if (!confirm('Are you sure you want to delete this ticket?')) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/tickets/${id}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) {
        alert('Ticket deleted successfully.');
        fetchTickets();
      } else {
        alert('Delete failed: ' + (json.message || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Network error deleting ticket.');
    }
  };

  const resetForm = () => {
    setTicketType('Device Setup');
    setPriority('Low');
    setSessionId('');
    setParticipantCode('');
    setDeviceId('');
    setWardBedId('');
    setIssueTime(new Date().toISOString().substring(0, 16));
    setDescription('');
    setScreenshot('');
    setImpact('Minimal');
    setEditingTicketId(null);
  };

  // Grouping/filter metrics
  const totalCount = tickets.length;
  const openCount = tickets.filter(t => t.status === 'Open').length;
  const inProgressCount = tickets.filter(t => t.status === 'In Progress').length;
  const resolvedCount = tickets.filter(t => t.status === 'Resolved').length;

  const filteredTickets = tickets
    .filter(t => t.status === activeTab)
    .filter(t => {
      if (categoryFilter === 'All') return true;
      return t.ticketType === categoryFilter;
    });

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-8 pb-16 space-y-8">
        
        {/* Breadcrumb back to Support */}
        <div>
          <Link to="/support" className="inline-flex items-center text-xs font-bold text-[#007b90] hover:text-[#0097b2] transition-colors">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Support Center
          </Link>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Your Support Tickets</h1>
            <p className="text-sm text-gray-500 font-medium">Create, edit, and track status of technical tickets logged for your pilot ward.</p>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => {
                resetForm();
                setShowCreateForm(!showCreateForm);
              }}
              className="px-4 py-2.5 bg-[#007b90] hover:bg-[#006a7c] text-white text-xs font-bold rounded-lg transition-colors flex items-center shadow-sm cursor-pointer"
            >
              {showCreateForm ? <X className="w-4 h-4 mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
              {showCreateForm ? 'Hide Form' : 'Create New Ticket'}
            </button>
            <button 
              onClick={fetchTickets}
              className="bg-white border border-gray-200 hover:bg-gray-50 p-2.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center cursor-pointer"
              title="Refresh Queue"
            >
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* ── CREATE / EDIT FORM PANEL ─────────────────────────────── */}
        {showCreateForm && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md animate-in slide-in-from-top-4 duration-200">
            <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center">
              <Ticket className="w-4 h-4 mr-1.5 text-[#007b90]" />
              {editingTicketId ? 'Edit Ticket Details' : 'Create Support Ticket'}
            </h3>
            
            <form onSubmit={handleCreateOrUpdateTicket} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Category */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Issue Category *</label>
                  <select 
                    value={ticketType} 
                    onChange={e => setTicketType(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-900 outline-none"
                  >
                    <option value="Device Setup">Device Setup</option>
                    <option value="Participant/Session Setup">Participant/Session Setup</option>
                    <option value="Signal Quality Issue">Signal Quality Issue</option>
                    <option value="Dashboard Bug">Dashboard Bug</option>
                    <option value="Report Export Error">Report Export Error</option>
                    <option value="General Feedback">General Feedback</option>
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Priority *</label>
                  <select 
                    value={priority} 
                    onChange={e => setPriority(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-900 outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>

                {/* Session ID */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Session ID (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. SESS-8809" 
                    value={sessionId} 
                    onChange={e => setSessionId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-900 outline-none"
                  />
                </div>

                {/* Participant Code */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Participant Code (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. P-803" 
                    value={participantCode} 
                    onChange={e => setParticipantCode(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-900 outline-none"
                  />
                </div>

                {/* Device ID */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Device ID (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. DEV-4409" 
                    value={deviceId} 
                    onChange={e => setDeviceId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-900 outline-none"
                  />
                </div>

                {/* Ward/Bed ID */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Ward / Bed ID (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Ward 3B, Bed 12" 
                    value={wardBedId} 
                    onChange={e => setWardBedId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-900 outline-none"
                  />
                </div>

                {/* Issue Time */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Issue Occurrence Time *</label>
                  <input 
                    type="datetime-local" 
                    value={issueTime} 
                    onChange={e => setIssueTime(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-900 outline-none"
                  />
                </div>

                {/* Impact */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Operational Impact *</label>
                  <select 
                    value={impact} 
                    onChange={e => setImpact(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-900 outline-none"
                  >
                    <option value="Minimal">Minimal (single bed / workaround available)</option>
                    <option value="Moderate">Moderate (affects whole ward bed mapping)</option>
                    <option value="Major">Major (blocks telemetry data/reports)</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Detailed Description of Issue *</label>
                <textarea 
                  placeholder="Describe setup details, error logs, or observed bugs..." 
                  value={description} 
                  onChange={e => setDescription(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-900 placeholder-gray-400 focus:outline-none min-h-[100px] resize-y"
                  required
                />
              </div>

              {/* Screenshot mock input */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Attach Screenshot Path / Notes (Optional)</label>
                <input 
                  type="text" 
                  placeholder="e.g. /uploads/error_chart.png or mock image description" 
                  value={screenshot} 
                  onChange={e => setScreenshot(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-900 outline-none"
                />
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingTicketId(null);
                    resetForm();
                  }}
                  className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#007b90] hover:bg-[#006a7c] text-white text-xs font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center cursor-pointer"
                >
                  {isSubmitting ? 'Submitting...' : (editingTicketId ? 'Save Changes' : 'Submit Ticket')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── KPI METRICS CARDS ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Tickets</span>
            <div className="text-3xl font-extrabold text-gray-900 mt-1">{totalCount}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Open Tickets</span>
            <div className="text-3xl font-extrabold text-red-600 mt-1">{openCount}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">In Progress</span>
            <div className="text-3xl font-extrabold text-blue-600 mt-1">{inProgressCount}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Resolved</span>
            <div className="text-3xl font-extrabold text-green-600 mt-1">{resolvedCount}</div>
          </div>
        </div>

        {/* ── TICKET FILTERS & TABS ─────────────────────────────────── */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-b border-gray-200 pb-3">
          {/* Status Tabs */}
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('Open')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeTab === 'Open' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Open ({openCount})
            </button>
            <button
              onClick={() => setActiveTab('In Progress')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeTab === 'In Progress' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              In Progress ({inProgressCount})
            </button>
            <button
              onClick={() => setActiveTab('Resolved')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeTab === 'Resolved' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Resolved ({resolvedCount})
            </button>
          </div>

          {/* Category Dropdown Filter */}
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-gray-500">Category:</span>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-800 outline-none"
            >
              <option value="All">All Categories</option>
              <option value="Device Setup">Device Setup</option>
              <option value="Participant/Session Setup">Participant/Session Setup</option>
              <option value="Signal Quality Issue">Signal Quality Issue</option>
              <option value="Dashboard Bug">Dashboard Bug</option>
              <option value="Report Export Error">Report Export Error</option>
              <option value="General Feedback">General Feedback</option>
            </select>
          </div>
        </div>

        {/* ── TICKETS LIST ─────────────────────────────────────────── */}
        <div className="space-y-6">
          {loading ? (
            <div className="text-center py-12 bg-white border border-gray-200 rounded-xl text-xs text-gray-400 shadow-sm">Loading tickets...</div>
          ) : filteredTickets.length === 0 ? (
            <div className="text-center py-12 bg-white border border-gray-200 rounded-xl text-xs text-gray-400 shadow-sm">No tickets found in status: "{activeTab}" for selected category.</div>
          ) : (
            filteredTickets.map((t) => {
              const isUnassigned = !t.assignedPerson || t.assignedPerson === 'Unassigned';
              const isEditableOrDeletable = t.status === 'Open' && isUnassigned;

              return (
                <div key={t._id} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm relative space-y-4 hover:shadow-md transition-shadow">
                  {/* Card Title Header */}
                  <div className="flex flex-col md:flex-row justify-between items-start gap-4 pb-4 border-b border-gray-100">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
                        <span className="font-bold text-gray-900 text-sm">{t.ticketType}</span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                          t.priority === 'High' ? 'bg-red-50 text-red-700 border-red-200' :
                          t.priority === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-green-50 text-green-700 border-green-200'
                        }`}>
                          {t.priority} Priority
                        </span>
                        <span className="text-[10px] font-bold text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded">
                          Impact: {t.impact}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-400 font-medium">
                        Submitted: {new Date(t.createdAt).toLocaleString()} 
                        {t.resolvedAt && <span className="text-green-600 font-bold ml-2">Resolved: {new Date(t.resolvedAt).toLocaleString()}</span>}
                      </div>
                    </div>

                    {/* Edit/Delete Actions (Only before assignment and when Open) */}
                    <div className="flex items-center space-x-2">
                      {isEditableOrDeletable ? (
                        <>
                          <button
                            onClick={() => handleStartEdit(t)}
                            className="flex items-center gap-1.5 text-xs font-bold text-[#007b90] bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg border border-teal-100 cursor-pointer transition-colors"
                            title="Edit Ticket Details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteTicket(t._id)}
                            className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-100 cursor-pointer transition-colors"
                            title="Delete Ticket"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </>
                      ) : (
                        <div className="text-[10px] font-bold text-gray-400 flex items-center bg-gray-50 px-2.5 py-1 rounded border border-gray-200">
                          <AlertTriangle className="w-3.5 h-3.5 text-gray-400 mr-1 shrink-0" />
                          Locked (Assigned)
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metadata Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100 text-xs">
                    <div>
                      <span className="text-gray-400 font-bold block mb-0.5">Session ID</span>
                      <span className="font-semibold text-gray-800">{t.sessionId || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 font-bold block mb-0.5">Participant Code</span>
                      <span className="font-semibold text-gray-800">{t.participantCode || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 font-bold block mb-0.5">Device ID</span>
                      <span className="font-semibold text-gray-800">{t.deviceId || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 font-bold block mb-0.5">Ward / Bed ID</span>
                      <span className="font-semibold text-gray-800">{t.wardBedId || 'N/A'}</span>
                    </div>
                  </div>

                  {/* Issue description & Assignee / resolution */}
                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Description:</span>
                      <p className="text-gray-700 bg-gray-50/50 p-3 rounded-lg border border-gray-100 leading-relaxed font-medium whitespace-pre-wrap">{t.description}</p>
                    </div>

                    <div className="flex items-center space-x-2 text-xs">
                      <span className="text-gray-400 font-bold">Assigned Staff/Developer:</span>
                      <span className="font-semibold text-gray-800">{t.assignedPerson || 'Unassigned'}</span>
                    </div>

                    {t.resolutionNote && (
                      <div className="bg-green-50/30 text-green-800 p-3 rounded-lg border border-green-100">
                        <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider block mb-1">Resolution Summary Note:</span>
                        <p className="leading-relaxed font-bold italic">"{t.resolutionNote}"</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
