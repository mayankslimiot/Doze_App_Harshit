import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Check,
  Mail,
  Lock,
  EyeOff,
  Eye,
  ArrowRight,
  X,
  Clock,
  ArrowLeft
} from 'lucide-react';
import { apiUrl } from '../services/api';
import logoImage from '@/assets/dozemate512.jpg';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isPageReady, setIsPageReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('reason') === 'expired') {
      setLoginError("Your organization's access period is over. Please contact support.");
    }
  }, [location.search]);

  useEffect(() => {
    // Fallback: If Lottie fails or takes too long (> 10s), show page anyway
    const timer = setTimeout(() => setIsPageReady(true), 10000);
    return () => clearTimeout(timer);
  }, []);

  const dotLottieRefCallback = (dotLottie: any) => {
    if (dotLottie) {
      dotLottie.addEventListener('load', () => setIsPageReady(true));
      dotLottie.addEventListener('ready', () => setIsPageReady(true));
      dotLottie.addEventListener('error', () => setIsPageReady(true));
    }
  };

  // Forgot Password States
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3>(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [timeLeft, setTimeLeft] = useState<number>(600); // 10 minutes in seconds

  useEffect(() => {
    if (forgotStep !== 2 || timeLeft <= 0 || !showForgotModal) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [forgotStep, timeLeft, showForgotModal]);

  const openForgotPassword = () => {
    setForgotError('');
    // Pre-fill email if already entered and looks valid
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && emailRegex.test(email)) {
      setForgotEmail(email);
    } else {
      setForgotEmail('');
    }
    setOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
    setForgotStep(1);
    setShowForgotModal(true);
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    if (!forgotEmail) {
      setForgotError('Email is required');
      return;
    }
    setForgotLoading(true);
    try {
      const response = await fetch(apiUrl('/api/auth/forgot-mobile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      });
      const result = await response.json();
      if (!response.ok) {
        setForgotError(result.message || 'Failed to send reset code');
        return;
      }
      setTimeLeft(600); // Reset timer to 10 minutes
      setForgotStep(2);
    } catch (err) {
      setForgotError('Connection error. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    if (!otpCode || otpCode.length !== 6) {
      setForgotError('Please enter a valid 6-digit code');
      return;
    }
    if (timeLeft <= 0) {
      setForgotError('Verification code has expired. Please request a new one.');
      return;
    }
    setForgotLoading(true);
    try {
      const response = await fetch(apiUrl('/api/auth/verify-reset-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, code: otpCode })
      });
      const result = await response.json();
      if (!response.ok) {
        setForgotError(result.message || 'Invalid verification code');
        return;
      }
      setForgotStep(3);
    } catch (err) {
      setForgotError('Connection error. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    if (!newPassword || newPassword.length < 8) {
      setForgotError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setForgotError('Passwords do not match');
      return;
    }
    setForgotLoading(true);
    try {
      const response = await fetch(apiUrl('/api/auth/reset-password-mobile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: forgotEmail, 
          code: otpCode, 
          newPassword 
        })
      });
      const result = await response.json();
      if (!response.ok) {
        setForgotError(result.message || 'Failed to reset password');
        return;
      }

      // Auto login
      if (result.token && result.user) {
        localStorage.setItem('token', result.token);
        localStorage.setItem('user', JSON.stringify(result.user));
        setShowForgotModal(false);
        if (result.user.role === 'superadmin') {
          navigate('/admin', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      } else {
        setForgotError('Password updated, please log in manually');
      }
    } catch (err) {
      setForgotError('Connection error. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const formatTimeLeft = () => {
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>();

  const email = watch('email', '');

  const onSubmit = async (data: LoginFormValues) => {
    setLoginError('');
    if (data.email.endsWith('@slimiot.com')) {
      try {
        const response = await fetch(apiUrl('/api/superadmin/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: data.email, password: data.password })
        });
        const result = await response.json();

        if (!response.ok) {
          setLoginError(result.message || 'Login failed');
          return;
        }

        // Check if first login
        if (result.isFirstLogin) {
          // Store email temporarily so setup screen knows who to reset
          sessionStorage.setItem('superadmin_email', data.email);
          sessionStorage.setItem('superadmin_setup_password', data.password);
          navigate('/admin/setup', { replace: true });
        } else {
          // Store token
          localStorage.setItem('token', result.token);
          navigate('/admin', { replace: true });
        }
      } catch (err) {
        setLoginError('An error occurred during login. Please try again.');
      }
    } else {
      try {
        const response = await fetch(apiUrl('/api/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email: data.email, 
            password: data.password
          })
        });
        const result = await response.json();

        if (!response.ok) {
          setLoginError(result.message || 'Login failed');
          return;
        }

        if (result.isFirstLogin) {
          sessionStorage.setItem('organization_setup_email', data.email);
          sessionStorage.setItem('organization_setup_password', data.password);

          navigate('/dashboard/setup', { replace: true });
        } else {
          localStorage.setItem('token', result.token);
          navigate('/dashboard', { replace: true });
        }
      } catch (err) {
        setLoginError('An error occurred during login. Please try again.');
      }
    }
  };

  return (
    <>
      {/* Full-screen Loading Overlay */}
      {!isPageReady && (
        <div className="fixed inset-0 z-[100] bg-[#f8fafc] flex flex-col items-center justify-center">
          <div className="flex items-center space-x-2">
            <div className="w-2.5 h-2.5 bg-[#0097b2] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2.5 h-2.5 bg-[#00c4b5] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2.5 h-2.5 bg-[#0097b2] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
          <div className="mt-4 text-sm font-semibold text-gray-500 tracking-widest uppercase">Initializing</div>
        </div>
      )}

      <div className={`min-h-screen flex flex-col lg:flex-row bg-[#f9fafb] ${!isPageReady ? 'opacity-0 overflow-hidden h-screen' : 'opacity-100 transition-opacity duration-500'}`}>
      {/* Full-screen Loading Overlay */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm transition-opacity">
          <div className="text-4xl md:text-5xl font-bold tracking-tight wave-text flex">
            <span className="text-black">D</span>
            <span className="text-black">o</span>
            <span className="text-black">z</span>
            <span className="text-black">e</span>
            <span className="text-[#0097b2]">m</span>
            <span className="text-[#0097b2]">a</span>
            <span className="text-[#0097b2]">t</span>
            <span className="text-[#0097b2]">e</span>
          </div>
        </div>
      )}

      {/* Left Section - Hero/Information */}
      <div className="lg:w-1/2 bg-gradient-to-br from-[#0097b2] to-[#005e6e] flex flex-col justify-between p-8 lg:p-12 border-r border-[#008ba3] relative overflow-hidden">
        {/* Decorative background glow elements */}
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center space-x-2 mb-8">
            <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-white/20 bg-white shadow-sm">
              <img src={logoImage} alt="dozemate" className="w-full h-full object-cover" />
            </div>
            <span className="text-2xl font-bold tracking-tight">
              <span className="text-black">doze</span><span className="text-[#bfeaf2]">mate</span>
            </span>
          </div>

          <div className="max-w-md">
            <h1 className="text-3xl lg:text-4xl font-bold text-white mb-4 leading-tight">
              Organization Dashboard
            </h1>
            <p className="text-[#e0f7fa] mb-12 text-lg leading-relaxed opacity-90">
              Secure clinical tool for monitoring patient sleep patterns,
              managing devices, and reviewing trial data with precision and
              reliability.
            </p>

            {/* Feature List */}
            <div className="space-y-8">
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                    <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-[#0097b2]" strokeWidth={3} />
                    </div>
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-base font-semibold text-white">
                    Real-time monitoring
                  </h3>
                  <p className="mt-1 text-sm text-[#e0f7fa]/80">
                    Live data streams from active trial devices.
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                    <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-[#0097b2]" strokeWidth={3} />
                    </div>
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-base font-semibold text-white">
                    Role-based access
                  </h3>
                  <p className="mt-1 text-sm text-[#e0f7fa]/80">
                    Secure permissions for technicians and administrators.
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                    <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-[#0097b2]" strokeWidth={3} />
                    </div>
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-base font-semibold text-white">
                    Incident review
                  </h3>
                  <p className="mt-1 text-sm text-[#e0f7fa]/80">
                    Detailed logs of clinical events and device statuses.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info left */}
        <div className="mt-8 text-xs text-[#e0f7fa]/70 font-medium space-y-1 relative z-10">
          <div>
            Powered by <span className="text-black">slim</span><span className="text-[#bfeaf2] font-semibold">iot</span>
          </div>
          <div>© 2026 <span className="text-black">slim</span><span className="text-[#bfeaf2]">iot</span> Technologies Private Limited</div>
        </div>
      </div>

      {/* Right Section - Login Form */}
      <div className="lg:w-1/2 flex flex-col justify-between items-center p-8 lg:p-12 relative bg-[#f8fafc]">
        {/* Empty space to push form to center visually but keep footer at bottom */}
        <div className="w-full max-w-md my-auto">
          <div className="p-8 sm:p-10 w-full">
            <div className="text-center mb-4">
              <div className="h-56 w-full flex justify-center -mb-10">
                <DotLottieReact
                  src="https://lottie.host/a4601242-4731-4872-837c-14a64b473bcf/KHPJzcbWly.lottie"
                  loop
                  autoplay
                  dotLottieRefCallback={dotLottieRefCallback}
                />
              </div>
              <p className="text-gray-500 text-sm">
                Use your assigned organization credentials
              </p>
            </div>

            {loginError && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg text-center">
                {loginError}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Email Field */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    {...register('email')}
                    placeholder="doctor@organization.edu"
                    className="block w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors text-sm"
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-900">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={openForgotPassword}
                    className="text-sm font-medium text-primary hover:text-primary-hover focus:outline-none"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    {...register('password')}
                    placeholder="••••••••"
                    className="block w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors text-sm"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-gray-400 hover:text-gray-600 focus:outline-none"
                    >
                      {showPassword ? (
                        <Eye className="h-5 w-5" />
                      ) : (
                        <EyeOff className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>
                {errors.password && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.password.message}
                  </p>
                )}
              </div>



              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors disabled:opacity-70"
              >
                {isSubmitting ? 'Signing in...' : 'Sign In'}
                {!isSubmitting && <ArrowRight className="ml-2 w-4 h-4" />}
              </button>
            </form>


          </div>


        </div>


      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4 border border-gray-100 relative">
            <button 
              onClick={() => setShowForgotModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <h3 className="text-xl font-bold text-gray-900 mb-1">Reset Password</h3>
              <p className="text-sm text-gray-500">
                {forgotStep === 1 && "Enter your email to request a reset code."}
                {forgotStep === 2 && "Enter the 6-digit verification code sent to your email."}
                {forgotStep === 3 && "Create a new secure password for your account."}
              </p>
            </div>

            {forgotError && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs font-semibold rounded-lg text-center">
                {forgotError}
              </div>
            )}

            {forgotStep === 1 && (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="doctor@organization.com"
                      className="block w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full flex items-center justify-center px-4 py-2.5 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors disabled:opacity-75"
                >
                  {forgotLoading ? 'Sending OTP...' : 'Send Verification Code'}
                </button>
              </form>
            )}

            {forgotStep === 2 && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="block w-full text-center tracking-[1em] text-xl font-bold py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 font-medium bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-1.5 text-gray-400" />
                    <span>Expires in:</span>
                  </div>
                  <span className={`font-mono font-bold ${timeLeft <= 60 ? 'text-red-500 animate-pulse' : 'text-gray-700'}`}>
                    {formatTimeLeft()}
                  </span>
                </div>

                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="flex-1 flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors focus:outline-none"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1.5" />
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading || timeLeft <= 0}
                    className="flex-1 flex items-center justify-center px-4 py-2.5 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors disabled:opacity-75"
                  >
                    {forgotLoading ? 'Verifying...' : 'Verify Code'}
                  </button>
                </div>
              </form>
            )}

            {forgotStep === 3 && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="block w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="block w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full flex items-center justify-center px-4 py-2.5 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors disabled:opacity-75"
                >
                  {forgotLoading ? 'Updating...' : 'Update & Sign In'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
      </div>
    </>
  );
}
