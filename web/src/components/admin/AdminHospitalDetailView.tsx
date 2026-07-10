import React, { useState, useEffect } from 'react';
import { 
  ChevronRight, 
  Ban, 
  Save, 
  AlertTriangle, 
  Mail, 
  Phone, 
  UserPlus, 
  MoreVertical,
  ChevronLeft,
  Info,
  Trash2,
  X,
  Loader2,
  CloudUpload
} from 'lucide-react';
import { apiUrl } from '@/services/api';
import ImageCropperModal from '../common/ImageCropperModal';

interface Props {
  hospital: any;
  onBack: () => void;
  onSelectPatient: (patient: any) => void;
}

export default function AdminHospitalDetailView({ hospital, onBack, onSelectPatient }: Props) {
  const [staff, setStaff] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Patient list states
  const [patients, setPatients] = useState<any[]>([]);
  const [patientCurrentPage, setPatientCurrentPage] = useState(1);
  const [patientsLoading, setPatientsLoading] = useState(true);

  // Dropdown / Action States
  const [activePatientMenu, setActivePatientMenu] = useState<string | null>(null);
  const [activeDeviceMenu, setActiveDeviceMenu] = useState<string | null>(null);

  // Device management/rename/remove modal states
  const [manageDevice, setManageDevice] = useState<any | null>(null);
  const [deviceToRemove, setDeviceToRemove] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editRoom, setEditRoom] = useState('');
  const [editBed, setEditBed] = useState('');
  const [deviceSubmitting, setDeviceSubmitting] = useState(false);
  const [deviceRemoving, setDeviceRemoving] = useState(false);

  const fetchPatients = async () => {
    setPatientsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(apiUrl(`/api/sessions?organizationId=${hospital.id}`), { headers });
      const data = await res.json();
      if (data.success) {
        setPatients(data.data || []);
      }
    } catch (err) {
      console.error("Error fetching organization patients:", err);
    } finally {
      setPatientsLoading(false);
    }
  };

  // Staff/Admin Tab State
  const [activeStaffTab, setActiveStaffTab] = useState<'admins' | 'viewers'>('admins');

  // Staff (Viewers) invite form state
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffError, setStaffError] = useState('');
  const [staffSubmitting, setStaffSubmitting] = useState(false);

  // Administrators list and form state
  const [admins, setAdmins] = useState<any[]>([]);
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminAddress, setAdminAddress] = useState('');
  const [adminPincode, setAdminPincode] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminSubmitting, setAdminSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: hospital?.name || '',
    subscription: hospital?.subscription || 'Trial',
    email: hospital?.contactEmail || '',
    contactNumber: hospital?.contactNumber || '',
    address: hospital?.location || '',
    organizationType: hospital?.organizationType || 'hospital'
  });
  const [activeStartDate, setActiveStartDate] = useState('');
  const [activeEndDate, setActiveEndDate] = useState('');
  const [customMonths, setCustomMonths] = useState(3);

  const formatDateToInput = (dateVal: any) => {
    if (!dateVal) return '';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    } catch (e) {
      return '';
    }
  };

  const calculateEndDate = (startDateStr: string, plan: string, months: number) => {
    if (!startDateStr) return '';
    const startDate = new Date(startDateStr);
    if (isNaN(startDate.getTime())) return '';
    
    if (plan === 'custom') {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() + months);
      return d.toISOString().split('T')[0];
    } else if (plan === 'annual') {
      const d = new Date(startDate);
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().split('T')[0];
    }
    return '';
  };
  const [logo, setLogo] = useState(hospital?.logo || '');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState('');
  const [isCropOpen, setIsCropOpen] = useState(false);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be under 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setTempImageSrc(reader.result as string);
      setIsCropOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCropSave = async (croppedBlob: Blob) => {
    setIsCropOpen(false);
    setUploadingLogo(true);
    const formDataPayload = new FormData();
    formDataPayload.append('logo', croppedBlob, 'logo.png');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(apiUrl('/api/superadmin/organizations/upload-logo'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formDataPayload,
      });
      const result = await response.json();
      if (response.ok && result.status === 'success') {
        setLogo(result.logoUrl);
      } else {
        alert(result.message || 'Failed to upload logo.');
      }
    } catch (err) {
      console.error(err);
      alert('Error uploading file.');
    } finally {
      setUploadingLogo(false);
    }
  };

  useEffect(() => {
    if (hospital) {
      setFormData({
        name: hospital.name || '',
        subscription: hospital.subscription || 'Trial',
        email: hospital.contactEmail || '',
        contactNumber: hospital.contactNumber || '',
        address: hospital.location || '',
        organizationType: hospital.organizationType || 'hospital'
      });
      setLogo(hospital.logo || '');
      setActiveStartDate(formatDateToInput(hospital.activeStartDate));
      setActiveEndDate(formatDateToInput(hospital.activeEndDate));

      if (hospital.subscription === 'custom' && hospital.activeStartDate && hospital.activeEndDate) {
        const start = new Date(hospital.activeStartDate);
        const end = new Date(hospital.activeEndDate);
        let monthDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        if (monthDiff >= 1 && monthDiff <= 3) {
          setCustomMonths(monthDiff);
        }
      }
    }
  }, [hospital]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      if (name === 'subscription') {
        const newEnd = calculateEndDate(activeStartDate, value, customMonths);
        setActiveEndDate(newEnd);
      }
      return updated;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/superadmin/organizations/${hospital.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          contactNumber: formData.contactNumber,
          servicePlan: formData.subscription,
          address: formData.address,
          logo,
          activeStartDate,
          activeEndDate: activeEndDate || null,
          organizationType: formData.organizationType
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert('Organization updated successfully');
      } else {
        alert(data.message || 'Failed to update organization');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  const fetchStaff = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(apiUrl(`/api/manage/users/viewers?organizationId=${hospital.id}`), { headers });
      const data = await res.json();
      if (data.status === 'success') {
        setStaff(data.data || []);
      }
    } catch (err) {
      console.error("Error fetching organization staff:", err);
    }
  };

  const fetchAdmins = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(apiUrl(`/api/admins?organizationId=${hospital.id}`), { headers });
      const data = await res.json();
      if (data.status === 'success') {
        setAdmins(data.data.admins || []);
      }
    } catch (err) {
      console.error("Error fetching organization admins:", err);
    }
  };

  const fetchDevices = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(apiUrl(`/api/devices/devices/organization/${hospital.id}`), { headers });
      const data = await res.json();
      if (data.status === 'success') {
        setDevices(data.data || []);
      }
    } catch (err) {
      console.error("Error fetching organization devices:", err);
    }
  };

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        await fetchDevices();
        await Promise.all([fetchStaff(), fetchAdmins(), fetchPatients()]);
      } catch (err) {
        console.error("Error fetching organization details:", err);
      } finally {
        setLoading(false);
      }
    };

    if (hospital?.id) {
      fetchDetails();
    }
  }, [hospital?.id]);

  useEffect(() => {
    const handleClickOutside = () => {
      setActivePatientMenu(null);
      setActiveDeviceMenu(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleSaveRename = async () => {
    if (!manageDevice) return;
    setDeviceSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/devices/dashboard-rename/${encodeURIComponent(manageDevice.deviceId)}`), {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: editName, room: editRoom, bed: editBed }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchDevices();
        setManageDevice(null);
      } else {
        alert(data.message || 'Failed to update device settings');
      }
    } catch (err) {
      console.error('Rename device error:', err);
      alert('Server error updating device');
    } finally {
      setDeviceSubmitting(false);
    }
  };

  const handleRemoveDevice = async () => {
    if (!deviceToRemove) return;
    setDeviceRemoving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/devices/dashboard-remove/${encodeURIComponent(deviceToRemove.deviceId)}`), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        await fetchDevices();
        setDeviceToRemove(null);
      } else {
        alert(data.message || 'Failed to remove device');
      }
    } catch (err) {
      console.error('Delete device error:', err);
      alert('Server error removing device');
    } finally {
      setDeviceRemoving(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError('');
    
    if (!staffName.trim() || !staffEmail.trim()) {
      setStaffError('Name and Email are required.');
      return;
    }

    setStaffSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        name: staffName.trim(),
        email: staffEmail.trim().toLowerCase(),
        phone: staffPhone.trim() || undefined,
        organizationId: hospital.id
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
        setShowAddStaffModal(false);
        setStaffName('');
        setStaffEmail('');
        setStaffPhone('');
        fetchStaff();
      } else {
        setStaffError(data.message || 'Failed to invite staff');
      }
    } catch (error) {
      console.error('Error inviting staff:', error);
      setStaffError('Server error inviting staff');
    } finally {
      setStaffSubmitting(false);
    }
  };

  const handleDeleteStaff = async (viewerUserId: string | undefined, viewerName: string) => {
    if (!viewerUserId) return;
    if (confirm(`Are you sure you want to revoke access and delete staff account for "${viewerName}"?`)) {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(apiUrl(`/api/manage/users/viewers/${viewerUserId}?organizationId=${hospital.id}`), {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
          fetchStaff();
        } else {
          alert(data.message || 'Failed to delete staff');
        }
      } catch (error) {
        console.error('Delete staff error:', error);
        alert('Server error deleting staff');
      }
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');

    if (!adminName.trim() || !adminEmail.trim() || !adminPassword.trim()) {
      setAdminError('Name, Email and Password are required.');
      return;
    }

    setAdminSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        name: adminName.trim(),
        email: adminEmail.trim().toLowerCase(),
        password: adminPassword.trim(),
        mobile: adminPhone.trim() || undefined,
        phone: adminPhone.trim() || undefined,
        address: adminAddress.trim() || undefined,
        pincode: adminPincode.trim() || undefined,
        organizationId: hospital.id
      };

      const res = await fetch(apiUrl('/api/admins'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.status === 'success') {
        setShowAddAdminModal(false);
        setAdminName('');
        setAdminEmail('');
        setAdminPassword('');
        setAdminPhone('');
        setAdminAddress('');
        setAdminPincode('');
        fetchAdmins();
      } else {
        setAdminError(data.message || 'Failed to create administrator');
      }
    } catch (error) {
      console.error('Error creating admin:', error);
      setAdminError('Server error creating administrator');
    } finally {
      setAdminSubmitting(false);
    }
  };

  const handleDeleteAdmin = async (adminId: string, adminName: string) => {
    if (!adminId) return;
    if (confirm(`Are you sure you want to delete administrator "${adminName}"?`)) {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(apiUrl(`/api/admins/${adminId}`), {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
          fetchAdmins();
        } else {
          alert(data.message || 'Failed to delete administrator');
        }
      } catch (error) {
        console.error('Delete admin error:', error);
        alert('Server error deleting administrator');
      }
    }
  };

  const handleDeletePatient = async (patientId: string, patientName: string) => {
    if (!patientId) return;
    if (confirm(`Are you sure you want to delete patient record for "${patientName}"? This action cannot be undone.`)) {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(apiUrl(`/api/sessions/${patientId}`), {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          fetchPatients();
        } else {
          alert(data.message || 'Failed to delete patient record');
        }
      } catch (error) {
        console.error('Delete patient error:', error);
        alert('Server error deleting patient record');
      }
    }
  };

  const totalPages = Math.ceil(devices.length / itemsPerPage);
  const paginatedDevices = devices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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

  const patientsPerPage = 5;
  const totalPatientPages = Math.ceil(patients.length / patientsPerPage);
  const paginatedPatients = patients.slice((patientCurrentPage - 1) * patientsPerPage, patientCurrentPage * patientsPerPage);

  let pStartPage = Math.max(1, patientCurrentPage - 1);
  let pEndPage = pStartPage + 2;

  if (pEndPage > totalPatientPages) {
    pEndPage = totalPatientPages;
    pStartPage = Math.max(1, pEndPage - 2);
  }

  const patientPageNumbers = [];
  for (let i = pStartPage; i <= pEndPage; i++) {
    patientPageNumbers.push(i);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Breadcrumbs */}
      <div className="flex items-center text-sm font-medium text-gray-500 space-x-2">
        <button onClick={onBack} className="hover:text-[#007b90] transition-colors">Organizations</button>
        <span className="text-gray-400 mx-2">/</span>
        <span className="text-gray-900 font-bold">{hospital?.name || 'City General Organization'}</span>
      </div>

      {/* Header Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div className="flex items-center space-x-4">
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
            {hospital?.name || 'City General Organization'}
          </h2>
          <div className="flex space-x-2">
            <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full flex items-center">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5"></span>
              {hospital?.status || 'Active'}
            </span>
            <span className="bg-gray-200 text-gray-700 text-xs font-mono font-bold px-3 py-1 rounded">
              {hospital?.hospitalId || 'SLM-00843'}
            </span>
          </div>
        </div>
        {/* Quick Actions */}
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setShowSuspendModal(true)}
            className="flex items-center px-4 py-2 bg-white border border-red-200 text-red-600 font-bold rounded-lg hover:bg-red-50 transition-colors text-sm shadow-sm"
          >
            <Ban className="w-4 h-4 mr-2" />
            Suspend Account
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center px-4 py-2 bg-[#007b90] text-white font-bold rounded-lg hover:bg-[#006070] transition-colors text-sm shadow-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>


      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Organization Profile */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center mb-6">
            <Info className="w-5 h-5 text-[#007b90] mr-2" />
            <h3 className="text-lg font-bold text-[#007b90]">Organization Profile</h3>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Organization Name</label>
              <input 
                type="text" 
                name="name"
                value={formData.name} 
                onChange={handleChange}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Organization Type</label>
              <select 
                name="organizationType"
                value={formData.organizationType}
                onChange={handleChange}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all"
              >
                <option value="hospital">Hospital</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Subscription Plan</label>
              <div className="flex space-x-2">
                <select 
                  name="subscription"
                  value={formData.subscription}
                  onChange={handleChange}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all appearance-none"
                >
                  <option value="custom">Date Selection</option>
                  <option value="annual">Annual Period (1 Year)</option>
                  <option value="trial">Trial Tier</option>
                </select>
                {formData.subscription === 'custom' && (
                  <select
                    value={customMonths}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setCustomMonths(val);
                      const newEnd = calculateEndDate(activeStartDate, formData.subscription, val);
                      setActiveEndDate(newEnd);
                    }}
                    className="w-32 bg-gray-50 border border-gray-200 rounded-lg px-2 py-2.5 text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all"
                  >
                    <option value="1">1 Month</option>
                    <option value="2">2 Months</option>
                    <option value="3">3 Months</option>
                  </select>
                )}
              </div>
            </div>
            <div>{/* Spacer column to align Subscription Plan to the left 50% */}</div>
          </div>
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Active Start Date</label>
              <input 
                type="date" 
                name="activeStartDate"
                value={activeStartDate} 
                onChange={(e) => {
                  setActiveStartDate(e.target.value);
                  const newEnd = calculateEndDate(e.target.value, formData.subscription, customMonths);
                  setActiveEndDate(newEnd);
                }}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Active End Date (Auto)</label>
              <input 
                type="date" 
                name="activeEndDate"
                value={activeEndDate} 
                readOnly
                className="w-full bg-gray-200 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-500 font-medium outline-none cursor-not-allowed"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-gray-400" />
                </div>
                <input 
                  type="email" 
                  name="email"
                  value={formData.email} 
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Primary Phone</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Phone className="h-4 w-4 text-gray-400" />
                </div>
                <input 
                  type="text" 
                  name="contactNumber"
                  value={formData.contactNumber} 
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Physical Address</label>
              <textarea 
                rows={5}
                name="address"
                value={formData.address} 
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-[#007b90]/20 focus:border-[#007b90] outline-none transition-all resize-none h-[120px]"
              ></textarea>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Branding Logo</label>
                <input
                  type="file"
                  accept="image/*"
                  id="detail-logo-upload"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                {logo ? (
                  <div className="flex items-center space-x-3 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="w-12 h-12 rounded border border-gray-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                      <img src={apiUrl(logo)} alt="Logo" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => setLogo('')}
                        className="text-xs text-red-500 hover:text-red-700 font-bold"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label
                    htmlFor="detail-logo-upload"
                    className="border-2 border-dashed border-gray-200 bg-gray-50 rounded-lg p-3 flex flex-col items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer group h-14"
                  >
                    <CloudUpload className="w-5 h-5 text-gray-400 mb-1 group-hover:text-[#007b90] transition-colors" />
                    <span className="text-[10px] font-bold text-gray-500">
                      {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                    </span>
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Organization Accounts (Admins / Viewers) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col">
          {/* Section Title */}
          <div className="flex items-center mb-6">
            <UserPlus className="w-5 h-5 text-[#007b90] mr-2" />
            <h3 className="text-lg font-bold text-[#007b90]">Organization Accounts</h3>
          </div>

          {/* Toggle Tabs */}
          <div className="flex border-b border-gray-200 mb-6 shrink-0">
            <button
              onClick={() => setActiveStaffTab('admins')}
              className={`flex-1 pb-3 text-xs font-bold uppercase tracking-wider text-center transition-all ${
                activeStaffTab === 'admins'
                  ? 'text-[#007b90] border-b-2 border-[#007b90]'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Administrators ({admins.length})
            </button>
            <button
              onClick={() => setActiveStaffTab('viewers')}
              className={`flex-1 pb-3 text-xs font-bold uppercase tracking-wider text-center transition-all ${
                activeStaffTab === 'viewers'
                  ? 'text-[#007b90] border-b-2 border-[#007b90]'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Viewers ({staff.length})
            </button>
          </div>

          {/* Tab Content List */}
          <div className="space-y-5 flex-1 max-h-[300px] overflow-y-auto pr-1">
            {loading ? (
              <div className="text-sm text-gray-500 py-4">Loading accounts...</div>
            ) : activeStaffTab === 'admins' ? (
              admins.length === 0 ? (
                <div className="text-sm text-gray-500 py-4 italic">No administrator accounts assigned yet.</div>
              ) : (
                admins.map((member) => (
                  <div key={member._id} className="flex items-center justify-between group">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-gray-200 shadow-sm bg-teal-50 text-[#007b90] flex items-center justify-center font-bold text-sm">
                        {member.name ? member.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : 'A'}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-gray-900 text-sm truncate">{member.name || 'Unnamed Admin'}</div>
                        <div className="text-xs text-gray-500 font-medium truncate mt-0.5">{member.email || 'No email provided'}</div>
                        {member.mobile && <div className="text-[10px] text-gray-400 font-mono mt-0.5">{member.mobile}</div>}
                      </div>
                    </div>
                    
                    {/* Delete Admin Account (Allowed if there is more than 1 admin, and this is not the default profile admin) */}
                    <button
                      onClick={() => handleDeleteAdmin(member._id, member.name)}
                      disabled={admins.length <= 1 || member.isDefaultProfile}
                      title={
                        member.isDefaultProfile
                          ? "The primary/default administrator account cannot be deleted."
                          : admins.length <= 1
                          ? "At least one administrator account must be attached to the organization."
                          : "Delete Administrator Account"
                      }
                      className={`p-2 rounded-lg transition-colors shrink-0 ${
                        (admins.length <= 1 || member.isDefaultProfile)
                          ? 'text-gray-300 cursor-not-allowed opacity-30'
                          : 'text-red-500 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 focus:opacity-100'
                      }`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )
            ) : (
              staff.length === 0 ? (
                <div className="text-sm text-gray-500 py-4 italic">No viewer accounts assigned yet.</div>
              ) : (
                staff.map((member) => (
                  <div key={member.userId || member._id} className="flex items-center justify-between group">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-gray-200 shadow-sm bg-teal-50 text-[#007b90] flex items-center justify-center font-bold text-sm">
                        {member.name ? member.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : 'V'}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-gray-900 text-sm truncate">{member.name || 'Unnamed User'}</div>
                        <div className="text-xs text-gray-500 font-medium truncate mt-0.5">{member.email || 'No email provided'}</div>
                        {member.phone && <div className="text-[10px] text-gray-400 font-mono mt-0.5">{member.phone}</div>}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleDeleteStaff(member.userId, member.name)}
                      title="Remove Viewer Staff Member"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )
            )}
          </div>

          {/* Create / Assign Action Button */}
          {activeStaffTab === 'admins' ? (
            <button 
              onClick={() => setShowAddAdminModal(true)}
              className="mt-8 w-full py-3 border-2 border-dashed border-gray-200 hover:border-[#007b90] rounded-xl flex items-center justify-center text-sm font-bold text-gray-500 hover:text-[#007b90] transition-colors"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Create New Administrator
            </button>
          ) : (
            <button 
              onClick={() => setShowAddStaffModal(true)}
              className="mt-8 w-full py-3 border-2 border-dashed border-gray-200 hover:border-[#007b90] rounded-xl flex items-center justify-center text-sm font-bold text-gray-500 hover:text-[#007b90] transition-colors"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Assign New Staff Viewer
            </button>
          )}
        </div>
      </div>

      {/* Patients Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
          <div className="flex items-start">
            <div className="mt-1 mr-3 text-[#007b90]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9 11C11.2091 11 13 9.20914 13 7C13 4.79086 11.2091 3 9 3C6.79086 3 5 4.79086 5 7C5 9.20914 6.79086 11 9 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M23 21V19C22.9993 18.1137 22.6907 17.2519 22.1214 16.5527C21.552 15.8535 20.7553 15.3585 19.86 15.15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M16 3.13C16.8999 3.32628 17.7019 3.82136 18.2751 4.52358C18.8484 5.2258 19.1585 6.09279 19.1585 6.985C19.1585 7.87721 18.8484 8.7442 18.2751 9.44642C17.7019 10.1486 16.8999 10.6437 16 10.84" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#007b90]">Monitored Patients</h3>
              <p className="text-xs text-gray-500 font-medium">Currently managing {patients.length} patient records</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Patient Name</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Patient ID</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Room / Bed</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Admission Date</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Action</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {patientsLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">Loading patient records...</td>
                </tr>
              ) : patients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">No patient monitoring records found.</td>
                </tr>
              ) : paginatedPatients.map((patient) => {
                const formattedDate = patient.admissionDate ? new Date(patient.admissionDate).toLocaleDateString('en-US', {
                  year: 'numeric', month: '2-digit', day: '2-digit'
                }) : 'N/A';
                
                return (
                  <tr 
                     key={patient._id} 
                     onClick={() => onSelectPatient(patient)}
                     className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors cursor-pointer group"
                  >
                    <td className="py-4 px-6 font-bold text-gray-900 group-hover:text-[#007b90] transition-colors">{patient.name || 'Unnamed Patient'}</td>
                    <td className="py-4 px-6 text-gray-600 font-mono text-xs">{patient.patientId || patient.patientCode || 'N/A'}</td>
                    <td className="py-4 px-6 text-gray-700 font-medium">Room {patient.room || 'N/A'} / Bed {patient.bed || 'N/A'}</td>
                    <td className="py-4 px-6 text-gray-400 font-mono text-xs">{formattedDate}</td>
                    <td className="py-4 px-6 text-center relative" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => setActivePatientMenu(activePatientMenu === patient._id ? null : patient._id)}
                        className="p-1.5 text-gray-400 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors mx-auto block"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                      {activePatientMenu === patient._id && (
                        <div className="absolute right-12 top-2 w-32 bg-white rounded-md shadow-lg border border-gray-100 z-10 py-1 text-left">
                          <button
                            onClick={() => {
                              onSelectPatient(patient);
                              setActivePatientMenu(null);
                            }}
                            className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left font-bold"
                          >
                            Manage
                          </button>
                          <button
                            onClick={() => {
                              handleDeletePatient(patient._id || patient.id, patient.name);
                              setActivePatientMenu(null);
                            }}
                            className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left font-bold"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Patient Pagination */}
        <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-between items-center">
          <div className="text-[10px] font-mono text-gray-500 font-bold uppercase tracking-widest">
            Showing {patients.length === 0 ? 0 : (patientCurrentPage - 1) * patientsPerPage + 1} - {Math.min(patientCurrentPage * patientsPerPage, patients.length)} of {patients.length} patients
          </div>
          <div className="flex space-x-1">
            <button 
              onClick={() => setPatientCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={patientCurrentPage === 1 || patients.length === 0}
              className="w-8 h-8 flex items-center justify-center text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            {patientPageNumbers.map(page => (
              <button
                key={page}
                onClick={() => setPatientCurrentPage(page)}
                className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded transition-colors shadow-sm ${
                  patientCurrentPage === page 
                    ? 'bg-[#007b90] text-white' 
                    : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            ))}

            <button 
              onClick={() => setPatientCurrentPage(prev => Math.min(prev + 1, totalPatientPages))}
              disabled={patientCurrentPage === totalPatientPages || patients.length === 0}
              className="w-8 h-8 flex items-center justify-center text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Devices Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-6">
        <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
          <div className="flex items-start">
            <div className="mt-1 mr-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#007b90]">
                <path d="M4 10H20C21.1046 10 22 10.8954 22 12V20C22 21.1046 21.1046 22 20 22H4C2.89543 22 2 21.1046 2 20V12C2 10.8954 2.89543 10 4 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 6V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 8C8.98064 6.84074 10.4357 6.13626 12 6.13626C13.5643 6.13626 15.0194 6.84074 16 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 5C6.76451 3.25055 9.25555 2.11584 12 2.11584C14.7444 2.11584 17.2355 3.25055 19 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#007b90]">Assigned IOT Devices</h3>
              <p className="text-xs text-gray-500 font-medium">Currently managing {devices.length} assigned sensors</p>
            </div>
          </div>

        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Device Name</th>

                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Status</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Last Sync Time</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Room / Bed</th>
                <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">Loading devices...</td>
                </tr>
              ) : devices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">No devices assigned to this organization yet.</td>
                </tr>
              ) : paginatedDevices.map((device) => {
                const ts = device.lastActiveAt ? new Date(device.lastActiveAt).getTime() : 0;
                const isOnline = (Date.now() - ts) <= 30000;
                const formattedDate = device.lastActiveAt ? new Date(device.lastActiveAt).toLocaleString('en-US', {
                  year: 'numeric', month: '2-digit', day: '2-digit',
                  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
                }).replace(',', '') : 'Never';
                
                return (
                  <tr key={device._id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6 font-bold text-[#0097b2]">
                      <span className="block text-gray-900">{device.customName || device.defaultName || 'Unnamed Device'}</span>
                      <span className="block text-xs text-gray-400 font-mono font-normal mt-0.5">{device.deviceId}</span>
                    </td>

                    <td className="py-4 px-6">
                      <div className={`flex items-center text-xs font-bold ${isOnline ? 'text-green-600' : 'text-gray-500'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full mr-2 ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                        {isOnline ? 'Online' : 'Offline'}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-gray-400 font-mono text-xs">{formattedDate}</td>
                    <td className="py-4 px-6 text-gray-700 font-medium">Room {device.room || 'N/A'} / Bed {device.bed || 'N/A'}</td>
                    <td className="py-4 px-6 text-center relative" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => setActiveDeviceMenu(activeDeviceMenu === device._id ? null : device._id)}
                        className="p-1.5 text-gray-400 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors mx-auto block"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                      {activeDeviceMenu === device._id && (
                        <div className="absolute right-12 top-2 w-32 bg-white rounded-md shadow-lg border border-gray-100 z-10 py-1 text-left">
                          <button
                            onClick={() => {
                              setManageDevice(device);
                              setEditName(device.customName || device.defaultName || device.deviceId);
                              setEditRoom(device.room || '');
                              setEditBed(device.bed || '');
                              setActiveDeviceMenu(null);
                            }}
                            className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left font-bold"
                          >
                            Manage
                          </button>
                          <button
                            onClick={() => {
                              setDeviceToRemove(device);
                              setActiveDeviceMenu(null);
                            }}
                            className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left font-bold"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-between items-center">
          <div className="text-[10px] font-mono text-gray-500 font-bold uppercase tracking-widest">
            Showing {devices.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, devices.length)} of {devices.length} devices
          </div>
          <div className="flex space-x-1">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1 || devices.length === 0}
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
              disabled={currentPage === totalPages || devices.length === 0}
              className="w-8 h-8 flex items-center justify-center text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Suspend Confirmation Modal */}
      {showSuspendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-center text-gray-900 mb-2">Suspend Organization?</h3>
              <p className="text-center text-gray-500 text-sm mb-6">
                Are you sure you want to suspend <span className="font-bold text-gray-900">{hospital?.name}</span>? 
                They will be moved to the Trash and their users will not be able to log in.
              </p>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowSuspendModal(false)}
                  disabled={isSuspending}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setIsSuspending(true);
                    try {
                      const token = localStorage.getItem('token');
                      const res = await fetch(apiUrl(`/api/superadmin/organizations/${hospital.id}/suspend`), {
                        method: 'PUT',
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      const data = await res.json();
                      if (data.status === 'success') {
                        setShowSuspendModal(false);
                        onBack();
                      } else {
                        alert(data.message || 'Failed to suspend organization');
                      }
                    } catch (err) {
                      alert('Network error. Failed to suspend organization.');
                    } finally {
                      setIsSuspending(false);
                    }
                  }}
                  disabled={isSuspending}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  {isSuspending ? 'Suspending...' : 'Yes, Suspend'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Staff Modal */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">Assign Live Viewer Staff</h3>
              <button 
                onClick={() => setShowAddStaffModal(false)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddStaff}>
              <div className="p-6 space-y-4">
                {staffError && (
                  <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-lg text-xs font-semibold">
                    {staffError}
                  </div>
                )}

                {/* Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Staff Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sarah Jenkins"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. sarah.j@slimiot.com"
                    value={staffEmail}
                    onChange={(e) => setStaffEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Phone Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 9876543210"
                    value={staffPhone}
                    onChange={(e) => setStaffPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={staffSubmitting}
                  className="flex items-center px-5 py-2 bg-[#007b90] hover:bg-[#006070] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {staffSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    <>
                      Assign Staff
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Administrator Modal */}
      {showAddAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">Create New Administrator</h3>
              <button 
                onClick={() => setShowAddAdminModal(false)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddAdmin}>
              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                {adminError && (
                  <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-lg text-xs font-semibold">
                    {adminError}
                  </div>
                )}

                {/* Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Admin Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mayank Pratap"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. admin@slimiot.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="Enter security password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Phone Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 9876543210"
                    value={adminPhone}
                    onChange={(e) => setAdminPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Physical Address (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Flat, Street, City"
                    value={adminAddress}
                    onChange={(e) => setAdminAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                  />
                </div>

                {/* Pincode */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Pincode (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 121002"
                    value={adminPincode}
                    onChange={(e) => setAdminPincode(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddAdminModal(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adminSubmitting}
                  className="flex items-center px-5 py-2 bg-[#007b90] hover:bg-[#006070] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {adminSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Create Admin
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Device Modal */}
      {manageDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">Manage Device</h3>
              <button 
                onClick={() => setManageDevice(null)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Device ID</label>
                <input 
                  type="text" 
                  value={manageDevice.deviceId} 
                  disabled
                  className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500 font-mono cursor-not-allowed" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Dozemate Name</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Room</label>
                <input 
                  type="text" 
                  value={editRoom}
                  onChange={(e) => setEditRoom(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Bed</label>
                <input 
                  type="text" 
                  value={editBed}
                  onChange={(e) => setEditBed(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]" 
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end space-x-3">
              <button 
                onClick={() => setManageDevice(null)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveRename}
                disabled={deviceSubmitting}
                className="flex items-center px-5 py-2 bg-[#007b90] hover:bg-[#006070] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {deviceSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Device Modal */}
      {deviceToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-center text-gray-900 mb-2">Delete Device?</h3>
              <p className="text-center text-gray-500 text-sm mb-6">
                Are you sure you want to delete <span className="font-bold text-gray-900">{deviceToRemove.customName || deviceToRemove.defaultName || deviceToRemove.deviceId}</span>? 
                This device will be deleted from the organization and its settings will be reset.
              </p>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => setDeviceToRemove(null)}
                  disabled={deviceRemoving}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemoveDevice}
                  disabled={deviceRemoving}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 text-sm flex items-center justify-center"
                >
                  {deviceRemoving ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ImageCropperModal 
        src={tempImageSrc} 
        isOpen={isCropOpen} 
        onClose={() => setIsCropOpen(false)} 
        onCrop={handleCropSave} 
      />
    </div>
  );
}
