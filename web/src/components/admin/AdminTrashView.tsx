import { useState, useEffect } from 'react';
import { Trash2, RefreshCcw, Archive } from 'lucide-react';
import { apiUrl } from '@/services/api';

interface Props {
  onRestoreHospital?: (hospitalId: any) => void;
}

export default function AdminTrashView({ onRestoreHospital }: Props) {
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [hospitalToRestore, setHospitalToRestore] = useState<any>(null);
  const [hospitalToDelete, setHospitalToDelete] = useState<any>(null);

  const fetchTrashedHospitals = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/superadmin/organizations/trash'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.status === 'success') {
        setHospitals(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch archived organizations:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrashedHospitals();
  }, []);

  const handleRestore = async () => {
    if (!hospitalToRestore) return;
    
    setRestoringId(hospitalToRestore.id);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/superadmin/organizations/${hospitalToRestore.id}/restore`), {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await res.json();
      if (data.status === 'success') {
        setHospitals(prev => prev.filter(h => h.id !== hospitalToRestore.id));
        setShowRestoreModal(false);
        setHospitalToRestore(null);
        if (onRestoreHospital) onRestoreHospital(hospitalToRestore.id);
      } else {
        alert(data.message || "Failed to restore organization");
      }
    } catch (error) {
      console.error("Restore failed:", error);
      alert("Failed to restore organization due to a network error.");
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async () => {
    if (!hospitalToDelete) return;
    
    setDeletingId(hospitalToDelete.id);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/superadmin/organizations/${hospitalToDelete.id}`), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setHospitals(prev => prev.filter(h => h.id !== hospitalToDelete.id));
        setShowDeleteModal(false);
        setHospitalToDelete(null);
      } else {
        alert(data.message || "Failed to delete organization");
      }
    } catch (error) {
      console.error("Delete failed:", error);
      alert("Failed to delete organization due to a network error.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1 flex items-center">
            <Archive className="w-6 h-6 mr-2 text-[#007b90]" /> Archive (Suspended)
          </h2>
          <p className="text-sm text-gray-500">
            Suspended organizations are stored here. You can restore them or permanently delete them below.
          </p>
        </div>
        <button 
          onClick={fetchTrashedHospitals}
          className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm flex items-center"
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Organization Name</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Primary Contact</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-gray-500">
                    Loading archived organizations...
                  </td>
                </tr>
              ) : hospitals.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-gray-500">
                    No suspended organizations found in the archive.
                  </td>
                </tr>
              ) : (
                hospitals.map((hospital) => (
                  <tr key={hospital.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="py-5 px-6">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded flex items-center justify-center font-bold text-lg mr-4 shrink-0 shadow-sm bg-[#eaf4f6] text-[#007b90]">
                          {hospital.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 text-base">{hospital.name}</div>
                          <div className="text-[10px] text-gray-400 font-mono mt-0.5">ID: {hospital.hospitalId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      <div className="font-bold text-gray-900">{hospital.contactName}</div>
                      <div className="text-[10px] text-gray-400 font-mono mt-0.5">{hospital.contactEmail}</div>
                    </td>
                    <td className="py-5 px-6 text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button 
                          onClick={() => {
                            setHospitalToRestore(hospital);
                            setShowRestoreModal(true);
                          }}
                          disabled={restoringId === hospital.id || deletingId === hospital.id}
                          className="text-xs font-bold text-white bg-[#007b90] hover:bg-[#006375] px-4 py-2 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
                        >
                          {restoringId === hospital.id ? 'Restoring...' : (
                            <>
                              <RefreshCcw className="w-3 h-3 mr-2" />
                              Restore
                            </>
                          )}
                        </button>
                        <button 
                          onClick={() => {
                            setHospitalToDelete(hospital);
                            setShowDeleteModal(true);
                          }}
                          disabled={restoringId === hospital.id || deletingId === hospital.id}
                          className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
                        >
                          {deletingId === hospital.id ? 'Deleting...' : (
                            <>
                              <Trash2 className="w-3 h-3 mr-2" />
                              Delete
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {showRestoreModal && hospitalToRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-green-100 rounded-full mb-4">
                <RefreshCcw className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-center text-gray-900 mb-2">Restore Organization?</h3>
              <p className="text-center text-gray-500 text-sm mb-6">
                Are you sure you want to restore <span className="font-bold text-gray-900">{hospitalToRestore.name}</span>? 
                It will become active immediately and users will be able to log in again.
              </p>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowRestoreModal(false);
                    setHospitalToRestore(null);
                  }}
                  disabled={restoringId !== null}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRestore}
                  disabled={restoringId !== null}
                  className="flex-1 px-4 py-2.5 bg-[#007b90] text-white font-bold rounded-lg hover:bg-[#006375] transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  {restoringId !== null ? 'Restoring...' : 'Yes, Restore'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && hospitalToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-center text-gray-900 mb-2">Delete Organization Permanently?</h3>
              <p className="text-center text-gray-500 text-sm mb-6">
                Are you sure you want to permanently delete <span className="font-bold text-gray-900">{hospitalToDelete.name}</span>? 
                This action is <span className="font-bold text-red-600">irreversible</span> and will wipe out all associated accounts, users, and unassign devices.
              </p>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setHospitalToDelete(null);
                  }}
                  disabled={deletingId !== null}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deletingId !== null}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  {deletingId !== null ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
