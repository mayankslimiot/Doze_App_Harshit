import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  User, Camera, Mail, ShieldCheck, AlertTriangle, 
  Lock, Weight, Loader2, Eye, EyeOff
} from 'lucide-react';
import { getUserProfile, updateUserProfile, uploadProfileImage, updateUserPassword } from '@/services/deviceService';
import { apiUrl } from '@/services/api';
import ImageCropperModal from '../common/ImageCropperModal';

export default function AdminProfileView() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile data
  const { data: profile, isLoading } = useQuery({
    queryKey: ['user_profile'],
    queryFn: getUserProfile,
    staleTime: 60000 * 5, // 5 minutes
  });

  // State fields
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('prefer-not-to-say');
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState('kg');
  const [height, setHeight] = useState('');
  const [heightUnit, setHeightUnit] = useState('ft_in');
  const [waist, setWaist] = useState('');
  const [waistUnit, setWaistUnit] = useState('in');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState('');
  const [isCropOpen, setIsCropOpen] = useState(false);

  // Notifications
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Populate state when profile loads
  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setMobile(profile.mobile ? String(profile.mobile) : '');
      if (profile.dateOfBirth) {
        // Format ISO date to YYYY-MM-DD for input field
        const d = new Date(profile.dateOfBirth);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        setDob(`${yyyy}-${mm}-${dd}`);
      } else {
        setDob('');
      }
      setGender(profile.gender || 'prefer-not-to-say');
      setWeight(profile.weight ? String(profile.weight) : '');
      setWeightUnit(profile.weightUnit || 'kg');
      setHeight(profile.height ? String(profile.height) : '');
      setHeightUnit(profile.heightUnit || 'ft_in');
      setWaist(profile.waist ? String(profile.waist) : '');
      setWaistUnit(profile.waistUnit || 'in');
      setAddress(profile.address || '');
      setPincode(profile.pincode ? String(profile.pincode) : '');
    }
  }, [profile]);

  // Mutations
  const updateProfileMutation = useMutation({
    mutationFn: updateUserProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_profile'] });
      setSuccessMsg('Profile details updated successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to update profile');
      setTimeout(() => setErrorMsg(''), 5000);
    }
  });

  const uploadImageMutation = useMutation({
    mutationFn: uploadProfileImage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_profile'] });
      setSuccessMsg('Profile image updated successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to upload image');
      setTimeout(() => setErrorMsg(''), 5000);
    }
  });

  const updatePasswordMutation = useMutation({
    mutationFn: updateUserPassword,
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMsg('Password updated successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to update password');
      setTimeout(() => setErrorMsg(''), 5000);
    }
  });

  // Action handlers
  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Image size must be less than 5 MB');
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

  const handleCropSave = (croppedBlob: Blob) => {
    setIsCropOpen(false);
    const croppedFile = new File([croppedBlob], 'profile.png', { type: 'image/png' });
    uploadImageMutation.mutate(croppedFile);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() === '') {
      setErrorMsg('Name cannot be empty');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    const payload: any = {
      name: name.trim(),
      mobile: mobile ? Number(mobile) : null,
      dateOfBirth: dob ? new Date(dob).toISOString() : null,
      gender,
      weight: weight ? Number(weight) : null,
      weightUnit,
      height: height ? Number(height) : null,
      heightUnit,
      waist: waist ? Number(waist) : null,
      waistUnit,
      address: address.trim(),
      pincode: pincode ? Number(pincode) : null,
    };

    updateProfileMutation.mutate(payload);
  };

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMsg('All password fields are required');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('New passwords do not match');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg('New password must be at least 6 characters');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    updatePasswordMutation.mutate({
      currentPassword,
      newPassword
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 text-[#007b90] animate-spin mb-4" />
        <p className="text-gray-500 font-medium text-sm">Loading profile details...</p>
      </div>
    );
  }

  const profileImageUrl = profile?.profileImage && !profile.profileImage.includes('default') 
    ? apiUrl(profile.profileImage) 
    : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name || 'Super Admin') + '&background=0097b2&color=fff&size=200';

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Title Header */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-[#007b90]">Super Admin Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Manage global controller details, security credentials, and body metric settings.</p>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm flex items-center shadow-sm">
          <AlertTriangle className="w-4.5 h-4.5 mr-3 shrink-0" />
          <span className="font-medium">{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm flex items-center shadow-sm">
          <ShieldCheck className="w-4.5 h-4.5 mr-3 shrink-0" />
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column - General & Body Metrics Form (Span 2) */}
        <div className="lg:col-span-2 space-y-8">
          <form onSubmit={handleSaveProfile} className="space-y-8">
            
            {/* General Info Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex items-center space-x-3 border-b border-gray-100 pb-4">
                <div className="p-2 bg-[#eaf4f6] text-[#007b90] rounded-lg">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">General Information</h2>
                  <p className="text-xs text-gray-500">Your basic administrator identity details.</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-8 items-start">
                {/* Photo Upload Section */}
                <div className="flex flex-col items-center shrink-0 w-full sm:w-auto">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/png, image/jpeg, image/jpg" 
                    className="hidden" 
                  />
                  <div 
                    onClick={handleImageClick}
                    className="relative w-36 h-36 rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 group cursor-pointer flex items-center justify-center hover:shadow-md transition-all duration-300"
                  >
                    <img 
                      src={profileImageUrl} 
                      alt="Super Admin Avatar" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-8 h-8 text-white" />
                    </div>
                    {/* Small camera icon bubble */}
                    <div className="absolute bottom-2.5 right-2.5 bg-[#007b90] w-8 h-8 rounded-lg flex items-center justify-center border-2 border-white shadow-sm hover:scale-105 transition-transform">
                      <Camera className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium mt-3">JPG/PNG. Max 5MB.</span>
                </div>

                {/* Form Fields */}
                <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Full Name</label>
                    <input 
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="e.g. John Doe"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90] focus:bg-white transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Gender</label>
                    <select 
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90] focus:bg-white transition-colors"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer-not-to-say">Prefer Not to Say</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Date of Birth</label>
                    <div className="relative">
                      <input 
                        type="date" 
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90] focus:bg-white transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Role</label>
                    <input 
                      type="text" 
                      value="Global Super Admin" 
                      disabled
                      className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500 cursor-not-allowed font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Details Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex items-center space-x-3 border-b border-gray-100 pb-4">
                <div className="p-2 bg-[#eaf4f6] text-[#007b90] rounded-lg">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Contact Details</h2>
                  <p className="text-xs text-gray-500">Manage how the system communicating alerts and notices to you.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Admin Email</label>
                  <input 
                    type="email" 
                    value={profile?.email || ''} 
                    disabled
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500 cursor-not-allowed font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Mobile Number</label>
                  <input 
                    type="tel" 
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter mobile number"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90] focus:bg-white transition-colors"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Address</label>
                  <textarea 
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Enter physical address"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90] focus:bg-white transition-colors resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Pincode</label>
                  <input 
                    type="text" 
                    value={pincode}
                    maxLength={10}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 110001"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90] focus:bg-white transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Body Metrics Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex items-center space-x-3 border-b border-gray-100 pb-4">
                <div className="p-2 bg-[#eaf4f6] text-[#007b90] rounded-lg">
                  <Weight className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Body Metrics & Configuration</h2>
                  <p className="text-xs text-gray-500">Configure your body health metadata parameters.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                
                {/* Weight Field */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Weight</label>
                  <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-gray-50 focus-within:ring-1 focus-within:ring-[#007b90] focus-within:border-[#007b90] focus-within:bg-white transition-colors">
                    <input 
                      type="number" 
                      step="0.1"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="Weight"
                      className="w-full bg-transparent border-none px-4 py-3 text-sm text-gray-900 focus:outline-none"
                    />
                    <select 
                      value={weightUnit}
                      onChange={(e) => setWeightUnit(e.target.value)}
                      className="bg-white border-l border-gray-200 text-xs font-bold text-gray-600 px-3 focus:outline-none"
                    >
                      <option value="kg">KG</option>
                      <option value="lbs">LBS</option>
                    </select>
                  </div>
                </div>

                {/* Height Field */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Height</label>
                  <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-gray-50 focus-within:ring-1 focus-within:ring-[#007b90] focus-within:border-[#007b90] focus-within:bg-white transition-colors">
                    <input 
                      type="number" 
                      step="0.01"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      placeholder={heightUnit === 'ft_in' ? 'e.g. 5.9' : 'Height'}
                      className="w-full bg-transparent border-none px-4 py-3 text-sm text-gray-900 focus:outline-none"
                    />
                    <select 
                      value={heightUnit}
                      onChange={(e) => setHeightUnit(e.target.value)}
                      className="bg-white border-l border-gray-200 text-xs font-bold text-gray-600 px-3 focus:outline-none"
                    >
                      <option value="ft_in">FT</option>
                      <option value="cm">CM</option>
                      <option value="m">M</option>
                    </select>
                  </div>
                </div>

                {/* Waist Field */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Waist Size</label>
                  <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-gray-50 focus-within:ring-1 focus-within:ring-[#007b90] focus-within:border-[#007b90] focus-within:bg-white transition-colors">
                    <input 
                      type="number" 
                      step="0.1"
                      value={waist}
                      onChange={(e) => setWaist(e.target.value)}
                      placeholder="Waist"
                      className="w-full bg-transparent border-none px-4 py-3 text-sm text-gray-900 focus:outline-none"
                    />
                    <select 
                      value={waistUnit}
                      onChange={(e) => setWaistUnit(e.target.value)}
                      className="bg-white border-l border-gray-200 text-xs font-bold text-gray-600 px-3 focus:outline-none"
                    >
                      <option value="in">IN</option>
                      <option value="cm">CM</option>
                    </select>
                  </div>
                </div>

              </div>
            </div>

            {/* Save Buttons Bar */}
            <div className="flex justify-end space-x-3">
              <button 
                type="submit" 
                disabled={updateProfileMutation.isPending}
                className="bg-[#007b90] hover:bg-[#00687a] text-white px-6 py-3 rounded-xl text-sm font-bold shadow-sm transition-all duration-150 disabled:opacity-50 flex items-center"
              >
                {updateProfileMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Profile Details
              </button>
            </div>

          </form>
        </div>

        {/* Right Column - Security & Password Change Card */}
        <div className="space-y-8">
          
          {/* Change Password Card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center space-x-3 border-b border-gray-100 pb-4">
              <div className="p-2 bg-[#eaf4f6] text-[#007b90] rounded-lg">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Security & Credentials</h2>
                <p className="text-xs text-gray-500">Regularly update your super admin credentials.</p>
              </div>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              {/* Current Password */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Current Password</label>
                <div className="relative">
                  <input 
                    type={showCurrentPass ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-10 py-3 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90] focus:bg-white transition-colors"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">New Password</label>
                <div className="relative">
                  <input 
                    type={showNewPass ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-10 py-3 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90] focus:bg-white transition-colors"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Confirm New Password</label>
                <div className="relative">
                  <input 
                    type={showConfirmPass ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-10 py-3 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#007b90] focus:border-[#007b90] focus:bg-white transition-colors"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Save Password Button */}
              <button 
                type="submit" 
                disabled={updatePasswordMutation.isPending}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-xl text-sm font-bold shadow-sm transition-all duration-150 disabled:opacity-50 flex items-center justify-center mt-6"
              >
                {updatePasswordMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Change Password
              </button>
            </form>
          </div>

        </div>

      </div>
      <ImageCropperModal 
        src={tempImageSrc} 
        isOpen={isCropOpen} 
        onClose={() => setIsCropOpen(false)} 
        onCrop={handleCropSave} 
      />
    </div>
  );
}
