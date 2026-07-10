import { useState } from 'react';
import { MessageSquare, Save, Edit2 } from 'lucide-react';
import { apiUrl } from '@/services/api';
import { useQuery } from '@tanstack/react-query';
import { getUserProfile } from '@/services/deviceService';

export default function ClinicalNotes({ 
  monitoringSession, 
  onNoteUpdated 
}: { 
  monitoringSession: any; 
  onNoteUpdated: () => void; 
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [noteText, setNoteText] = useState(monitoringSession?.technicianNotes || '');
  const [isSaving, setIsSaving] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['user_profile'],
    queryFn: getUserProfile,
    staleTime: 60000 * 5,
  });
  const isViewer = profile?.role === 'viewer';

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/sessions/${monitoringSession._id}/notes`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ notes: noteText })
      });
      if (res.ok) {
        onNoteUpdated();
        setIsEditing(false);
      }
    } catch (err) {
      console.error('Failed to save notes:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <MessageSquare className="w-5 h-5 text-[#0097b2] mr-2" />
          <h2 className="text-xl font-bold text-gray-900">Clinical Notes</h2>
        </div>
        {!isEditing && monitoringSession && !isViewer && (
          <button 
            onClick={() => {
              setNoteText(monitoringSession.technicianNotes || '');
              setIsEditing(true);
            }}
            className="flex items-center text-xs font-bold text-[#0097b2] hover:text-[#008198] transition-colors"
          >
            <Edit2 className="w-3 h-3 mr-1" /> Edit Notes
          </button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        {isEditing ? (
          <div className="space-y-3">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Enter clinical or technician notes here..."
              className="w-full min-h-[120px] p-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#0097b2]"
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-xs font-semibold hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-3 py-1.5 bg-[#00c4b5] text-white rounded-lg text-xs font-semibold hover:bg-[#00b0a3] flex items-center"
              >
                <Save className="w-3.5 h-3.5 mr-1" />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start space-x-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 bg-teal-100 text-teal-700">
              {monitoringSession?.patientCode ? monitoringSession.patientCode.slice(-2) : 'C'}
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <span className="font-bold text-gray-900">Technician Note</span>
                <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded tracking-wider">
                  CLINICAL
                </span>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">
                {monitoringSession?.technicianNotes || "No notes have been added for this session yet."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
