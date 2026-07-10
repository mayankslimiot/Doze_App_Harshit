import DashboardLayout from '@/components/layout/DashboardLayout';
import { ChevronRight, User, Camera, Mail, Phone, ShieldCheck, Shield, AlertTriangle, Key, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUserProfile, updateUserProfile, uploadProfileImage, deleteUserProfile } from '@/services/deviceService';
import { apiUrl } from '@/services/api';
import ImageCropperModal from '@/components/common/ImageCropperModal';

export default function AccountProfile() {
  const [nameInput, setNameInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState('');
  const [isCropOpen, setIsCropOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Password States & Submit logic
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters long');
      return;
    }

    setPasswordSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/user/profile/password'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json();
      if (res.ok) {
        setPasswordSuccess('Password updated successfully!');
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        
        setTimeout(() => {
          setShowPasswordModal(false);
          setPasswordSuccess(null);
          window.location.reload();
        }, 1500);
      } else {
        setPasswordError(data.message || 'Failed to update password');
      }
    } catch (err) {
      console.error('Change password error:', err);
      setPasswordError('Server error while updating password');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  // Handover States & Submit logic
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [handoverNewEmail, setHandoverNewEmail] = useState('');
  const [handoverCurrentOtp, setHandoverCurrentOtp] = useState('');
  const [handoverNewOtp, setHandoverNewOtp] = useState('');
  const [handoverStep, setHandoverStep] = useState<'request' | 'verify'>('request');
  const [handoverError, setHandoverError] = useState<string | null>(null);
  const [handoverSuccess, setHandoverSuccess] = useState<string | null>(null);
  const [handoverLoading, setHandoverLoading] = useState(false);

  const handleRequestHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    setHandoverError(null);
    setHandoverSuccess(null);
    if (!handoverNewEmail.trim()) {
      setHandoverError('Please enter a target email address.');
      return;
    }

    setHandoverLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/user/handover/request'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ newEmail: handoverNewEmail.trim() })
      });

      const data = await res.json();
      if (res.ok) {
        setHandoverStep('verify');
        setHandoverSuccess('Verification codes sent to current and target emails.');
        setTimeout(() => setHandoverSuccess(null), 4000);
      } else {
        setHandoverError(data.message || 'Failed to request handover.');
      }
    } catch (err) {
      console.error('Handover request error:', err);
      setHandoverError('Server error while requesting account handover.');
    } finally {
      setHandoverLoading(false);
    }
  };

  const handleVerifyHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    setHandoverError(null);
    setHandoverSuccess(null);
    if (!handoverCurrentOtp.trim() || !handoverNewOtp.trim()) {
      setHandoverError('Please enter both verification codes.');
      return;
    }

    setHandoverLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/user/handover/verify'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentOtp: handoverCurrentOtp.trim(),
          newOtp: handoverNewOtp.trim()
        })
      });

      const data = await res.json();
      if (res.ok) {
        setHandoverSuccess('Account handed over successfully!');
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
        setHandoverNewEmail('');
        setHandoverCurrentOtp('');
        setHandoverNewOtp('');
        setHandoverStep('request');
        
        setTimeout(() => {
          setShowHandoverModal(false);
          setHandoverSuccess(null);
          window.location.reload();
        }, 1500);
      } else {
        setHandoverError(data.message || 'Verification failed. Please check the codes.');
      }
    } catch (err) {
      console.error('Handover verify error:', err);
      setHandoverError('Server error during verification.');
    } finally {
      setHandoverLoading(false);
    }
  };

  const { data: profile } = useQuery({
    queryKey: ['user_profile'],
    queryFn: getUserProfile,
    staleTime: 60000 * 5, // 5 minutes
  });

  useEffect(() => {
    if (profile?.name) setNameInput(profile.name);
  }, [profile?.name]);

  const updateProfileMutation = useMutation({
    mutationFn: updateUserProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_profile'] });
      setSuccessMsg('Profile updated successfully!');
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

  const deleteAccountMutation = useMutation({
    mutationFn: deleteUserProfile,
    onSuccess: () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to delete account');
      setShowDeleteDialog(false);
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
      e.target.value = ''; // Reset
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setTempImageSrc(reader.result as string);
      setIsCropOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset
  };

  const handleCropSave = (croppedBlob: Blob) => {
    setIsCropOpen(false);
    const croppedFile = new File([croppedBlob], 'profile.png', { type: 'image/png' });
    uploadImageMutation.mutate(croppedFile);
  };

  const handleSaveProfile = () => {
    if (nameInput.trim() === '') {
      setErrorMsg('Name cannot be empty');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }
    updateProfileMutation.mutate({ name: nameInput });
  };

  const isViewer = profile?.role === 'viewer';
  const fullName = profile?.name || 'Dr. Sarah Jenkins';
  const email = profile?.email || '';
  const profileImage = profile?.profileImage && !profile.profileImage.includes('default') 
    ? apiUrl(profile.profileImage) 
    : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(fullName) + '&background=0097b2&color=fff&size=200';

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-8">
        
        {/* Top Breadcrumb */}
        <div className="flex items-center text-xs font-bold text-gray-500 mb-6">
          <Link to="/settings" className="hover:text-gray-900 transition-colors">Settings</Link>
          <ChevronRight className="w-3 h-3 mx-2" />
          <span className="text-[#007b90]">Account & Profile</span>
        </div>

        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Account & Profile</h1>
          <p className="text-sm text-gray-500">
            {isViewer 
              ? "View your credentials, details and manage your profile image."
              : "Manage your clinical credentials, contact information, and workspace preferences."}
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
          
          {/* Left Column (Broader) */}
          <div className="flex-1 flex flex-col">
            
            {/* Profile Information Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex-1">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center">
                  <User className="w-5 h-5 text-[#007b90] mr-3" />
                  <h2 className="text-lg font-bold text-gray-900">Profile Information</h2>
                </div>
                {!isViewer && (
                  <button 
                    onClick={handleSaveProfile}
                    disabled={updateProfileMutation.isPending}
                    className="bg-teal-50 hover:bg-teal-100 text-[#007b90] px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-8">
                {/* Avatar Section */}
                <div className="shrink-0 flex flex-col items-center relative">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/png, image/jpeg, image/jpg" 
                    className="hidden" 
                  />
                  <div 
                    onClick={handleImageClick}
                    className={`relative w-32 h-32 rounded-xl overflow-hidden mb-3 border border-gray-200 group cursor-pointer bg-gray-100 flex items-center justify-center ${uploadImageMutation.isPending ? 'opacity-50' : ''}`}
                  >
                    <img 
                      src={profileImage} 
                      alt="Profile Avatar" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                    {/* Small camera icon bubble in bottom right as shown in design */}
                    <div className="absolute bottom-2 right-2 bg-[#007b90] w-8 h-8 rounded-lg flex items-center justify-center border-2 border-white shadow-sm">
                      <Camera className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-gray-400">JPG or PNG. Max 2MB.</span>
                </div>

                {/* Form Fields Section */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Full Name</label>
                    <input 
                      type="text" 
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      disabled={isViewer}
                      className={`w-full border-none rounded-lg px-4 py-3 text-sm ${isViewer ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-gray-50 text-gray-900 focus:ring-1 focus:ring-[#007b90]'}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Clinical Title</label>
                    <input 
                      type="text" 
                      defaultValue="" 
                      placeholder={isViewer ? "Not applicable" : "Enter clinical title"}
                      disabled={isViewer}
                      className={`w-full border-none rounded-lg px-4 py-3 text-sm ${isViewer ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-gray-50 text-gray-900 focus:ring-1 focus:ring-[#007b90]'}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Department</label>
                    <input 
                      type="text" 
                      defaultValue="" 
                      placeholder={isViewer ? "Not applicable" : "Enter department"}
                      disabled={isViewer}
                      className={`w-full border-none rounded-lg px-4 py-3 text-sm ${isViewer ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-gray-50 text-gray-900 focus:ring-1 focus:ring-[#007b90]'}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">NPI Number</label>
                    <input 
                      type="text" 
                      defaultValue="" 
                      placeholder={isViewer ? "Not applicable" : "Enter NPI number"}
                      disabled={isViewer}
                      className={`w-full border-none rounded-lg px-4 py-3 text-sm font-mono ${isViewer ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-gray-50 text-gray-900 focus:ring-1 focus:ring-[#007b90]'}`}
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column (Narrower) */}
          <div className="w-full lg:w-[340px] shrink-0 flex flex-col space-y-6">
            
            {/* Contact Details Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center mb-6">
                <User className="w-5 h-5 text-[#007b90] mr-3" />
                <h2 className="text-lg font-bold text-gray-900">Contact Details</h2>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">Work Email</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-4 w-4 text-gray-400" />
                    </div>
                    <input 
                      type="email" 
                      defaultValue={email} 
                      disabled
                      className="block w-full pl-10 bg-gray-100 border-none rounded-lg py-3 text-sm text-gray-500 cursor-not-allowed"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">Organization Extension</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone className="h-4 w-4 text-gray-400" />
                    </div>
                    <input 
                      type="text" 
                      defaultValue={profile?.mobile ? `+${profile.countryCode || '1'} ${profile.mobile}` : ''}
                      placeholder="No number recorded"
                      disabled
                      className="block w-full pl-10 bg-gray-100 border-none rounded-lg py-3 text-sm text-gray-500 cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Account Management Card */}
            {!isViewer && (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center mb-6">
                  <Shield className="w-5 h-5 text-[#007b90] mr-3" />
                  <h2 className="text-lg font-bold text-gray-900">Account Management</h2>
                </div>

                <div className="space-y-3 mb-8">
                  {/* Change Password row */}
                  <button 
                    type="button"
                    onClick={() => setShowPasswordModal(true)}
                    className="w-full flex items-center justify-between p-4 border border-gray-100 rounded-lg hover:border-gray-200 hover:bg-gray-50 transition-colors group text-left"
                  >
                    <div className="flex items-center">
                      <Key className="w-5 h-5 text-gray-400 mr-3 group-hover:text-gray-600 transition-colors" />
                      <div className="text-left">
                        <div className="text-sm font-bold text-gray-900">Change Password</div>
                        <div className="text-[10px] font-bold text-[#0097b2]">Click to update password</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </button>

                  {/* Handover Account row */}
                  <button 
                    type="button"
                    onClick={() => setShowHandoverModal(true)}
                    className="w-full flex items-center justify-between p-4 border border-gray-100 rounded-lg hover:border-gray-200 hover:bg-gray-50 transition-colors group text-left"
                  >
                    <div className="flex items-center">
                      <User className="w-5 h-5 text-gray-400 mr-3 group-hover:text-gray-600 transition-colors" />
                      <div className="text-left">
                        <div className="text-sm font-bold text-gray-900">Handover Account</div>
                        <div className="text-[10px] font-bold text-[#0097b2]">Transfer ownership to another email</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </button>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-red-600 mb-3">Danger Zone</h3>
                  <button 
                    onClick={() => setShowDeleteDialog(true)}
                    className="w-full flex items-center justify-center p-3 border border-red-200 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Account
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* Custom Delete Account Popup Overlay */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Account</h3>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to delete your account? This action cannot be undone and you will lose all your profile data.
              </p>
              
              <div className="flex flex-col w-full gap-3 sm:flex-row">
                <button 
                  onClick={() => setShowDeleteDialog(false)}
                  disabled={deleteAccountMutation.isPending}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => deleteAccountMutation.mutate()}
                  disabled={deleteAccountMutation.isPending}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center"
                >
                  {deleteAccountMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowPasswordModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <Key className="w-5 h-5 text-[#007b90] mr-2" />
              Change Password
            </h3>

            {passwordError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-semibold flex items-center">
                <AlertTriangle className="w-4 h-4 mr-2 shrink-0" />
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="mb-4 p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs font-semibold flex items-center animate-fade-in">
                <ShieldCheck className="w-4 h-4 mr-2 shrink-0 text-teal-600" />
                {passwordSuccess}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Current Password</label>
                <input 
                  type="password" 
                  required
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] transition-all"
                  placeholder="Enter current password"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">New Password</label>
                <input 
                  type="password" 
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] transition-all"
                  placeholder="At least 6 characters"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Confirm New Password</label>
                <input 
                  type="password" 
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] transition-all"
                  placeholder="Re-enter new password"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button 
                  type="button" 
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 font-bold rounded-lg text-sm text-gray-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={passwordSubmitting}
                  className="px-5 py-2 bg-[#0097b2] hover:bg-[#00829a] text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center justify-center cursor-pointer"
                >
                  {passwordSubmitting ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Handover Account Modal */}
      {showHandoverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowHandoverModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <User className="w-5 h-5 text-[#007b90] mr-2" />
              Handover Account Ownership
            </h3>

            {handoverError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-semibold flex items-center">
                <AlertTriangle className="w-4 h-4 mr-2 shrink-0" />
                {handoverError}
              </div>
            )}

            {handoverSuccess && (
              <div className="mb-4 p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs font-semibold flex items-center animate-fade-in">
                <ShieldCheck className="w-4 h-4 mr-2 shrink-0 text-teal-600" />
                {handoverSuccess}
              </div>
            )}

            {handoverStep === 'request' ? (
              <form onSubmit={handleRequestHandover} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">Current Email Address</label>
                  <input 
                    type="email" 
                    disabled 
                    value={email}
                    className="w-full bg-gray-100 border-none rounded-lg px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">New Owner Email Address *</label>
                  <input 
                    type="email" 
                    required
                    value={handoverNewEmail}
                    onChange={e => setHandoverNewEmail(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] transition-all"
                    placeholder="Enter target email for handover"
                  />
                </div>

                <div className="pt-2 flex justify-end space-x-3">
                  <button 
                    type="button" 
                    onClick={() => setShowHandoverModal(false)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 font-bold rounded-lg text-sm text-gray-700 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={handoverLoading}
                    className="px-5 py-2 bg-[#0097b2] hover:bg-[#00829a] text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center justify-center cursor-pointer"
                  >
                    {handoverLoading ? 'Sending Codes...' : 'Send Verification OTPs'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyHandover} className="space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-medium leading-relaxed">
                  Verification codes have been dispatched. Please enter codes from both mailboxes to authorize the transfer to <strong>{handoverNewEmail}</strong>.
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">OTP Code sent to Current Email ({email}) *</label>
                  <input 
                    type="text" 
                    required
                    maxLength={6}
                    value={handoverCurrentOtp}
                    onChange={e => setHandoverCurrentOtp(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] transition-all font-mono text-center tracking-widest text-base"
                    placeholder="6-digit OTP"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">OTP Code sent to New Email ({handoverNewEmail}) *</label>
                  <input 
                    type="text" 
                    required
                    maxLength={6}
                    value={handoverNewOtp}
                    onChange={e => setHandoverNewOtp(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] transition-all font-mono text-center tracking-widest text-base"
                    placeholder="6-digit OTP"
                  />
                </div>

                <div className="pt-2 flex justify-between items-center">
                  <button 
                    type="button" 
                    onClick={() => setHandoverStep('request')}
                    className="text-xs font-bold text-[#0097b2] hover:underline"
                  >
                    Back to edit email
                  </button>
                  <div className="flex space-x-3">
                    <button 
                      type="button" 
                      onClick={() => setShowHandoverModal(false)}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 font-bold rounded-lg text-sm text-gray-700 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      disabled={handoverLoading}
                      className="px-5 py-2 bg-[#00c4b5] hover:bg-[#00b0a3] text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center justify-center cursor-pointer"
                    >
                      {handoverLoading ? 'Verifying...' : 'Verify & Complete Handover'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Handover Audit History Logs */}
            {profile?.handoverHistory && profile.handoverHistory.length > 0 && (
              <div className="mt-6 pt-5 border-t border-gray-100 shrink-0 text-left">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Ownership Change History</h4>
                <div className="max-h-40 overflow-y-auto space-y-2.5">
                  {profile.handoverHistory.map((log: any, idx: number) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100 text-[11px] text-gray-600 leading-normal">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-gray-800">Transferred Ownership</span>
                        <span className="text-[10px] text-gray-400 font-medium font-mono">
                          {new Date(log.handoverDate).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="font-medium">
                        From: <span className="font-mono text-gray-500">{log.fromEmail}</span>
                      </div>
                      <div className="font-medium">
                        To: <span className="font-mono text-gray-800">{log.toEmail}</span>
                      </div>
                      {log.authorizedBy && (
                        <div className="text-[10px] text-gray-400 font-semibold mt-1">
                          Authorized by: {log.authorizedBy}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ImageCropperModal 
        src={tempImageSrc} 
        isOpen={isCropOpen} 
        onClose={() => setIsCropOpen(false)} 
        onCrop={handleCropSave} 
      />
    </DashboardLayout>
  );
}
