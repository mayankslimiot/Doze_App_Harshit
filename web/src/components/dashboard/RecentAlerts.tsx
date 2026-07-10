import { WifiOff, ActivitySquare } from 'lucide-react';

export default function RecentAlerts() {
  const alerts: any[] = [];

  return (
    <div className="flex flex-col h-full pl-6">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-3">
          Recent Alerts
        </h3>
      </div>
      <div className="space-y-4">
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No active alerts
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`bg-white border rounded-lg p-4 shadow-sm relative overflow-hidden ${
                alert.variant === 'error' ? 'border-gray-200' : 'border-gray-200'
              }`}
            >
              {/* Left Accent Border */}
              <div
                className={`absolute left-0 top-0 bottom-0 w-1 ${
                  alert.variant === 'error' ? 'bg-red-500' : 'bg-orange-500'
                }`}
              ></div>
              
              <div className="flex items-center justify-between mb-2 pl-1">
                <div className="flex items-center space-x-2">
                  {alert.variant === 'error' ? (
                    <WifiOff className="w-4 h-4 text-red-500" />
                  ) : (
                    <ActivitySquare className="w-4 h-4 text-orange-500" />
                  )}
                  <span
                    className={`font-bold text-sm ${
                      alert.variant === 'error' ? 'text-red-500' : 'text-orange-500'
                    }`}
                  >
                    {alert.type}
                  </span>
                </div>
                <span className="text-xs text-gray-400 font-medium">{alert.time}</span>
              </div>
              <p className="text-sm text-gray-600 pl-1">{alert.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
