import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { apiUrl } from '../../services/api';
import { 
  Building2, 
  User, 
  Settings, 
  CloudUpload, 
  Info, 
  ChevronRight, 
  ChevronsUpDown,
  Hospital
} from 'lucide-react';
import ImageCropperModal from '../common/ImageCropperModal';
interface Props {
  onCancel: () => void;
  onSubmit: () => void;
}

interface ProvisionFormValues {
  orgName: string;
  address: string;
  website: string;
  organizationId: string;
  adminName: string;
  adminEmail: string;
  adminPhone: string;
  seatLimit: number;
  organizationType: 'hospital' | 'other';
}

export default function AdminProvisionHospitalView({ onCancel, onSubmit }: Props) {
  const [servicePlan, setServicePlan] = useState('custom');
  const [customMonths, setCustomMonths] = useState(3);
  const [activeStartDate, setActiveStartDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [logo, setLogo] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState('');
  const [isCropOpen, setIsCropOpen] = useState(false);

  const calculateEndDate = (startDateStr: string, plan: string, months: number) => {
    if (!startDateStr) return '';
    const startDate = new Date(startDateStr);
    if (isNaN(startDate.getTime())) return '';
    
    if (plan === 'custom') {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() + months);
      return d.toISOString().split('T')[0];
    } else {
      const d = new Date(startDate);
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().split('T')[0];
    }
  };

  const activeEndDate = calculateEndDate(activeStartDate, servicePlan, customMonths);

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
    // Reset file input value so same file can be uploaded again
    e.target.value = '';
  };

  const handleCropSave = async (croppedBlob: Blob) => {
    setIsCropOpen(false);
    setUploadingLogo(true);

    const formData = new FormData();
    formData.append('logo', croppedBlob, 'logo.png');

    try {
      const response = await fetch(apiUrl('/api/superadmin/organizations/upload-logo'), {
        method: 'POST',
        body: formData,
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
  
  const [generatedOrgId] = useState(() => {
    const rand = Math.floor(100000 + Math.random() * 900000);
    return `ORG-${rand}`;
  });
  
  const { register, handleSubmit, formState: { errors } } = useForm<ProvisionFormValues>({
    defaultValues: { 
      seatLimit: 100,
      organizationId: generatedOrgId,
      organizationType: 'hospital'
    }
  });

  const handleFormSubmit = async (data: ProvisionFormValues) => {
    setIsSubmitting(true);
    setApiError('');
    try {
      const response = await fetch(apiUrl('/api/superadmin/organizations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...data, 
          servicePlan, 
          logo, 
          activeStartDate,
          activeEndDate: activeEndDate || null
        })
      });
      const result = await response.json();
      if (!response.ok) {
        setApiError(result.message || 'Failed to provision organization');
      } else {
        onSubmit();
      }
    } catch (err) {
      setApiError('Network error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col h-full animate-in fade-in duration-300">
      
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto pb-32">
        {/* Breadcrumbs & Header */}
        <div className="mb-8">
          <div className="flex items-center text-sm font-bold text-gray-500 mb-2">
            <span className="hover:text-gray-900 cursor-pointer" onClick={onCancel}>Organizations</span>
            <ChevronRight className="w-4 h-4 mx-2" />
            <span className="text-gray-900">Provision New Account</span>
          </div>
          <h2 className="text-2xl font-bold text-[#004f5e] mb-2">Provision Organization Account</h2>
          <p className="text-sm text-gray-500 max-w-xl">
            Initialize a new medical facility within the <span className="text-black">doze</span><span className="text-[#0097b2]">mate</span> ecosystem. This process generates secure credentials and sets primary operational parameters.
          </p>
        </div>

        {apiError && (
          <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
            {apiError}
          </div>
        )}

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* LEFT COLUMN */}
          <div className="space-y-8">
            
            {/* Organization Details Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center mb-6">
                <Building2 className="w-5 h-5 text-[#007b90] mr-3" />
                <h3 className="text-sm font-bold text-[#004f5e]">Organization Details</h3>
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Organization Name</label>
                    <input 
                      type="text" 
                      {...register('orgName', { required: 'Organization name is required' })}
                      placeholder="e.g. St. Mary's Medical Center"
                      className="w-full bg-[#f8fafc] border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                    />
                    {errors.orgName && <p className="mt-1 text-xs text-red-500">{errors.orgName.message}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Organization Type</label>
                    <select 
                      {...register('organizationType')}
                      className="w-full bg-[#f8fafc] border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90] appearance-none"
                    >
                      <option value="hospital">Hospital</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">Physical Address</label>
                  <textarea 
                    rows={3}
                    {...register('address')}
                    placeholder="Street, City, Zip Code"
                    className="w-full bg-[#f8fafc] border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90] resize-none"
                  ></textarea>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Website URL</label>
                    <input 
                      type="url" 
                      {...register('website')}
                      placeholder="https://www.organization.org"
                      className="w-full bg-[#f8fafc] border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Organization ID</label>
                    <input 
                      type="text" 
                      {...register('organizationId', { required: 'Organization ID is required' })}
                      readOnly
                      className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none cursor-not-allowed text-gray-500 font-mono"
                    />
                    {errors.organizationId && <p className="mt-1 text-xs text-red-500">{errors.organizationId.message}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Administrative Contact Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center mb-6">
                <User className="w-5 h-5 text-[#007b90] mr-3" />
                <h3 className="text-sm font-bold text-[#004f5e]">Administrative Contact</h3>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">Full Name</label>
                  <input 
                    type="text" 
                    {...register('adminName', { required: 'Admin name is required' })}
                    placeholder="Dr. Jane Smith"
                    className="w-full bg-[#f8fafc] border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                  />
                  {errors.adminName && <p className="mt-1 text-xs text-red-500">{errors.adminName.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Official Email (@organization.org)</label>
                    <input 
                      type="email" 
                      {...register('adminEmail', { required: 'Email is required' })}
                      placeholder="jane.smith@organization.org"
                      className="w-full bg-[#f8fafc] border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                    />
                    {errors.adminEmail && <p className="mt-1 text-xs text-red-500">{errors.adminEmail.message}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Direct Phone</label>
                    <input 
                      type="tel" 
                      {...register('adminPhone')}
                      placeholder="+1 (555) 000-0000"
                      className="w-full bg-[#f8fafc] border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-8">
            
            {/* Account Configuration Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center mb-6">
                <Settings className="w-5 h-5 text-[#007b90] mr-3" />
                <h3 className="text-sm font-bold text-[#004f5e]">Account Configuration</h3>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-3">Service Plan & Active Period</label>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {/* Custom Date selection Plan Option */}
                    <div 
                      onClick={() => setServicePlan('custom')}
                      className={`text-left p-4 rounded-lg border-2 transition-all cursor-pointer ${
                        servicePlan === 'custom' 
                          ? 'border-[#007b90] bg-[#eaf4f6]' 
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="font-bold text-gray-900 mb-1">Date Selection</div>
                      <div className="mt-1">
                        <select
                          value={customMonths}
                          onChange={(e) => {
                            e.stopPropagation();
                            setCustomMonths(Number(e.target.value));
                          }}
                          className="bg-white border border-gray-305 rounded text-xs px-2 py-0.5 outline-none text-gray-700 font-bold"
                        >
                          <option value="1">1 Month</option>
                          <option value="2">2 Months</option>
                          <option value="3">3 Months</option>
                        </select>
                      </div>
                    </div>
                    
                    {/* Annual Plan Option */}
                    <button 
                      type="button"
                      onClick={() => setServicePlan('annual')}
                      className={`text-left p-4 rounded-lg border-2 transition-all ${
                        servicePlan === 'annual' 
                          ? 'border-[#007b90] bg-[#eaf4f6]' 
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="font-bold text-gray-900 mb-1">Annual Period</div>
                      <div className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">1 Year</div>
                    </button>
                  </div>

                  {/* Active Period Date Pickers */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">Start Date</label>
                      <input 
                        type="date"
                        min={new Date().toISOString().split('T')[0]}
                        value={activeStartDate}
                        onChange={(e) => setActiveStartDate(e.target.value)}
                        className="w-full bg-[#f8fafc] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">End Date (Auto)</label>
                      <input 
                        type="date"
                        readOnly
                        value={activeEndDate}
                        className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none cursor-not-allowed text-gray-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">Initial Seat Limit</label>
                  <div className="flex items-center space-x-4">
                    <div className="relative w-32">
                      <input 
                        type="number" 
                        {...register('seatLimit', { required: 'Seat limit is required', valueAsNumber: true })}
                        className="w-full bg-[#f8fafc] border border-gray-200 rounded-lg pl-4 pr-10 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90]"
                      />
                      <ChevronsUpDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <span className="text-sm text-gray-600">Clinical Seats</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">Organization Logo</label>
                  <input
                    type="file"
                    accept="image/*"
                    id="org-logo-upload"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  {logo ? (
                    <div className="flex items-center space-x-4 p-3 bg-[#f8fafc] border border-gray-200 rounded-xl">
                      <div className="w-16 h-16 rounded border border-gray-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                        <img src={apiUrl(logo)} alt="Organization Logo" className="w-full h-full object-contain" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">Logo Uploaded</p>
                        <button
                          type="button"
                          onClick={() => setLogo('')}
                          className="mt-1 text-xs text-red-500 hover:text-red-700 font-bold"
                        >
                          Remove Logo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor="org-logo-upload"
                      className="border-2 border-dashed border-gray-200 bg-[#f8fafc] rounded-xl p-6 flex flex-col items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer group"
                    >
                      <CloudUpload className="w-8 h-8 text-gray-400 mb-2 group-hover:text-[#007b90] transition-colors" />
                      <div className="text-sm font-medium text-gray-600 mb-0.5">
                        {uploadingLogo ? 'Uploading...' : 'Click to upload logo'}
                      </div>
                    </label>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Fixed Footer Action Bar */}
      <div className="fixed bottom-0 left-56 right-0 bg-white border-t border-gray-200 p-6 flex justify-between items-center z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex items-center text-sm font-bold text-gray-700">
          <Info className="w-5 h-5 text-blue-500 mr-3" />
          Provisioning will trigger an automated onboarding email to the admin.
        </div>
        <div className="flex items-center space-x-6">
          <button 
            type="button"
            onClick={onCancel}
            className="text-sm font-bold text-[#004f5e] hover:text-[#007b90] transition-colors"
          >
            Cancel
          </button>
          <button 
            type="submit"
            disabled={isSubmitting}
            className="bg-[#004f5e] hover:bg-[#003d4a] text-white px-8 py-3 rounded-lg text-sm font-bold transition-colors shadow-sm flex items-center disabled:opacity-70"
          >
            <Hospital className="w-4 h-4 mr-2" />
            {isSubmitting ? 'Creating...' : 'Create Organization Account'}
          </button>
        </div>
      </div>

      <ImageCropperModal 
        src={tempImageSrc} 
        isOpen={isCropOpen} 
        onClose={() => setIsCropOpen(false)} 
        onCrop={handleCropSave} 
      />
    </form>
  );
}
