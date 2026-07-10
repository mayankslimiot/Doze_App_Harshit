import { CheckSquare, Check, Flag, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { apiUrl } from '@/services/api';
import { useQuery } from '@tanstack/react-query';
import { getUserProfile } from '@/services/deviceService';

export default function ReviewActions({
  monitoringSession,
  sleepSession,
  onReviewUpdated
}: {
  monitoringSession: any;
  sleepSession: any;
  onReviewUpdated: () => void;
}) {
  const [loadingEvent, setLoadingEvent] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [flagging, setFlagging] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['user_profile'],
    queryFn: getUserProfile,
    staleTime: 60000 * 5,
  });
  const isViewer = profile?.role === 'viewer';

  // Dynamically compute the review checklist events based on sleep metrics
  const getReviewEvents = () => {
    const events: string[] = [];

    // 1. Tech notes check
    if (monitoringSession?.technicianNotes?.trim()) {
      events.push("Review technician notes");
    } else {
      events.push("Verify session setup notes");
    }

    if (sleepSession) {
      // 2. Sleep efficiency
      if ((sleepSession.sleepEfficiency || 0) < 75) {
        events.push(`Review Low Sleep Efficiency (${Math.round(sleepSession.sleepEfficiency || 0)}%)`);
      }
      
      // 3. Low sleep score
      if ((sleepSession.sleepScore || 0) < 70) {
        events.push(`Review Low Sleep Score (${Math.round(sleepSession.sleepScore || 0)})`);
      }

      // 4. Awakenings
      if ((sleepSession.awakenings || 0) > 5) {
        events.push(`Review high awakenings (${sleepSession.awakenings} events)`);
      }



      // 6. Signal Quality
      if ((sleepSession.dataQuality || 0) < 90) {
        events.push(`Signal loss check: Data Quality (${Math.round(sleepSession.dataQuality || 0)}%)`);
      }
    } else {
      // If no sleep session data, fall back to standard checklist
      events.push("Physician sign-off requirement");
      events.push("Review signal quality & device logs");
    }

    return events;
  };

  const allEvents = getReviewEvents();
  const reviewedEvents = monitoringSession?.reviewedEvents || [];
  const totalEvents = allEvents.length;
  const completedCount = allEvents.filter(e => reviewedEvents.includes(e)).length;
  const progressPercent = totalEvents > 0 ? Math.round((completedCount / totalEvents) * 100) : 0;

  const handleToggleEvent = async (eventName: string) => {
    setLoadingEvent(eventName);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/sessions/${monitoringSession._id}/review-event`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ eventName, allEvents })
      });
      if (res.ok) {
        onReviewUpdated();
      }
    } catch (err) {
      console.error('Failed to toggle event review status:', err);
    } finally {
      setLoadingEvent(null);
    }
  };

  const handleMarkAllReviewed = async () => {
    setMarkingAll(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/sessions/${monitoringSession._id}/mark-reviewed`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ events: allEvents })
      });
      if (res.ok) {
        onReviewUpdated();
      }
    } catch (err) {
      console.error('Failed to mark all reviewed:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleToggleFlag = async () => {
    setFlagging(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/sessions/${monitoringSession._id}/flag`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        onReviewUpdated();
      }
    } catch (err) {
      console.error('Failed to toggle session flag:', err);
    } finally {
      setFlagging(false);
    }
  };

  return (
    <div className="flex flex-col h-full pl-0 lg:pl-6">
      <div className="mb-6 border-b border-gray-200 pb-4">
        <div className="flex items-center mb-6">
          <CheckSquare className="w-5 h-5 text-[#0097b2] mr-2" />
          <h2 className="text-xl font-bold text-gray-900">Review Actions</h2>
        </div>

        <div className="flex justify-between items-end mb-2">
          <span className="text-xs font-bold text-gray-500">Review Progress</span>
          <span className="text-sm font-bold text-gray-900">{completedCount} / {totalEvents}</span>
        </div>
        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
          <div 
            className="bg-[#00c4b5] h-full transition-all duration-300" 
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>

      <div className="mb-4">
        <h3 className="text-xs font-bold text-gray-400 tracking-wider mb-4">
          UNREVIEWED CLINICAL INDICATORS
        </h3>
        <div className="space-y-3">
          {allEvents.map((event, idx) => {
            const isChecked = reviewedEvents.includes(event);
            return (
              <div 
                key={idx} 
                onClick={() => !isViewer && !loadingEvent && handleToggleEvent(event)}
                className={`bg-white border rounded-lg p-4 shadow-sm flex items-start space-x-3 transition-all ${
                  isChecked 
                    ? 'border-green-200 bg-green-50/20' 
                    : isViewer 
                      ? 'border-gray-200 cursor-not-allowed'
                      : 'border-gray-200 hover:border-[#00c4b5] cursor-pointer'
                }`}
              >
                <div className="mt-0.5">
                  {loadingEvent === event ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : (
                    <div className={`w-4 h-4 border rounded flex items-center justify-center ${
                      isChecked ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 bg-white'
                    }`}>
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className={`text-sm font-bold mb-0.5 ${isChecked ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                    {event}
                  </div>
                  <div className="text-xs text-gray-400 font-medium">
                    {isChecked ? 'Reviewed' : 'Action Required'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <button 
          onClick={handleMarkAllReviewed}
          disabled={isViewer || markingAll || completedCount === totalEvents}
          className="w-full bg-[#00c4b5] text-white py-3 rounded-md text-sm font-bold hover:bg-[#00b0a3] transition-colors flex items-center justify-center shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {markingAll ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Check className="w-4 h-4 mr-2" strokeWidth={3} />
          )}
          Mark All Reviewed
        </button>
        <button 
          onClick={handleToggleFlag}
          disabled={isViewer || flagging}
          className={`w-full py-3 rounded-md text-sm font-bold border transition-colors flex items-center justify-center shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
            monitoringSession?.flagged
              ? 'bg-red-550 border-red-500 bg-red-500 text-white hover:bg-red-600'
              : 'bg-white border-red-200 text-red-500 hover:bg-red-50'
          }`}
        >
          {flagging ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Flag className="w-4 h-4 mr-2" />
          )}
          {monitoringSession?.flagged ? 'Unflag Session' : 'Flag Session'}
        </button>
      </div>
    </div>
  );
}
