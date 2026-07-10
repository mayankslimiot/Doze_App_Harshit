import DashboardLayout from '@/components/layout/DashboardLayout';
import { ChevronRight, ShieldAlert, Shield, ShieldCheck, CheckCircle2, History, Download, Monitor, Smartphone, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';

export default function SecurityPrivacy() {
  const [retention, setRetention] = useState<'standard' | 'extended'>('standard');
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [anonymizationEnabled, setAnonymizationEnabled] = useState(true);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-8 pb-32">
        
        {/* Top Breadcrumb */}
        <div className="flex items-center text-xs font-bold text-gray-500 mb-6">
          <Link to="/settings" className="hover:text-gray-900 transition-colors">Settings</Link>
          <ChevronRight className="w-3 h-3 mx-2" />
          <span className="text-[#007b90]">Security & Privacy</span>
        </div>

        {/* HIPAA Compliance Reminder */}
        <div className="bg-[#fffdf0] border border-[#fde047] rounded-xl p-5 mb-8 shadow-sm flex items-start">
          <ShieldAlert className="w-5 h-5 text-[#d97706] shrink-0 mr-4 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-[#b45309] mb-1">HIPAA Compliance Reminder</h4>
            <p className="text-sm text-[#d97706]">
              Session timeout duration is currently set to 30 minutes. Recommended setting for clinical workstations is 15 minutes.
            </p>
          </div>
        </div>

        {/* Top Grid */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8">
          
          {/* Left Column: Authentication */}
          <div className="flex-1 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center mb-8">
              <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center mr-3">
                <Shield className="w-4 h-4 text-[#007b90]" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Authentication</h2>
            </div>

            {/* 2FA Block */}
            <div className="bg-gray-50 rounded-lg p-5 flex justify-between items-center mb-8">
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-1">Two-Factor Authentication (2FA)</h3>
                <p className="text-sm text-gray-500">Mandatory for all clinical staff accounts</p>
              </div>
              <div className="flex items-center bg-[#e0f2f1] text-[#007b90] px-3 py-1 rounded text-xs font-bold tracking-wider uppercase">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Active
              </div>
            </div>

            {/* Session Timeout Slider */}
            <div className="mb-10">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1">Session Timeout Duration</h3>
                  <p className="text-sm text-gray-500">Idle time before automatic logout</p>
                </div>
                <div className="bg-[#e0f2f1] text-[#007b90] px-3 py-1 rounded text-xs font-bold tracking-wider uppercase">
                  30 MINUTES
                </div>
              </div>
              
              <div className="relative pt-4 pb-2">
                {/* Track */}
                <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-[#007b90] w-1/2"></div>
                </div>
                {/* Thumb */}
                <div className="absolute top-2.5 left-1/2 w-4 h-4 bg-[#007b90] rounded-full border-2 border-white shadow -ml-2 cursor-pointer"></div>
                {/* Labels */}
                <div className="flex justify-between mt-4 text-[10px] font-bold text-gray-400">
                  <span>5m</span>
                  <span>15m</span>
                  <span>30m</span>
                  <span>45m</span>
                  <span>60m</span>
                </div>
              </div>
            </div>

            {/* Biometric Quick-Login */}
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-1">Biometric Quick-Login</h3>
                <p className="text-sm text-gray-500">Enable FaceID or Fingerprint on trusted clinical devices</p>
              </div>
              {/* Custom Toggle Switch */}
              <button 
                onClick={() => setBiometricEnabled(!biometricEnabled)}
                className={`w-12 h-6 rounded-full transition-colors relative flex items-center shrink-0 ${biometricEnabled ? 'bg-[#007b90]' : 'bg-gray-300'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform absolute ${biometricEnabled ? 'translate-x-7' : 'translate-x-1'}`}></div>
              </button>
            </div>
          </div>

          {/* Right Column: Privacy & Data */}
          <div className="w-full lg:w-[380px] bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col">
            <div className="flex items-center mb-8">
              <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center mr-3">
                <ShieldCheck className="w-4 h-4 text-[#007b90]" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Privacy & Data</h2>
            </div>

            {/* HIPAA Audit Logging */}
            <div className="mb-8">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-sm font-bold text-gray-900">HIPAA Audit Logging</h3>
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              </div>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                Maintains immutable record of all PHI access attempts.
              </p>
              <select className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:ring-1 focus:ring-[#007b90] appearance-none cursor-pointer">
                <option>Enhanced Logging (Recommended)</option>
                <option>Standard Logging</option>
              </select>
            </div>

            {/* Research Data Anonymization */}
            <div className="mb-8">
              <label className="flex items-start cursor-pointer group">
                <div className="relative flex items-center justify-center w-4 h-4 mt-0.5 mr-3 shrink-0">
                  <input 
                    type="checkbox" 
                    checked={anonymizationEnabled}
                    onChange={() => setAnonymizationEnabled(!anonymizationEnabled)}
                    className="peer sr-only"
                  />
                  <div className="w-4 h-4 bg-white border border-gray-300 rounded transition-colors peer-checked:bg-[#007b90] peer-checked:border-[#007b90]"></div>
                  <CheckCircle2 className={`absolute w-3 h-3 text-white pointer-events-none transition-opacity ${anonymizationEnabled ? 'opacity-100' : 'opacity-0'}`} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1 group-hover:text-[#007b90] transition-colors">Research Data Anonymization</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Automatically strip PII/PHI from clinical research exports.
                  </p>
                </div>
              </label>
            </div>

            {/* Data Retention Policy */}
            <div className="mt-auto">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Data Retention Policy</h3>
              <div className="flex space-x-3">
                <button 
                  onClick={() => setRetention('standard')}
                  className={`flex-1 py-2 px-3 text-[10px] font-bold rounded tracking-wider uppercase transition-colors border ${
                    retention === 'standard' 
                      ? 'bg-[#e0f2f1] text-[#007b90] border-[#007b90]' 
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  7 Years (Standard)
                </button>
                <button 
                  onClick={() => setRetention('extended')}
                  className={`flex-1 py-2 px-3 text-[10px] font-bold rounded tracking-wider uppercase transition-colors border ${
                    retention === 'extended' 
                      ? 'bg-[#e0f2f1] text-[#007b90] border-[#007b90]' 
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  10 Years (Extended)
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Access History */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-12">
          
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center mr-3">
                <History className="w-4 h-4 text-[#007b90]" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Access History</h2>
            </div>
            <button className="flex items-center text-[#007b90] hover:text-[#005f70] text-xs font-bold tracking-wider uppercase transition-colors">
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export Logs
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-gray-50/50">
                  <th className="py-4 px-6">Event Time</th>
                  <th className="py-4 px-6">Device Type</th>
                  <th className="py-4 px-6">IP Address</th>
                  <th className="py-4 px-6">Location</th>
                  <th className="py-4 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                
                <tr className="hover:bg-gray-50/30 transition-colors">
                  <td className="py-4 px-6 font-medium text-gray-900">2024-05-12  14:23:01</td>
                  <td className="py-4 px-6 text-gray-900 flex items-center">
                    <Monitor className="w-4 h-4 mr-2 text-gray-400" />
                    Windows 11 / Chrome
                  </td>
                  <td className="py-4 px-6 text-gray-900 font-medium">192.168.1.144</td>
                  <td className="py-4 px-6 text-gray-600">Main Lab Wing A</td>
                  <td className="py-4 px-6">
                    <span className="bg-green-50 border border-green-200 text-green-700 text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase">Success</span>
                  </td>
                </tr>

                <tr className="hover:bg-gray-50/30 transition-colors">
                  <td className="py-4 px-6 font-medium text-gray-900">2024-05-12  11:05:45</td>
                  <td className="py-4 px-6 text-gray-900 flex items-center">
                    <Smartphone className="w-4 h-4 mr-2 text-gray-400" />
                    iPhone 15 / iOS
                  </td>
                  <td className="py-4 px-6 text-gray-900 font-medium">45.23.102.11</td>
                  <td className="py-4 px-6 text-gray-600">Unknown / External</td>
                  <td className="py-4 px-6">
                    <span className="bg-red-50 border border-red-200 text-red-600 text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase">Failed (2FA)</span>
                  </td>
                </tr>

                <tr className="hover:bg-gray-50/30 transition-colors">
                  <td className="py-4 px-6 font-medium text-gray-900">2024-05-11  22:45:12</td>
                  <td className="py-4 px-6 text-gray-900 flex items-center">
                    <Monitor className="w-4 h-4 mr-2 text-gray-400" />
                    MacOS / Safari
                  </td>
                  <td className="py-4 px-6 text-gray-900 font-medium">192.168.1.15</td>
                  <td className="py-4 px-6 text-gray-600">Admin Suite 4B</td>
                  <td className="py-4 px-6">
                    <span className="bg-green-50 border border-green-200 text-green-700 text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase">Success</span>
                  </td>
                </tr>

              </tbody>
            </table>
          </div>

          <div className="bg-gray-50/50 p-4 border-t border-gray-100 text-center">
            <button className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
              View All Session Logs
            </button>
          </div>

        </div>

      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-0 left-56 right-0 bg-white border-t border-gray-200 p-4 px-8 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center text-gray-500">
            <Info className="w-4 h-4 mr-2" />
            <span className="text-sm">Changes will affect all devices associated with this admin account.</span>
          </div>
          <div className="flex space-x-4">
            <button className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-6 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm">
              Discard
            </button>
            <button className="bg-[#005f70] hover:bg-[#004a58] text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm">
              Save Changes
            </button>
          </div>
        </div>
      </div>

    </DashboardLayout>
  );
}
