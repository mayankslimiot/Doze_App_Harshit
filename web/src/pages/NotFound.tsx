import { useNavigate } from 'react-router-dom';
import { Compass, ArrowLeft, Home } from 'lucide-react';
import logoImage from '@/assets/dozemate512.jpg';

export default function NotFound() {
  const navigate = useNavigate();

  const handleGoBack = () => {
    navigate(-1);
  };

  const handleGoHome = () => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.role === 'superadmin') {
          navigate('/admin');
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#f4f7f6] flex flex-col items-center justify-center p-6 text-center select-none font-sans">
      <div className="max-w-md w-full rounded-2xl border border-gray-200 p-8 shadow-sm flex flex-col items-center relative overflow-hidden">
        {/* Decorative backdrop glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#0097b2]/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-[#10b981]/5 rounded-full blur-3xl"></div>

        {/* Brand Logo */}
        <div className="w-16 h-16 rounded-full overflow-hidden border border-gray-100 bg-white mb-6 shadow-sm">
          <img src={logoImage} alt="Dozemate" className="w-full h-full object-cover" />
        </div>

        {/* 404 Visual Icon */}
        <div className="w-20 h-20 rounded-2xl bg-[#eaf4f6] flex items-center justify-center mb-6 relative">
          <Compass className="w-10 h-10 text-[#0097b2] animate-spin" style={{ animationDuration: '8s' }} />
          <span className="absolute -bottom-2 -right-2 bg-red-500 text-white text-xs font-bold font-mono px-1.5 py-0.5 rounded-full shadow">
            404
          </span>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-gray-900 mb-3 tracking-tight">
          Oops! Page Not Found
        </h2>

        {/* Message */}
        <p className="text-sm text-gray-600 leading-relaxed mb-8">
          The address you entered in the browser's address bar might be misspelled, or the page you are looking for has been moved or deleted.
        </p>

        {/* Navigation Actions */}
        <div className="w-full grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={handleGoBack}
            className="flex items-center justify-center px-4 py-3 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </button>
          
          <button
            onClick={handleGoHome}
            className="flex items-center justify-center px-4 py-3 bg-[#0097b2] hover:bg-[#007a91] text-white rounded-lg text-sm font-bold transition-colors shadow-sm cursor-pointer"
          >
            <Home className="w-4 h-4 mr-2" />
            Home
          </button>
        </div>

        {/* Divider / Support */}
        <div className="w-full pt-4 border-t border-gray-100 flex justify-between items-center text-[10px] font-mono text-gray-400 uppercase tracking-wider">
          <div>Dozemate Support</div>
          <div>Clinical Systems</div>
        </div>
      </div>
    </div>
  );
}
