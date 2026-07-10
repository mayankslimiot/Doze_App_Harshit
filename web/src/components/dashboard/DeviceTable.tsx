import { useState, useEffect } from 'react';
import { Search, MoreVertical, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { renameDashboardDevice, removeDashboardDevice } from '@/services/deviceService';

interface DeviceTableProps {
  devices?: any[];
  loading?: boolean;
}

export default function DeviceTable({ devices = [], loading = false }: DeviceTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [manageDevice, setManageDevice] = useState<any | null>(null);
  const [deviceToRemove, setDeviceToRemove] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editRoom, setEditRoom] = useState('');
  const [editBed, setEditBed] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);
  const queryClient = useQueryClient();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const confirmRemove = async () => {
    if (deviceToRemove) {
      setIsRemoving(true);
      try {
        await removeDashboardDevice(deviceToRemove.id);
        queryClient.invalidateQueries({ queryKey: ['dashboard_devices'] });
      } catch (error) {
        console.error(error);
        alert('Failed to remove device');
      } finally {
        setIsRemoving(false);
        setDeviceToRemove(null);
      }
    }
  };

  const renameMutation = useMutation({
    mutationFn: ({ id, name, room, bed }: { id: string, name: string, room?: string, bed?: string }) => 
      renameDashboardDevice(id, name, room, bed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard_devices'] });
      setManageDevice(null);
    },
    onError: (error) => {
      console.error(error);
      alert('Failed to update device settings');
    }
  });

  const handleSaveRename = () => {
    if (manageDevice) {
      renameMutation.mutate({ id: manageDevice.id, name: editName, room: editRoom, bed: editBed });
    }
  };

  const filteredDevices = devices.filter((device) => {
    const q = searchQuery.toLowerCase();
    const nameMatch = device.name?.toLowerCase().includes(q);
    const idMatch = device.id?.toLowerCase().includes(q);
    const roomMatch = device.room?.toLowerCase().includes(q);
    const bedMatch = device.bed?.toLowerCase().includes(q);
    return nameMatch || idMatch || roomMatch || bedMatch;
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col h-full overflow-visible">
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center space-x-4 flex-1">
          <div className="relative w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Name, Room, Bed or ID..."
              className="block w-full pl-9 pr-3 py-2 bg-gray-100 border-transparent rounded-md text-sm placeholder-gray-500 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-visible">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50/50 text-gray-500 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider w-[12%] min-w-[110px]">Status</th>
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider w-[12%] min-w-[80px]">Room</th>
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider w-[12%] min-w-[80px]">Bed</th>
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider w-[34%] min-w-[200px]">Dozemate Name</th>
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider w-[25%] min-w-[180px]">Last Sync</th>
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-right w-[5%]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  Loading devices...
                </td>
              </tr>
            ) : filteredDevices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  {searchQuery ? "No devices match your search." : "No devices assigned to this organization."}
                </td>
              </tr>
            ) : (
              filteredDevices.map((device, idx) => {
                const isOnline = ['online', 'monitoring'].includes((device.status || '').toLowerCase());
                return (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="flex items-center justify-start">
                        <span 
                          className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}
                          title={isOnline ? 'online' : 'offline'}
                        ></span>
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-900 font-medium text-sm">
                      {device.room ? device.room.replace(/^Room\s+/i, '') : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-gray-900 font-medium text-sm">
                      {device.bed ? device.bed.replace(/^Bed\s+/i, '') : 'N/A'}
                    </td>
                    <td className="px-6 py-4 font-bold text-[#0097b2]">
                      <span className="block">{device.name}</span>
                      <span className="block text-xs text-gray-400 font-mono font-normal mt-0.5">{device.id}</span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-600">
                      {device.ts ? new Date(device.ts).toLocaleString('en-US') : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-right relative">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(activeMenu === device.id ? null : device.id);
                        }}
                        className="p-1.5 text-gray-400 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                      {activeMenu === device.id && (
                        <div className="absolute right-6 top-10 w-32 bg-white rounded-md shadow-lg border border-gray-100 z-10 py-1 text-left" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              setManageDevice(device);
                              setEditName(device.name);
                              setEditRoom(device.room || '');
                              setEditBed(device.bed || '');
                              setActiveMenu(null);
                            }}
                            className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                          >
                            Manage
                          </button>
                          <button
                            onClick={() => {
                              setDeviceToRemove(device);
                              setActiveMenu(null);
                            }}
                            disabled={isRemoving}
                            className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left font-medium disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {manageDevice && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">Manage Device</h2>
              <button 
                onClick={() => setManageDevice(null)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Device ID</label>
                <input 
                  type="text" 
                  value={manageDevice.id} 
                  disabled
                  className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-500 font-mono cursor-not-allowed" 
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Dozemate Name</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#0097b2] focus:border-[#0097b2]" 
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Room</label>
                <input 
                  type="text" 
                  value={editRoom}
                  onChange={(e) => setEditRoom(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#0097b2] focus:border-[#0097b2]" 
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Bed</label>
                <input 
                  type="text" 
                  value={editBed}
                  onChange={(e) => setEditBed(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#0097b2] focus:border-[#0097b2]" 
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button 
                onClick={() => setManageDevice(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 mr-3"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveRename}
                disabled={renameMutation.isPending}
                className="px-4 py-2 text-sm font-bold text-white bg-[#0097b2] border border-transparent rounded-md hover:bg-[#007a90] disabled:opacity-50"
              >
                {renameMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Modal */}
      {deviceToRemove && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm overflow-hidden text-center p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Remove Device</h2>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              Remove <span className="font-bold text-gray-700">{deviceToRemove.name}</span> from your account? You will no longer see it or its data.
            </p>
            <div className="flex space-x-3">
              <button 
                onClick={() => setDeviceToRemove(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                No
              </button>
              <button 
                onClick={confirmRemove}
                disabled={isRemoving}
                className="flex-1 px-4 py-2 text-sm font-bold text-white bg-red-500 rounded-md hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {isRemoving ? 'Removing...' : 'Yes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
