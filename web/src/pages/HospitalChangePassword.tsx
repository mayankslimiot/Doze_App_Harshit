import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Lock, EyeOff, Eye, ArrowRight, Shield } from 'lucide-react';
import { apiUrl } from '../services/api';

const setupSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SetupFormValues = z.infer<typeof setupSchema>;

export default function HospitalChangePassword() {
  const navigate = useNavigate();
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [apiError, setApiError] = useState('');
  
  const email = sessionStorage.getItem('organization_setup_email');

  useEffect(() => {
    if (!email && !localStorage.getItem('token')) {
      navigate('/');
    }
  }, [email, navigate]);

  const [isSkipping, setIsSkipping] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SetupFormValues>();

  useEffect(() => {
    const tempPass = sessionStorage.getItem('organization_setup_password');
    if (tempPass) {
      setValue('currentPassword', tempPass);
    }
  }, [setValue]);

  const onSubmit = async (data: SetupFormValues) => {
    setApiError('');
    try {
      const response = await fetch(apiUrl('/api/auth/first-login-change-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
          confirmPassword: data.confirmPassword
        })
      });
      const result = await response.json();

      if (!response.ok) {
        setApiError(result.message || 'Failed to update password');
        return;
      }

      // Clear temp items
      sessionStorage.removeItem('organization_setup_email');
      sessionStorage.removeItem('organization_setup_password');
      
      // Store token for automatic login
      localStorage.setItem('token', result.token);
      
      // Navigate to organization dashboard
      navigate('/dashboard', { replace: true });
      
    } catch (err) {
      setApiError('An error occurred. Please try again.');
    }
  };

  const handleContinueWithSamePassword = async () => {
    setApiError('');
    let currentPass = sessionStorage.getItem('organization_setup_password') || '';
    if (!currentPass) {
      const currentPassInput = document.querySelector('input[name="currentPassword"]') as HTMLInputElement;
      currentPass = currentPassInput?.value || '';
    }

    if (!currentPass) {
      setApiError('Current password is required to continue.');
      return;
    }
    
    setValue('newPassword', currentPass);
    setValue('confirmPassword', currentPass);
    
    setIsSkipping(true);
    await onSubmit({
      currentPassword: currentPass,
      newPassword: currentPass,
      confirmPassword: currentPass
    });
    setIsSkipping(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f9fafb] p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 sm:p-10">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Secure Your Account
          </h2>
          <p className="text-gray-500 text-sm">
            For security reasons, you must change your default password before accessing the dashboard.
          </p>
        </div>

        {apiError && (
          <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded-lg text-center">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Current Password Field */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">
              Current Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                {...register('currentPassword')}
                placeholder="Enter current password"
                className="block w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors text-sm"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showCurrentPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                </button>
              </div>
            </div>
            {errors.currentPassword && (
              <p className="mt-1 text-xs text-red-500">{errors.currentPassword.message}</p>
            )}
          </div>

          {/* New Password Field */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">
              New Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type={showNewPassword ? 'text' : 'password'}
                {...register('newPassword')}
                placeholder="Enter new password"
                className="block w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors text-sm"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showNewPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                </button>
              </div>
            </div>
            {errors.newPassword && (
              <p className="mt-1 text-xs text-red-500">{errors.newPassword.message}</p>
            )}
          </div>

          {/* Confirm Password Field */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">
              Confirm New Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                {...register('confirmPassword')}
                placeholder="Confirm new password"
                className="block w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors text-sm"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showConfirmPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                </button>
              </div>
            </div>
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-red-500">{errors.confirmPassword.message}</p>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="space-y-3 mt-6">
            <button
              type="submit"
              disabled={isSubmitting || isSkipping}
              className="w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-primary hover:bg-primary-hover focus:outline-none transition-colors disabled:opacity-70"
            >
              {isSubmitting && !isSkipping ? 'Updating...' : 'Update & Continue'}
              {!isSubmitting && <ArrowRight className="ml-2 w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleContinueWithSamePassword}
              disabled={isSubmitting || isSkipping}
              className="w-full flex items-center justify-center px-4 py-3 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none transition-colors disabled:opacity-70"
            >
              {isSkipping ? 'Continuing...' : 'Continue with Same Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
