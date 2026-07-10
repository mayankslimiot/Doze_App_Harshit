import { useState, useEffect } from 'react';
import { Users, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiUrl } from '@/services/api';

let cachedUsers: any[] | null = null;

export default function AdminAppUsersView() {
  const [users, setUsers] = useState<any[]>(cachedUsers || []);
  const [loading, setLoading] = useState(!cachedUsers);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'verified' | 'unverified'>('all');
  const itemsPerPage = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter]);

  const fetchUsers = async (force = false) => {
    if (!force && cachedUsers) {
      setUsers(cachedUsers);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/superadmin/users'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.status === 'success') {
        cachedUsers = data.data;
        setUsers(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRefresh = () => {
    fetchUsers(true);
  };

  const handleRemove = async (userId: string, userName: string) => {
    if (confirm(`Are you sure you want to delete user ${userName}? This action cannot be undone.`)) {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(apiUrl(`/api/superadmin/users/${userId}`), {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (res.ok) {
          fetchUsers(true);
        } else {
          alert('Failed to remove user');
        }
      } catch (e) {
        console.error("Remove user error:", e);
        alert('Error removing user');
      }
    }
  };

  const filteredUsers = users.filter(user => {
    if (roleFilter === 'admin' && user.role !== 'admin') return false;
    if (roleFilter === 'verified' && !user.isVerified) return false;
    if (roleFilter === 'unverified' && user.isVerified) return false;
    return (
      (user.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (user.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.organizationName || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  let startPage = Math.max(1, currentPage - 1);
  let endPage = startPage + 2;

  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, endPage - 2);
  }

  const pageNumbers = [];
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">App Users</h2>
          <p className="text-sm text-gray-500">Manage all sub-admin and personnel accounts.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={handleRefresh}
            className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm flex items-center"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div 
          onClick={() => setRoleFilter('all')}
          className={`bg-white rounded-xl border p-6 shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md ${
            roleFilter === 'all' 
              ? 'border-[#007b90] ring-2 ring-[#007b90]/10 bg-[#eaf4f6]/5' 
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Users</h3>
            <Users className="w-5 h-5 text-[#007b90]" />
          </div>
          <div className="text-4xl font-bold text-[#007b90] mb-2">{users.length}</div>
          <div className="text-xs font-medium text-gray-500 font-mono tracking-wide">
            Across all organizations
          </div>
        </div>

        <div 
          onClick={() => setRoleFilter('admin')}
          className={`bg-white rounded-xl border p-6 shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md ${
            roleFilter === 'admin' 
              ? 'border-blue-500 ring-2 ring-blue-500/10 bg-blue-50/5' 
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Organization Admins</h3>
            <Users className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-4xl font-bold text-blue-500 mb-2">
            {users.filter(u => u.role === 'admin').length}
          </div>
          <div className="text-xs font-medium text-blue-600 font-mono tracking-wide">
            Sub-administrators
          </div>
        </div>

        <div 
          onClick={() => setRoleFilter('verified')}
          className={`bg-white rounded-xl border p-6 shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md ${
            roleFilter === 'verified' 
              ? 'border-green-500 ring-2 ring-green-500/10 bg-green-50/5' 
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Verified Users</h3>
            <Users className="w-5 h-5 text-green-500" />
          </div>
          <div className="text-4xl font-bold text-green-500 mb-2">
            {users.filter(u => u.isVerified).length}
          </div>
          <div className="text-xs font-medium text-green-600 font-mono tracking-wide">
            Email/Phone verified
          </div>
        </div>

        <div 
          onClick={() => setRoleFilter('unverified')}
          className={`bg-white rounded-xl border p-6 shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md ${
            roleFilter === 'unverified' 
              ? 'border-orange-500 ring-2 ring-orange-500/10 bg-orange-50/5' 
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Unverified Users</h3>
            <Users className="w-5 h-5 text-orange-500" />
          </div>
          <div className="text-4xl font-bold text-orange-500 mb-2">
            {users.filter(u => !u.isVerified).length}
          </div>
          <div className="text-xs font-medium text-orange-600 font-mono tracking-wide">
            Pending verification
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search by User Name or Email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-11 pr-3 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest w-1/3 min-w-[200px]">Name & Email</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Role</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Organization</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Status</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Created At</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user) => (
                  <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="py-5 px-6 max-w-[250px]">
                      <div className="font-bold text-gray-900 text-sm truncate" title={user.name}>{user.name}</div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5 truncate" title={user.email}>{user.email}</div>
                    </td>
                    <td className="py-5 px-6">
                      <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${
                        user.role === 'admin' 
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-5 px-6 font-medium text-gray-900 text-sm">
                      {user.organizationName}
                    </td>
                    <td className="py-5 px-6 text-center">
                      <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${
                        user.isVerified
                          ? 'bg-green-100 text-green-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {user.isVerified ? 'Verified' : 'Unverified'}
                      </span>
                    </td>
                    <td className="py-5 px-6 font-mono text-xs text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-5 px-6 text-right">
                      <button 
                        onClick={() => handleRemove(user.id, user.name)}
                        className="text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg transition-colors"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-between items-center text-[10px] font-mono text-gray-500 uppercase tracking-widest">
          <div>Showing {filteredUsers.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredUsers.length)} of {filteredUsers.length} Users</div>
          <div className="flex space-x-2">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1 || filteredUsers.length === 0}
              className="w-8 h-8 flex items-center justify-center text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            {pageNumbers.map(num => (
              <button 
                key={num}
                onClick={() => setCurrentPage(num)}
                className={`w-8 h-8 flex items-center justify-center rounded font-bold shadow-sm transition-colors ${
                  currentPage === num 
                    ? 'bg-[#004f5e] text-white' 
                    : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {num}
              </button>
            ))}

            <button 
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || filteredUsers.length === 0}
              className="w-8 h-8 flex items-center justify-center text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
