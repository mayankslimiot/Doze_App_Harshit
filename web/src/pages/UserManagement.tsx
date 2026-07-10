import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  ChevronRight, 
  UserPlus, 
  Users, 
  ShieldCheck, 
  Trash2, 
  Loader2, 
  X,
  Phone,
  Mail,
  UserCheck
} from 'lucide-react';
import { apiUrl } from '@/services/api';

interface OrgViewer {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  userId?: string;
}

export default function UserManagement() {
  const [viewers, setViewers] = useState<OrgViewer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Add Viewer Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState('');

  const fetchViewers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/manage/users/viewers'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.status === 'success') {
        setViewers(data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch viewers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchViewers();
  }, []);

  const handleAddViewer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    
    if (!name.trim() || !email.trim()) {
      setFormError('Name and Email are required.');
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined
      };

      const res = await fetch(apiUrl('/api/manage/users/viewers'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      
      if (res.ok && data.status === 'success') {
        setShowAddModal(false);
        // Reset form
        setName('');
        setEmail('');
        setPhone('');
        fetchViewers();
      } else {
        setFormError(data.message || 'Failed to invite viewer');
      }
    } catch (error) {
      console.error('Error inviting viewer:', error);
      setFormError('Server error inviting viewer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteViewer = async (viewerUserId: string | undefined, viewerName: string) => {
    if (!viewerUserId) return;
    if (confirm(`Are you sure you want to revoke access and delete viewer account for "${viewerName}"?`)) {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(apiUrl(`/api/manage/users/viewers/${viewerUserId}`), {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
          fetchViewers();
        } else {
          alert(data.message || 'Failed to delete viewer');
        }
      } catch (error) {
        console.error('Delete viewer error:', error);
        alert('Server error deleting viewer');
      }
    }
  };

  const filteredViewers = viewers.filter(viewer => 
    (viewer.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (viewer.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-8 animate-in fade-in duration-300">
        
        {/* Top Breadcrumb */}
        <div className="flex items-center text-xs font-bold text-gray-500 mb-6">
          <Link to="/settings" className="hover:text-gray-900 transition-colors">Settings</Link>
          <ChevronRight className="w-3 h-3 mx-2" />
          <span className="text-gray-900">User Management</span>
        </div>

        {/* Header Section */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Viewer Accounts</h1>
            <p className="text-sm text-gray-500">
              Manage accounts authorized only to view live laboratory graphs and trends.
            </p>
          </div>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center bg-[#007b90] hover:bg-[#006a7c] text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm animate-pulse"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Invite New Viewer
          </button>
        </div>

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Total Viewers */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center text-[#007b90] mb-2 uppercase tracking-widest text-[10px] font-bold">
              <Users className="w-4 h-4 mr-2" />
              Total Active Viewers
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {loading ? <Loader2 className="w-6 h-6 animate-spin text-gray-400" /> : viewers.length}
            </div>
          </div>

          {/* Access Control Status */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center text-green-600 mb-2 uppercase tracking-widest text-[10px] font-bold">
              <ShieldCheck className="w-4 h-4 mr-2" />
              Access Level
            </div>
            <div className="text-sm font-bold text-gray-700 mt-2">
              Viewer Mode: Read-Only Graph Streaming
            </div>
          </div>
        </div>

        {/* System Directory Table Area */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-8 overflow-hidden">
          
          {/* Table Header Controls */}
          <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50/50">
            <h2 className="text-lg font-bold text-gray-900">Organization Viewers</h2>
            <div className="flex gap-3 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search viewers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full sm:w-64 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-gray-50">
                  <th className="py-4 px-6 font-bold">Viewer Details</th>
                  <th className="py-4 px-6 font-bold">Email</th>
                  <th className="py-4 px-6 font-bold">Phone</th>
                  <th className="py-4 px-6 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-gray-500">
                      <div className="flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-[#007b90] mr-2" />
                        Loading viewers list...
                      </div>
                    </td>
                  </tr>
                ) : filteredViewers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-gray-500 italic">
                      No viewer accounts configured. Click "Invite New Viewer" to add.
                    </td>
                  </tr>
                ) : (
                  filteredViewers.map((viewer) => {
                    const initials = (viewer.name || 'V').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                    return (
                      <tr key={viewer._id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="py-4 px-6">
                          <div className="flex items-center">
                            <div className="w-10 h-10 rounded-full bg-teal-50 text-[#007b90] flex items-center justify-center font-bold text-sm shrink-0 border border-teal-100">
                              {initials}
                            </div>
                            <div className="ml-4 font-sans">
                              <div className="font-bold text-gray-900 group-hover:text-[#007b90] transition-colors">{viewer.name}</div>
                              <div className="text-[10px] bg-[#eaf4f6] text-[#007b90] font-bold px-1.5 py-0.5 rounded inline-block mt-1">Read-Only Viewer</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-gray-600 font-mono text-xs">
                          <span className="flex items-center"><Mail className="w-3 h-3 text-gray-400 mr-1.5" /> {viewer.email}</span>
                        </td>
                        <td className="py-4 px-6 text-gray-600 font-mono text-xs">
                          {viewer.phone ? (
                            <span className="flex items-center"><Phone className="w-3 h-3 text-gray-400 mr-1.5" /> {viewer.phone}</span>
                          ) : (
                            <span className="text-gray-400 italic">Not provided</span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button 
                            onClick={() => handleDeleteViewer(viewer.userId, viewer.name)}
                            title="Revoke Viewer Access"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors inline-flex"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 font-mono">
            <div>Showing {filteredViewers.length} of {viewers.length} Viewers</div>
          </div>
        </div>

        {/* Add Viewer Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-lg font-bold text-gray-900">Invite Live Viewer</h3>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleAddViewer}>
                <div className="p-6 space-y-4">
                  {formError && (
                    <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-lg text-xs font-semibold">
                      {formError}
                    </div>
                  )}

                  {/* Name */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Viewer Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. john.doe@slimiot.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Phone Number (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                    />
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center px-5 py-2 bg-[#007b90] hover:bg-[#006a7c] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Inviting...
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-4 h-4 mr-2" />
                        Send Invitation
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
