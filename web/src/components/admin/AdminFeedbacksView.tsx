import { useState, useEffect } from 'react';
import { MessageSquare, Search, Trash2, Check, Star, Building2, ShieldAlert, AlertTriangle, Clock, Ticket, CheckCircle2, UserCheck, Wrench, RefreshCw } from 'lucide-react';
import { apiUrl } from '@/services/api';

export default function AdminFeedbacksView() {
  // Tabs State
  const [activeTab, setActiveTab] = useState<'feedback' | 'tickets'>('feedback');

  // Feedbacks state
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [feedbacksLoading, setFeedbacksLoading] = useState(true);
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [feedbackFilter, setFeedbackFilter] = useState<'all' | 'unread' | 'read'>('all');

  // Tickets state
  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<'All' | 'Open' | 'In Progress' | 'Resolved'>('All');

  // Edit ticket state
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState('Open');
  const [editAssignee, setEditAssignee] = useState('');
  const [editNote, setEditNote] = useState('');
  const [isUpdatingTicket, setIsUpdatingTicket] = useState(false);

  const fetchFeedbacks = async () => {
    setFeedbacksLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/feedbacks'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setFeedbacks(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch feedbacks:", error);
    } finally {
      setFeedbacksLoading(false);
    }
  };

  const fetchTickets = async () => {
    setTicketsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/tickets'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setTickets(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch tickets:", error);
    } finally {
      setTicketsLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
    fetchTickets();
  }, []);

  const handleMarkFeedbackAsRead = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/feedbacks/${id}/read`), {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setFeedbacks(prev => prev.map(f => f._id === id ? { ...f, isRead: true } : f));
      }
    } catch (e) {
      console.error("Mark as read error:", e);
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    if (!confirm("Are you sure you want to delete this feedback?")) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/feedbacks/${id}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setFeedbacks(prev => prev.filter(f => f._id !== id));
      } else {
        alert("Failed to delete feedback");
      }
    } catch (e) {
      console.error("Delete feedback error:", e);
    }
  };

  const handleDeleteTicket = async (id: string) => {
    if (!confirm("Are you sure you want to delete this ticket?")) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/tickets/${id}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setTickets(prev => prev.filter(t => t._id !== id));
      } else {
        alert("Failed to delete ticket");
      }
    } catch (e) {
      console.error("Delete ticket error:", e);
    }
  };

  const handleStartEditTicket = (t: any) => {
    setEditingTicketId(t._id);
    setEditStatus(t.status || 'Open');
    setEditAssignee(t.assignedPerson || '');
    setEditNote(t.resolutionNote || '');
  };

  const handleSaveTicketUpdates = async (id: string) => {
    setIsUpdatingTicket(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/tickets/${id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status: editStatus,
          assignedPerson: editAssignee,
          resolutionNote: editNote
        })
      });
      const data = await res.json();
      if (data.success) {
        setTickets(prev => prev.map(t => t._id === id ? { ...t, ...data.data } : t));
        setEditingTicketId(null);
      } else {
        alert("Failed to update ticket: " + (data.message || 'Unknown error'));
      }
    } catch (err) {
      console.error("Update ticket error:", err);
      alert("Error updating ticket.");
    } finally {
      setIsUpdatingTicket(false);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex space-x-0.5">
        {[1, 2, 3, 4, 5].map((num) => (
          <Star 
            key={num} 
            className={`w-3 h-3 ${num <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} 
          />
        ))}
      </div>
    );
  };

  // --- Feedback Calculations ---
  const fbTotal = feedbacks.length;
  const fbUnread = feedbacks.filter(f => !f.isRead).length;
  const fbHigh = feedbacks.filter(f => f.severity === 'High').length;
  const fbMedium = feedbacks.filter(f => f.severity === 'Medium').length;

  const filteredFeedbacks = feedbacks
    .filter(f => {
      if (feedbackFilter === 'unread') return !f.isRead;
      if (feedbackFilter === 'read') return f.isRead;
      return true;
    })
    .filter(f => {
      const q = feedbackSearch.toLowerCase();
      return (
        (f.subject || '').toLowerCase().includes(q) ||
        (f.nameOfSubmitter || '').toLowerCase().includes(q) ||
        (f.problemDetails || '').toLowerCase().includes(q) ||
        (f.organizationId?.name || '').toLowerCase().includes(q) ||
        (f.submittedBy?.name || '').toLowerCase().includes(q)
      );
    });

  // --- Support Tickets Operations Report Calculations ---
  const tTotal = tickets.length;
  const tOpen = tickets.filter(t => t.status === 'Open').length;
  const tInProgress = tickets.filter(t => t.status === 'In Progress').length;
  const tResolved = tickets.filter(t => t.status === 'Resolved').length;
  const tUnresolved = tOpen + tInProgress;

  // Calculate Average Resolution Time in hours
  let avgResolutionTimeHours = 0;
  const resolvedTickets = tickets.filter(t => t.status === 'Resolved' && t.resolvedAt);
  if (resolvedTickets.length > 0) {
    const totalMs = resolvedTickets.reduce((sum, t) => {
      const start = new Date(t.createdAt).getTime();
      const end = new Date(t.resolvedAt).getTime();
      return sum + Math.max(0, end - start);
    }, 0);
    avgResolutionTimeHours = Number(((totalMs / (1000 * 60 * 60)) / resolvedTickets.length).toFixed(1));
  }

  // Filtered tickets
  const filteredTickets = tickets
    .filter(t => {
      if (ticketStatusFilter === 'All') return true;
      return t.status === ticketStatusFilter;
    })
    .filter(t => {
      const q = ticketSearch.toLowerCase();
      return (
        (t.ticketType || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.deviceId || '').toLowerCase().includes(q) ||
        (t.wardBedId || '').toLowerCase().includes(q) ||
        (t.participantCode || '').toLowerCase().includes(q) ||
        (t.assignedPerson || '').toLowerCase().includes(q) ||
        (t.organizationId?.name || '').toLowerCase().includes(q)
      );
    });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return 'bg-red-50 text-red-700 border-red-200';
      case 'Medium': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-green-50 text-green-700 border-green-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Resolved': return 'bg-green-100 text-green-800 border-green-200';
      case 'In Progress': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-red-100 text-red-800 border-red-200';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex justify-between items-start border-b border-gray-100 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Pilot Operations Desk</h2>
          <p className="text-sm text-gray-500 font-medium">Review and resolve clinical feedbacks and technical support tickets logged by hospital sites.</p>
        </div>
        <div className="flex items-center space-x-3">
          {/* Main Tabs */}
          <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
            <button
              onClick={() => setActiveTab('feedback')}
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'feedback' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Clinical Feedbacks</span>
            </button>
            <button
              onClick={() => setActiveTab('tickets')}
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'tickets' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Ticket className="w-3.5 h-3.5" />
              <span>Support Tickets</span>
            </button>
          </div>
          <button 
            onClick={() => { fetchFeedbacks(); fetchTickets(); }}
            className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 p-2.5 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center justify-center cursor-pointer"
            title="Refresh All"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* ── Tab: Clinical Feedbacks ────────────────────────────────── */}
      {activeTab === 'feedback' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Feedbacks</h3>
                <MessageSquare className="w-5 h-5 text-[#007b90]" />
              </div>
              <div className="text-4xl font-bold text-[#007b90] mb-2">{fbTotal}</div>
              <div className="text-xs font-medium text-gray-400 font-mono">Feedback submissions</div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Pending Review</h3>
                <ShieldAlert className="w-5 h-5 text-orange-500" />
              </div>
              <div className="text-4xl font-bold text-orange-500 mb-2">{fbUnread}</div>
              <div className="text-xs font-medium text-orange-600 font-mono">Unread comments</div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">High Severity</h3>
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div className="text-4xl font-bold text-red-600 mb-2">{fbHigh}</div>
              <div className="text-xs font-medium text-red-500 font-mono">Action required</div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Medium Severity</h3>
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              <div className="text-4xl font-bold text-amber-600 mb-2">{fbMedium}</div>
              <div className="text-xs font-medium text-amber-600 font-mono">Under review</div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button onClick={() => setFeedbackFilter('all')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${feedbackFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>All Feedbacks</button>
              <button onClick={() => setFeedbackFilter('unread')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${feedbackFilter === 'unread' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
                Unread
                {fbUnread > 0 && <span className="bg-orange-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">{fbUnread}</span>}
              </button>
              <button onClick={() => setFeedbackFilter('read')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${feedbackFilter === 'read' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>Reviewed</button>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search feedbacks..." value={feedbackSearch} onChange={(e) => setFeedbackSearch(e.target.value)} className="block w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#007b90]" />
            </div>
          </div>

          {/* Feedbacks Cards List */}
          <div className="space-y-6">
            {feedbacksLoading ? (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-xs text-gray-500 shadow-sm">Loading feedbacks...</div>
            ) : filteredFeedbacks.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-xs text-gray-500 shadow-sm">No feedbacks found.</div>
            ) : (
              filteredFeedbacks.map((f) => (
                <div key={f._id} className={`bg-white border rounded-xl p-6 shadow-sm relative ${!f.isRead ? 'border-teal-400 ring-2 ring-teal-50/50' : 'border-gray-200'}`}>
                  
                  {/* Submitter and Org Info Header */}
                  <div className="flex flex-col md:flex-row justify-between items-start gap-4 pb-4 border-b border-gray-100">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
                        <span className="font-bold text-gray-900 text-sm">{f.subject || `Session: ${f.sessionCode}`}</span>
                        {f.severity && <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getPriorityColor(f.severity)}`}>{f.severity}</span>}
                        <span className="text-gray-400 text-xs font-semibold flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                          <Building2 className="w-3.5 h-3.5 text-gray-400" />
                          {f.organizationId?.name || 'Local User'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-[11px] text-gray-400">
                        <span>{new Date(f.createdAt).toLocaleString()}</span>
                        <span>By: {f.nameOfSubmitter || f.submittedBy?.name || 'N/A'} ({f.submittedBy?.email || 'N/A'})</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {!f.isRead && (
                        <button onClick={() => handleMarkFeedbackAsRead(f._id)} className="flex items-center gap-1 text-xs font-bold text-teal-600 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg border border-teal-100 cursor-pointer">
                          <Check className="w-3.5 h-3.5" /> Mark Reviewed
                        </button>
                      )}
                      <button onClick={() => handleDeleteFeedback(f._id)} className="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors cursor-pointer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Body details */}
                  <div className="pt-4">
                    {f.subject ? (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Description:</span>
                        <p className="text-xs text-gray-700 font-medium leading-relaxed whitespace-pre-wrap">{f.problemDetails || 'No details provided.'}</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">Technician Checklist</h4>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between"><span>Ease of Setup</span>{renderStars(f.technicianFeedback?.setupEase)}</div>
                            <div className="flex justify-between"><span>Placement Clarity</span>{renderStars(f.technicianFeedback?.placementClarity)}</div>
                            <div className="flex justify-between"><span>Usability</span>{renderStars(f.technicianFeedback?.usability)}</div>
                            <div className="flex justify-between"><span>Signal Issues?</span><span className={`font-bold ${f.technicianFeedback?.signalIssues ? 'text-red-500' : 'text-green-600'}`}>{f.technicianFeedback?.signalIssues ? 'Yes' : 'No'}</span></div>
                          </div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">Doctor Checklist</h4>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between"><span>Clinical Utility</span>{renderStars(f.doctorFeedback?.clinicalUtility)}</div>
                            <div className="flex justify-between"><span>Report Clarity</span>{renderStars(f.doctorFeedback?.reportClarity)}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Support Tickets (Operations Report Feed) ───────────── */}
      {activeTab === 'tickets' && (
        <div className="space-y-6">
          {/* Operations Report KPI Panel */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Tickets</h3>
                <Ticket className="w-5 h-5 text-[#007b90]" />
              </div>
              <div className="text-4xl font-bold text-[#007b90] mb-2">{tTotal}</div>
              <div className="text-xs font-medium text-gray-400 font-mono">Logged across pilot</div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Active Unresolved</h3>
                <Wrench className="w-5 h-5 text-red-500" />
              </div>
              <div className="text-4xl font-bold text-red-600 mb-2">{tUnresolved}</div>
              <div className="text-xs font-medium text-red-500 font-mono">Pending resolution</div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Tickets Resolved</h3>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <div className="text-4xl font-bold text-green-600 mb-2">{tResolved}</div>
              <div className="text-xs font-medium text-green-600 font-mono">Resolved status count</div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Avg Resolution Time</h3>
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <div className="text-4xl font-bold text-blue-600 mb-2">{avgResolutionTimeHours} hr</div>
              <div className="text-xs font-medium text-blue-500 font-mono">Hours to resolve tickets</div>
            </div>
          </div>

          {/* Filter and Search */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button onClick={() => setTicketStatusFilter('All')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${ticketStatusFilter === 'All' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>All Statuses</button>
              <button onClick={() => setTicketStatusFilter('Open')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${ticketStatusFilter === 'Open' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>Open ({tOpen})</button>
              <button onClick={() => setTicketStatusFilter('In Progress')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${ticketStatusFilter === 'In Progress' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>In Progress ({tInProgress})</button>
              <button onClick={() => setTicketStatusFilter('Resolved')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${ticketStatusFilter === 'Resolved' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>Resolved ({tResolved})</button>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search by Device, Ward, Participant, Assignee..." value={ticketSearch} onChange={(e) => setTicketSearch(e.target.value)} className="block w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#007b90]" />
            </div>
          </div>

          {/* Tickets Cards List */}
          <div className="space-y-6">
            {ticketsLoading ? (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-xs text-gray-500 shadow-sm">Loading tickets...</div>
            ) : filteredTickets.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-xs text-gray-500 shadow-sm">No tickets found.</div>
            ) : (
              filteredTickets.map((t) => (
                <div key={t._id} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm relative space-y-4">
                  
                  {/* Ticket Header Details */}
                  <div className="flex flex-col md:flex-row justify-between items-start gap-4 pb-4 border-b border-gray-100">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
                        <span className="font-bold text-gray-900 text-sm">{t.ticketType}</span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getPriorityColor(t.priority)}`}>{t.priority} Priority</span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getStatusColor(t.status)}`}>{t.status}</span>
                        <span className="text-gray-400 text-xs font-semibold flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                          <Building2 className="w-3.5 h-3.5 text-gray-400" />
                          {t.organizationId?.name || 'Local Pilot'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-[10px] text-gray-400 flex-wrap gap-y-1">
                        <span>Created: {new Date(t.createdAt).toLocaleString()}</span>
                        <span>Reporter: {t.submittedBy?.name || 'N/A'} ({t.submittedBy?.email || 'N/A'})</span>
                        {t.resolvedAt && <span className="text-green-600 font-bold">Resolved: {new Date(t.resolvedAt).toLocaleString()}</span>}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button onClick={() => handleStartEditTicket(t)} className="flex items-center gap-1 text-xs font-bold text-[#007b90] bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg border border-teal-100 cursor-pointer">
                        <UserCheck className="w-3.5 h-3.5" />
                        Manage Ticket
                      </button>
                      <button onClick={() => handleDeleteTicket(t._id)} className="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors cursor-pointer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Metadata and Details Row */}
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
                    <div>
                      <span className="text-gray-400 font-bold block mb-0.5">Occurrence Time</span>
                      <span className="font-semibold text-gray-800">{t.issueTime ? new Date(t.issueTime).toLocaleString() : 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 font-bold block mb-0.5">Operational Impact</span>
                      <span className="font-semibold text-gray-800">{t.impact || 'Minimal'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 font-bold block mb-0.5">Assigned Developer</span>
                      <span className="font-semibold text-gray-800">{t.assignedPerson || 'Unassigned'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 font-bold block mb-0.5">Screenshot / Attachment</span>
                      {t.screenshot ? (
                        <span className="font-semibold text-[#007b90] underline cursor-pointer">{t.screenshot.slice(-25)}</span>
                      ) : (
                        <span className="text-gray-400">None</span>
                      )}
                    </div>
                  </div>

                  {/* Problem Description & Resolution Note */}
                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Issue Description:</span>
                      <p className="text-gray-700 bg-gray-50/50 p-3 rounded-lg border border-gray-100 leading-relaxed font-medium">{t.description}</p>
                    </div>

                    {t.resolutionNote && (
                      <div>
                        <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider block mb-1">Resolution Summary Note:</span>
                        <p className="text-green-800 bg-green-50/30 p-3 rounded-lg border border-green-100 leading-relaxed font-bold italic">
                          "{t.resolutionNote}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Modal / Quick edit popover inline */}
                  {editingTicketId === t._id && (
                    <div className="bg-teal-50/30 border border-teal-100 rounded-xl p-5 space-y-4 pt-4 mt-2">
                      <div className="flex items-center space-x-2 border-b border-teal-100 pb-2 mb-2">
                        <Wrench className="w-4 h-4 text-[#007b90]" />
                        <span className="text-xs font-bold text-gray-800">Assign & Resolve Ticket Operations</span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Status dropdown */}
                        <div>
                          <label className="block text-[10px] font-bold text-gray-600 mb-1">Status</label>
                          <select 
                            value={editStatus} 
                            onChange={e => setEditStatus(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs text-gray-800 outline-none"
                          >
                            <option value="Open">Open</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Resolved">Resolved</option>
                          </select>
                        </div>

                        {/* Assignee */}
                        <div>
                          <label className="block text-[10px] font-bold text-gray-600 mb-1">Assign Developer/Staff</label>
                          <input 
                            type="text" 
                            placeholder="e.g. Developer Harshit" 
                            value={editAssignee}
                            onChange={e => setEditAssignee(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs text-gray-800 outline-none"
                          />
                        </div>

                        {/* Resolution note */}
                        <div className="md:col-span-3">
                          <label className="block text-[10px] font-bold text-gray-600 mb-1">Resolution Summary / Action Taken</label>
                          <textarea 
                            placeholder="Write ticket resolution details..." 
                            value={editNote}
                            onChange={e => setEditNote(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs text-gray-800 min-h-[60px] resize-y outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end space-x-2 pt-2">
                        <button 
                          onClick={() => setEditingTicketId(null)}
                          className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={() => handleSaveTicketUpdates(t._id)}
                          disabled={isUpdatingTicket}
                          className="px-4 py-1.5 bg-[#007b90] text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-[#006a7c] disabled:opacity-50"
                        >
                          {isUpdatingTicket ? 'Updating...' : 'Save Updates'}
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              ))
            )}
          </div>
        </div>
      )}

    </div>
  );
}
