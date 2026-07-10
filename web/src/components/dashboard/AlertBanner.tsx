import { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

export default function AlertBanner() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-start justify-between mb-6">
      <div className="flex items-center">
        <AlertCircle className="w-5 h-5 text-orange-500 mr-3 flex-shrink-0" />
        <p className="text-sm text-orange-800">
          <span className="font-bold">2 Active Alerts</span> — DZ-009 offline. Signal
          lost for Device BED-03.
        </p>
      </div>
      <button
        onClick={() => setIsVisible(false)}
        className="text-orange-500 hover:text-orange-700 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
