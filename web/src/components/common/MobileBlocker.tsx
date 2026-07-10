import { Monitor, Smartphone } from 'lucide-react';
import logoImage from '@/assets/dozemate512.jpg';

export default function MobileBlocker() {
  return (
    <div className="mobile-blocker fixed inset-0 z-[99999] hidden flex-col items-center justify-center bg-[#f4f7f6] p-6 text-center select-none font-sans">
      <div className="max-w-md w-full rounded-2xl border border-gray-200 p-8 shadow-sm flex flex-col items-center relative overflow-hidden">
        {/* Decorative backdrop glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#0097b2]/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-[#10b981]/5 rounded-full blur-3xl"></div>

        {/* Brand Logo */}
        <div className="w-16 h-16 rounded-full overflow-hidden border border-gray-100 bg-white mb-6 shadow-sm">
          <img src={logoImage} alt="Dozemate" className="w-full h-full object-cover" />
        </div>

        {/* Visual Device Indicator */}
        <div className="flex items-center justify-center space-x-4 mb-6 relative">
          <div className="relative">
            <Smartphone className="w-12 h-12 text-red-400 opacity-60" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-red-500 text-3xl font-bold leading-none select-none">×</span>
            </div>
          </div>
          <span className="text-gray-300 text-xl font-bold">→</span>
          <Monitor className="w-16 h-16 text-[#0097b2] animate-pulse" />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-gray-900 mb-3 tracking-tight">
          Desktop Optimized Only
        </h2>

        {/* Message */}
        <p className="text-sm text-gray-600 leading-relaxed mb-6">
          The <span className="font-semibold text-gray-900">Dozemate</span> clinical dashboard is designed for high-resolution displays. Please access this portal from a desktop or laptop device, or increase your browser window width.
        </p>

        {/* Divider / Support */}
        <div className="w-full pt-4 border-t border-gray-100 flex justify-between items-center text-[10px] font-mono text-gray-400 uppercase tracking-wider">
          <div>Dozemate v1.0.0</div>
          <div>Clinical Systems</div>
        </div>
      </div>
    </div>
  );
}
