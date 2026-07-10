import DashboardLayout from '@/components/layout/DashboardLayout';
import { ChevronRight, Building2, Camera, ShieldCheck, AlertTriangle, CloudUpload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUserProfile, uploadOrganizationLogo, updateOrganizationDetails } from '@/services/deviceService';
import { apiUrl } from '@/services/api';
import ImageCropperModal from '@/components/common/ImageCropperModal';

export default function OrganizationProfile() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    contactNumber: '',
    pincode: '',
    address: '',
  });
  
  const [logo, setLogo] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [tempImageSrc, setTempImageSrc] = useState('');
  const [isCropOpen, setIsCropOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
 
  const { data: profile } = useQuery({
    queryKey: ['user_profile'],
    queryFn: getUserProfile,
    staleTime: 60000 * 5,
  });
 
  const organization = profile?.account?.organizationId;
 
  useEffect(() => {
    if (organization) {
      setFormData({
        name: organization.name || '',
        email: organization.email || '',
        contactNumber: organization.contactNumber || '',
        pincode: organization.pincode || '',
        address: organization.address || '',
      });
      setLogo(organization.logo || '');
    }
  }, [organization]);

  const updateOrgMutation = useMutation({
    mutationFn: (data: any) => updateOrganizationDetails(organization._id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_profile'] });
      setSuccessMsg('Organization profile updated successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to update organization');
      setTimeout(() => setErrorMsg(''), 5000);
    }
  });

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Image size must be less than 2 MB');
      setTimeout(() => setErrorMsg(''), 5000);
      e.target.value = '';
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
    setErrorMsg('');
    try {
      const croppedFile = new File([croppedBlob], 'logo.png', { type: 'image/png' });
      const logoUrl = await uploadOrganizationLogo(croppedFile);
      setLogo(logoUrl);
      setSuccessMsg('Logo uploaded successfully. Save changes to persist.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to upload logo');
      setTimeout(() => setErrorMsg(''), 5000);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveOrganization = () => {
    if (!organization?._id) return;
    if (formData.name.trim() === '') {
      setErrorMsg('Organization name is required');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    updateOrgMutation.mutate({
      name: formData.name,
      email: formData.email,
      contactNumber: formData.contactNumber,
      pincode: formData.pincode,
      address: formData.address,
      logo
    });
  };

  const logoPreview = logo && !logo.includes('default-org-logo.png')
    ? apiUrl(logo)
    : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(formData.name || 'Organization') + '&background=0097b2&color=fff&size=200';

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-8">
        
        {/* Top Breadcrumb */}
        <div className="flex items-center text-xs font-bold text-gray-500 mb-6">
          <Link to="/settings" className="hover:text-gray-900 transition-colors">Settings</Link>
          <ChevronRight className="w-3 h-3 mx-2" />
          <span className="text-[#007b90]">Organization Profile</span>
        </div>

        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Organization Profile</h1>
          <p className="text-sm text-gray-500 font-medium">
            Manage your institution's profile details, identity logo, accent styling, and seat allocations.
          </p>
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm flex items-center">
            <AlertTriangle className="w-4 h-4 mr-2" />
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center">
            <ShieldCheck className="w-4 h-4 mr-2" />
            {successMsg}
          </div>
        )}

        {/* Main Grid Layout */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8 items-stretch">
          
          {/* Left Column (Details Form) */}
          <div className="flex-1 flex flex-col">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex-1">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center">
                  <Building2 className="w-5 h-5 text-[#007b90] mr-3" />
                  <h2 className="text-lg font-bold text-gray-900">Organization Details</h2>
                </div>
                <button 
                  onClick={handleSaveOrganization}
                  disabled={updateOrgMutation.isPending}
                  className="bg-[#007b90] hover:bg-[#006070] text-white px-5 py-2.5 rounded-lg text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
                >
                  {updateOrgMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Organization Name</label>
                    <input 
                      type="text" 
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      className="w-full bg-gray-50 border-none rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-[#007b90]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Contact Number</label>
                    <input 
                      type="text" 
                      name="contactNumber"
                      value={formData.contactNumber}
                      onChange={handleChange}
                      className="w-full bg-gray-50 border-none rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-[#007b90]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Primary Email</label>
                    <input 
                      type="email" 
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full bg-gray-50 border-none rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-[#007b90]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Pincode</label>
                    <input 
                      type="text" 
                      name="pincode"
                      value={formData.pincode}
                      onChange={handleChange}
                      className="w-full bg-gray-50 border-none rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-[#007b90]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">Physical Address</label>
                  <textarea 
                    name="address"
                    rows={4}
                    value={formData.address}
                    onChange={handleChange}
                    className="w-full bg-gray-50 border-none rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-[#007b90] resize-none"
                  ></textarea>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (Branding & Logo) */}
          <div className="w-full lg:w-[340px] shrink-0 flex flex-col space-y-6">
            
            {/* Branding Logo Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col items-center">
              <h2 className="text-sm font-bold text-gray-900 self-start mb-6 uppercase tracking-wider">Identity & Logo</h2>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/png, image/jpeg, image/jpg" 
                className="hidden" 
              />
              
              <div 
                onClick={handleImageClick}
                className="relative w-36 h-36 rounded-2xl overflow-hidden mb-4 border border-gray-200 group cursor-pointer bg-gray-50 flex items-center justify-center shadow-sm"
              >
                <img 
                  src={logoPreview} 
                  alt="Organization Logo" 
                  className="w-full h-full object-contain p-2"
                />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-6 h-6 text-white" />
                </div>
                <div className="absolute bottom-2 right-2 bg-[#007b90] w-8 h-8 rounded-lg flex items-center justify-center border-2 border-white shadow-sm">
                  <Camera className="w-4 h-4 text-white" />
                </div>
              </div>
              
              <span className="text-[10px] font-bold text-gray-400 mb-6 text-center leading-relaxed">
                {uploadingLogo ? 'Uploading logo file...' : 'PNG or JPG. Minimum size 200x200px (Max 2MB).'}
              </span>

              <button
                type="button"
                onClick={handleImageClick}
                disabled={uploadingLogo}
                className="w-full py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 transition-colors flex items-center justify-center"
              >
                <CloudUpload className="w-4 h-4 mr-2 text-gray-500" />
                Upload New Logo
              </button>
            </div>

            {/* Service Details Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Subscription Allocation</h3>
                
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-gray-500">Service Plan:</span>
                  <span className="font-bold text-[#007b90] uppercase tracking-wide bg-teal-50 px-2 py-0.5 rounded text-xs">
                    {organization?.servicePlan || 'Trial'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-gray-500">Clinical Seat Limit:</span>
                  <span className="font-bold text-gray-900 font-mono">
                    {organization?.seatLimit || 100} Seats
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
      <ImageCropperModal 
        src={tempImageSrc} 
        isOpen={isCropOpen} 
        onClose={() => setIsCropOpen(false)} 
        onCrop={handleCropSave} 
      />
    </DashboardLayout>
  );
}
