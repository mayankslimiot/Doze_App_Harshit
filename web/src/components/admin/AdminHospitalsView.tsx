import { useState, useEffect } from 'react';
import { Building2, Signal, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiUrl } from '@/services/api';

interface Props {
  onAddHospital: () => void;
  onManageHospital: (hospital: any) => void;
}

let cachedOrganizations: any[] | null = null;

export default function AdminHospitalsView({ onAddHospital, onManageHospital }: Props) {
  const [hospitals, setHospitals] = useState<any[]>(cachedOrganizations || []);
  const [loading, setLoading] = useState(!cachedOrganizations);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Calculate dynamic KPIs from hospitals data
  const totalEntities = hospitals.length;
  const connectedDevices = hospitals.reduce((sum, h) => sum + (h.devices || 0), 0);

  const fetchHospitals = async (force = false) => {
    if (!force && cachedOrganizations) {
      setHospitals(cachedOrganizations);
      // We show cached data immediately but still fetch fresh data silently
    } else {
      setLoading(true);
    }
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/superadmin/organizations'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.status === 'success') {
        cachedOrganizations = data.data;
        setHospitals(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch organizations:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHospitals();
  }, []);

  const handleRefresh = () => {
    fetchHospitals(true);
  };

  const filteredHospitals = hospitals.filter(hospital => 
    (hospital.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (hospital.hospitalId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (hospital.contactName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (hospital.contactEmail || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredHospitals.length / itemsPerPage);
  const paginatedHospitals = filteredHospitals.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Organization Management</h2>
          <p className="text-sm text-gray-500">Oversee and manage institutional accounts across the <span className="text-black">doze</span><span className="text-[#0097b2]">mate</span> ecosystem.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={handleRefresh}
            className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm flex items-center"
          >
            Refresh
          </button>
          <button 
            onClick={onAddHospital}
            className="bg-[#004f5e] hover:bg-[#003d4a] text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm flex items-center"
          >
            <span className="mr-2 text-lg leading-none">+</span> Add New Organization
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Entities</h3>
            <Building2 className="w-5 h-5 text-[#007b90]" />
          </div>
          <div className="text-4xl font-bold text-[#007b90] mb-2">{totalEntities}</div>
          <div className="text-xs font-medium text-green-600 font-mono tracking-wide">
            ↗ Active monitoring
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Connected Devices</h3>
            <Signal className="w-5 h-5 text-[#007b90]" />
          </div>
          <div className="text-4xl font-bold text-[#007b90] mb-2">{connectedDevices}</div>
          <div className="text-xs font-medium text-green-600 flex items-center font-mono">
            <span className="w-3 h-3 rounded-full border-2 border-green-600 mr-1.5 flex items-center justify-center"><span className="w-1 h-1 bg-green-600 rounded-full"></span></span>
            Provisioned devices
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
            placeholder="Search by Organization Name, ID, or Contact..."
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
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Location</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Subscription</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Devices</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Primary Contact</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Status</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    Loading organizations...
                  </td>
                </tr>
              ) : hospitals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    No organizations found.
                  </td>
                </tr>
              ) : (
                paginatedHospitals.map((hospital) => (
                  <tr key={hospital.id} className={`border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${hospital.status === 'Suspended' ? 'border-l-4 border-l-red-500' : ''}`}>
                    <td className="py-5 px-6">
                      <div className="flex items-center">
                        <div 
                          className="w-10 h-10 rounded flex items-center justify-center font-bold text-lg mr-4 shrink-0 shadow-sm overflow-hidden"
                          style={{ 
                            backgroundColor: hospital.status === 'Suspended' ? '#e5e7eb' : (hospital.accentColor || '#007b90'),
                            color: hospital.status === 'Suspended' ? '#4b5563' : '#ffffff'
                          }}
                        >
                          {hospital.logo && !hospital.logo.includes('default-org-logo.png') ? (
                            <img src={apiUrl(hospital.logo)} alt={hospital.name} className="w-full h-full object-contain bg-white p-1" />
                          ) : (
                            hospital.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 text-base">{hospital.name}</div>
                          <div className="text-[10px] text-gray-400 font-mono mt-0.5">ID: {hospital.hospitalId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-5 px-6 text-gray-600 font-medium whitespace-pre-line">{hospital.location}</td>
                    <td className="py-5 px-6 text-center">
                      <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${
                        hospital.subscription.toLowerCase() === 'trial'
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-[#eaf4f6] text-[#007b90]'
                      }`}>
                        {hospital.subscription}
                      </span>
                    </td>
                    <td className="py-5 px-6 font-mono text-xs">
                      <span className="font-bold text-gray-900">{hospital.devices}</span>
                    </td>
                    <td className="py-5 px-6">
                      <div className="font-bold text-gray-900">{hospital.contactName}</div>
                      <div className="text-[10px] text-gray-400 font-mono mt-0.5">{hospital.contactEmail}</div>
                    </td>
                    <td className="py-5 px-6">
                      <div className={`flex items-center text-xs font-bold ${
                        hospital.status === 'Active' ? 'text-green-600' :
                        hospital.status === 'Suspended' ? 'text-red-600' :
                        'text-orange-600'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full mr-2 ${
                          hospital.status === 'Active' ? 'bg-green-500' :
                          hospital.status === 'Suspended' ? 'bg-red-500' :
                          'bg-orange-500'
                        }`}></div>
                        {hospital.status}
                      </div>
                    </td>
                    <td className="py-5 px-6 text-right">
                      <button 
                        onClick={() => onManageHospital(hospital)}
                        className="text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg transition-colors"
                      >
                        Manage
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
          <div>Showing {filteredHospitals.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredHospitals.length)} of {filteredHospitals.length} Organizations</div>
          <div className="flex space-x-2">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1 || filteredHospitals.length === 0}
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
              disabled={currentPage === totalPages || filteredHospitals.length === 0}
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
