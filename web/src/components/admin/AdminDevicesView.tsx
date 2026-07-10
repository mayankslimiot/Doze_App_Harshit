import { useState, useEffect } from 'react';
import { MonitorSmartphone, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiUrl } from '@/services/api';

let cachedDevices: any[] | null = null;

export default function AdminDevicesView() {
  const [devices, setDevices] = useState<any[]>(cachedDevices || []);
  const [loading, setLoading] = useState(!cachedDevices);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');

  const fetchDevices = async (force = false) => {
    if (!force && cachedDevices) {
      setDevices(cachedDevices);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/superadmin/devices'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.status === 'success') {
        cachedDevices = data.data;
        setDevices(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch devices:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleRefresh = () => {
    fetchDevices(true);
  };

  const handleRemove = async (deviceId: string) => {
    if (confirm(`Are you sure you want to remove device ${deviceId}?`)) {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(apiUrl(`/api/devices/dashboard-remove/${encodeURIComponent(deviceId)}`), {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (res.ok) {
          fetchDevices(true);
        } else {
          alert('Failed to remove device');
        }
      } catch (e) {
        console.error("Remove device error:", e);
        alert('Error removing device');
      }
    }
  };

  const isOnline = (d: any) => !['offline', 'Offline'].includes(d.status || '');

  const filteredDevices = devices.filter(device => {
    const online = isOnline(device);
    if (statusFilter === 'online' && !online) return false;
    if (statusFilter === 'offline' && online) return false;

    return (
      (device.deviceName || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (device.deviceId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (device.organizationName || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Device Management</h2>
          <p className="text-sm text-gray-500">Oversee all devices across all organizations.</p>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          onClick={() => setStatusFilter('all')}
          className={`bg-white rounded-xl border p-6 shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md ${
            statusFilter === 'all' 
              ? 'border-[#007b90] ring-2 ring-[#007b90]/10 bg-[#eaf4f6]/5' 
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Devices</h3>
            <MonitorSmartphone className="w-5 h-5 text-[#007b90]" />
          </div>
          <div className="text-4xl font-bold text-[#007b90] mb-2">{devices.length}</div>
        </div>

        <div 
          onClick={() => setStatusFilter('online')}
          className={`bg-white rounded-xl border p-6 shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md ${
            statusFilter === 'online' 
              ? 'border-green-500 ring-2 ring-green-500/10 bg-green-50/5' 
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Online Devices</h3>
            <MonitorSmartphone className="w-5 h-5 text-green-500" />
          </div>
          <div className="text-4xl font-bold text-green-500 mb-2">
            {devices.filter(d => ['active', 'online'].includes((d.status || '').toLowerCase())).length}
          </div>
        </div>

        <div 
          onClick={() => setStatusFilter('offline')}
          className={`bg-white rounded-xl border p-6 shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md ${
            statusFilter === 'offline' 
              ? 'border-red-500 ring-2 ring-red-500/10 bg-red-50/5' 
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Offline Devices</h3>
            <MonitorSmartphone className="w-5 h-5 text-red-500" />
          </div>
          <div className="text-4xl font-bold text-red-500 mb-2">
            {devices.filter(d => !['active', 'online'].includes((d.status || '').toLowerCase())).length}
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
            placeholder="Search by Device Name or ID..."
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
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Organization Name</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest w-1/3 min-w-[200px]">Device ID & Name</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Status</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Last Sync</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    Loading devices...
                  </td>
                </tr>
              ) : filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    No devices found.
                  </td>
                </tr>
              ) : (
                filteredDevices.map((device) => (
                  <tr key={device.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="py-5 px-6">
                      <div className="font-bold text-gray-900 text-sm">{device.organizationName}</div>
                    </td>
                    <td className="py-5 px-6 max-w-[250px]">
                      <Link to={`/live/${device.deviceId}`} className="group hover:underline block">
                        <div className="font-bold text-[#007b90] group-hover:text-[#00687a] text-sm truncate" title={device.deviceName}>{device.deviceName}</div>
                        <div className="text-xs text-gray-500 font-mono mt-0.5 truncate" title={device.deviceId}>{device.deviceId}</div>
                      </Link>
                    </td>
                    <td className="py-5 px-6 text-center">
                      <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${
                        device.status === 'Offline' || device.status === 'offline'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {device.status}
                      </span>
                    </td>
                    <td className="py-5 px-6 font-mono text-xs text-gray-500">
                      {device.lastSync ? new Date(device.lastSync).toLocaleString() : 'N/A'}
                    </td>
                    <td className="py-5 px-6 text-right">
                      <button 
                        onClick={() => handleRemove(device.deviceId)}
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
          <div>Showing 1-{filteredDevices.length} of {filteredDevices.length} Devices</div>
          <div className="flex space-x-2">
            <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors" disabled>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 flex items-center justify-center bg-[#004f5e] text-white rounded font-bold shadow-sm">
              1
            </button>
            <button className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors" disabled>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
