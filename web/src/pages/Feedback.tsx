import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  MessageSquare, 
  ChevronDown, 
  Trash2, 
  Calendar, 
  User, 
  AlertTriangle,
  Sparkles,
  Send
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getUserProfile } from '@/services/deviceService';
import { useState, useEffect } from 'react';
import { apiUrl } from '@/services/api';

export default function Feedback() {
  const [mainTab, setMainTab] = useState<'submit' | 'history'>('submit');

  const { data: profile } = useQuery<any>({
    queryKey: ['user_profile'],
    queryFn: getUserProfile,
    staleTime: 60000 * 5,
  });

  const organizationName = profile?.account?.organizationId?.name || '';
  
  // Feedbacks History list
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  
  // Support Form State
  const [nameOfSubmitter, setNameOfSubmitter] = useState('');
  const [subject, setSubject] = useState('');
  const [severity, setSeverity] = useState<'High' | 'Medium' | 'Low'>('Low');
  const [problemDetails, setProblemDetails] = useState('');
  
  // Submitting States
  const [loading, setLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Initialize submitter name from profile once loaded
  useEffect(() => {
    if (profile?.name) {
      setNameOfSubmitter(profile.name);
    }
  }, [profile]);

  useEffect(() => {
    fetchFeedbackHistory();
  }, []);

  const fetchFeedbackHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/feedbacks'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setFeedbacks(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch feedback history:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this feedback item?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/feedbacks/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setFeedbacks(prev => prev.filter(item => item._id !== id));
      }
    } catch (err) {
      console.error('Failed to delete feedback:', err);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameOfSubmitter.trim() || !subject.trim() || !problemDetails.trim()) {
      alert('Please fill out all required fields.');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        nameOfSubmitter: nameOfSubmitter.trim(),
        subject: subject.trim(),
        severity,
        problemDetails: problemDetails.trim()
      };

      const res = await fetch(apiUrl('/api/feedbacks'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSubmitSuccess(true);
        
        // Trigger email redirection
        const emailTo = 'dozemate.support@slimiot.com';
        const emailSubject = encodeURIComponent(`[${severity} Severity Feedback] ${subject.trim()}`);
        const orgNameStr = organizationName || 'Independent Organization';
        const emailBody = encodeURIComponent(
          `Hello Dozemate Support,\n\n` +
          `Here are the details of the submitted feedback/issue:\n\n` +
          `Submitted By: ${nameOfSubmitter.trim()}\n` +
          `Organization: ${orgNameStr}\n` +
          `Severity Level: ${severity}\n` +
          `Subject: ${subject.trim()}\n\n` +
          `Problem Details:\n` +
          `${problemDetails.trim()}\n\n` +
          `Regards,\n` +
          `${nameOfSubmitter.trim()}`
        );
        
        const mailtoUrl = `mailto:${emailTo}?subject=${emailSubject}&body=${emailBody}`;
        
        // Reset form details (except submitter name)
        setSubject('');
        setSeverity('Low');
        setProblemDetails('');
        
        // Refresh history
        fetchFeedbackHistory();
        
        // Hide success badge after 5 seconds
        setTimeout(() => setSubmitSuccess(false), 5000);

        // Redirect to email client
        window.location.href = mailtoUrl;
      } else {
        alert(data.message || 'Failed to submit feedback.');
      }
    } catch (err) {
      console.error('Submit error:', err);
      alert('An error occurred during submission.');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case 'High':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'Medium':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-green-50 text-green-700 border-green-200';
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-4 sm:p-8">
        
        {/* Header Hero Section */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-[#014f5e] to-[#00c4b5] p-6 sm:p-8 text-white shadow-xl mb-8">
          <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 opacity-10">
            <MessageSquare className="w-96 h-96" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-md rounded-full px-3 py-1 text-xs font-semibold w-max mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Support &amp; Feedback Channel</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Feedback &amp; Support</h1>
              <p className="text-white/80 text-sm mt-2 max-w-xl">
                Submit system issues, feature feedback, or technical queries. Submitting will capture your request and open your email to send it directly to our support team.
              </p>
            </div>
          </div>
        </div>

        {/* Success Alert */}
        {submitSuccess && (
          <div className="bg-teal-50 border border-teal-200 text-teal-800 rounded-2xl p-4 mb-6 flex items-center shadow-sm animate-fade-in">
            <Send className="w-5 h-5 text-teal-500 mr-3 shrink-0" />
            <div className="text-sm font-semibold">
              Feedback captured! Opening email client to redirect mail to Dozemate Support...
            </div>
          </div>
        )}

        {/* Global Navigation Tabs */}
        <div className="flex border-b border-gray-200 mb-8">
          <button
            onClick={() => setMainTab('submit')}
            className={`pb-4 px-6 text-sm font-bold transition-all relative ${
              mainTab === 'submit'
                ? 'text-[#0097b2] border-b-2 border-[#0097b2]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Submit Feedback
          </button>
          <button
            onClick={() => setMainTab('history')}
            className={`pb-4 px-6 text-sm font-bold transition-all relative flex items-center gap-2 ${
              mainTab === 'history'
                ? 'text-[#0097b2] border-b-2 border-[#0097b2]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Submission History
            <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {feedbacks.length}
            </span>
          </button>
        </div>

        {mainTab === 'submit' ? (
          <form onSubmit={handleFormSubmit} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
            <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3">Submit a Support Ticket</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Filled By / Submitter Name */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Your Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. John Doe"
                  value={nameOfSubmitter}
                  onChange={e => setNameOfSubmitter(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] transition-colors"
                />
              </div>

              {/* Severity Level */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Issue Severity *</label>
                <div className="relative">
                  <select 
                    value={severity}
                    onChange={e => setSeverity(e.target.value as any)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] appearance-none cursor-pointer transition-colors"
                  >
                    <option value="Low">Low (General Query / Request)</option>
                    <option value="Medium">Medium (System Lag / Glitch)</option>
                    <option value="High">High (System Outage / Critical Bug)</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-4 top-3.5 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Subject *</label>
              <input 
                type="text" 
                required
                placeholder="Brief summary of the query or problem"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] transition-colors"
              />
            </div>

            {/* Problem Details */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Problem Details &amp; Query *</label>
              <textarea 
                required
                rows={5}
                placeholder="Explain the problem in detail (steps to reproduce, hardware symptoms, expected behavior)..."
                value={problemDetails}
                onChange={e => setProblemDetails(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-900 focus:outline-none focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] resize-y transition-colors min-h-[140px]"
              />
            </div>

            {/* Submit control bar */}
            <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <span className="text-xs text-gray-500 font-medium">
                Clicking send will save details to dashboard and launch your default email client.
              </span>
              <button 
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto bg-[#0097b2] hover:bg-[#007b90] disabled:opacity-50 text-white px-8 py-3.5 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                {loading ? 'Processing...' : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Email Support
                  </>
                )}
              </button>
            </div>

          </form>
        ) : (
          /* Feedback History Section */
          <div className="space-y-6">
            {feedbacks.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-500 shadow-sm flex flex-col items-center">
                <AlertTriangle className="w-12 h-12 text-gray-300 mb-4" />
                <h3 className="font-bold text-gray-700 text-lg">No Submissions Recorded</h3>
                <p className="text-sm text-gray-400 mt-1 max-w-sm">
                  System queries and support feedbacks filed by your organization will show up here.
                </p>
              </div>
            ) : (
              feedbacks.map((item) => (
                <div 
                  key={item._id} 
                  className={`bg-white border rounded-2xl p-6 shadow-sm transition-all relative ${
                    item.isRead ? 'border-gray-200 opacity-90' : 'border-teal-200 ring-1 ring-teal-50/50'
                  }`}
                >
                  {/* Status Indicator */}
                  {!item.isRead && (
                    <span className="absolute top-6 right-6 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                    </span>
                  )}

                  {/* Header */}
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-4 border-b border-gray-100">
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
                        <h4 className="font-bold text-gray-900 text-base">{item.subject || 'System Feedback'}</h4>
                        <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${getSeverityColor(item.severity)}`}>
                          {item.severity || 'Low'}
                        </span>
                        <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          item.isRead 
                            ? 'bg-gray-100 text-gray-500' 
                            : 'bg-teal-50 text-teal-700'
                        }`}>
                          {item.isRead ? 'Reviewed' : 'Sent'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-xs text-gray-400 mt-1 font-medium flex-wrap gap-y-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          Filed by: {item.nameOfSubmitter || 'Anonymous'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleDelete(item._id)}
                        className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors border border-transparent hover:border-red-100"
                        title="Delete Feedback"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Problem Details */}
                  <div className="pt-4 space-y-2">
                    <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">Problem Description:</span>
                    <p className="text-sm text-gray-700 font-medium leading-relaxed whitespace-pre-wrap">
                      {item.problemDetails || item.technicianFeedback?.comments || item.doctorFeedback?.comments || 'No details provided.'}
                    </p>
                  </div>

                </div>
              ))
            )}
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
