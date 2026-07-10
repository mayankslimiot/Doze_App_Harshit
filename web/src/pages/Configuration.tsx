import DashboardLayout from '@/components/layout/DashboardLayout';
import { SlidersHorizontal, Monitor, Bell } from 'lucide-react';
import { useState, useEffect } from 'react';
import { apiUrl } from '@/services/api';

export default function Configuration() {
  const [activeTab, setActiveTab] = useState('clinical');
  const [hrMin, setHrMin] = useState(40);
  const [hrMax, setHrMax] = useState(120);
  const [respMin, setRespMin] = useState(8);
  const [respMax, setRespMax] = useState(30);
  const [enhancedDetection, setEnhancedDetection] = useState(true);
  
  // Notification States
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [popupEnabled, setPopupEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);

  // Threshold Mode State
  const [globalTrigger, setGlobalTrigger] = useState(true);

  // Per-Device State
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [deviceHrMin, setDeviceHrMin] = useState(40);
  const [deviceHrMax, setDeviceHrMax] = useState(120);
  const [deviceRespMin, setDeviceRespMin] = useState(8);
  const [deviceRespMax, setDeviceRespMax] = useState(30);
  const [deviceThresholdMode, setDeviceThresholdMode] = useState<'global' | 'individual'>('global');
  const [isSavingDevice, setIsSavingDevice] = useState(false);

  // Loading and Saving states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Fetch configuration on mount
  useEffect(() => {
    let active = true;
    const token = localStorage.getItem('token');
    
    fetch(apiUrl('/api/system-config'), {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(json => {
        if (active && json.success && json.data) {
          const config = json.data;
          setHrMin(config.hrMin ?? 40);
          setHrMax(config.hrMax ?? 120);
          setRespMin(config.respMin ?? 8);
          setRespMax(config.respMax ?? 30);
          setEnhancedDetection(config.enhancedDetection ?? true);
          setSmsEnabled(config.smsEnabled ?? true);
          setPopupEnabled(config.popupEnabled ?? true);
          setEmailEnabled(config.emailEnabled ?? false);
          setPushEnabled(config.pushEnabled ?? true);
          setGlobalTrigger(config.globalTrigger ?? true);
        }
        // Fetch devices
        return fetch(apiUrl('/api/devices/user'), {
          headers: { Authorization: `Bearer ${token}` }
        });
      })
      .then(res => res.json())
      .then(json => {
        if (active && json.devices) {
          setDevices(json.devices);
          if (json.devices.length > 0) {
            handleSelectDevice(json.devices[0].deviceId, json.devices);
          }
        }
      })
      .catch(err => {
        console.error('Failed to load configuration:', err);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSelectDevice = (deviceId: string, deviceList = devices) => {
    setSelectedDevice(deviceId);
    const d = deviceList.find((x: any) => x.deviceId === deviceId);
    if (d) {
      setDeviceHrMin(d.hrMin ?? 40);
      setDeviceHrMax(d.hrMax ?? 120);
      setDeviceRespMin(d.respMin ?? 8);
      setDeviceRespMax(d.respMax ?? 30);
      setDeviceThresholdMode(d.thresholdMode || 'global');
    }
  };

  const handleSaveDeviceThresholds = (mode: 'individual' | 'global' = 'individual') => {
    if (!selectedDevice) return;
    setIsSavingDevice(true);
    const token = localStorage.getItem('token');

    const payload: any = { thresholdMode: mode };
    if (mode === 'individual') {
      payload.hrMin = deviceHrMin;
      payload.hrMax = deviceHrMax;
      payload.respMin = deviceRespMin;
      payload.respMax = deviceRespMax;
    }
    
    fetch(apiUrl(`/api/devices/${selectedDevice}/thresholds`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          const updatedDevice = json.device;
          setDeviceThresholdMode(updatedDevice.thresholdMode);
          setDeviceHrMin(updatedDevice.hrMin);
          setDeviceHrMax(updatedDevice.hrMax);
          setDeviceRespMin(updatedDevice.respMin);
          setDeviceRespMax(updatedDevice.respMax);
          // Update local devices array
          setDevices(devices.map(d => 
            d.deviceId === selectedDevice 
              ? { ...d, ...updatedDevice }
              : d
          ));
          alert(json.message);
        } else {
          alert('Failed to save device settings: ' + (json.message || 'Unknown error'));
        }
      })
      .catch(err => {
        console.error('Error saving device config:', err);
        alert('Network error saving device thresholds.');
      })
      .finally(() => {
        setIsSavingDevice(false);
      });
  };

  const handleSaveChanges = () => {
    setIsSaving(true);
    setSaveSuccess(null);
    const token = localStorage.getItem('token');
    
    fetch(apiUrl('/api/system-config'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        hrMin,
        hrMax,
        respMin,
        respMax,
        enhancedDetection,
        smsEnabled,
        popupEnabled,
        emailEnabled,
        pushEnabled,
        globalTrigger
      })
    })
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setSaveSuccess('Configuration saved successfully!');
          setTimeout(() => setSaveSuccess(null), 3000);
        } else {
          alert('Failed to save settings: ' + (json.message || 'Unknown error'));
        }
      })
      .catch(err => {
        console.error('Error saving config:', err);
        alert('Network error saving configuration settings.');
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  const handleResetToDefaults = () => {
    if (window.confirm('Are you sure you want to reset configuration values to defaults?')) {
      setHrMin(40);
      setHrMax(120);
      setRespMin(8);
      setRespMax(30);
      setEnhancedDetection(true);
      setSmsEnabled(true);
      setPopupEnabled(true);
      setEmailEnabled(false);
      setPushEnabled(true);
      setGlobalTrigger(true);
    }
  };



  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="max-w-6xl mx-auto p-8 flex flex-col items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0097b2]"></div>
          <p className="text-sm text-gray-500 mt-4 font-medium">Loading system configurations...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-8">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">System Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">Manage clinical protocols, device parameters, and laboratory operations.</p>
        </div>

        {/* Main Card */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-6 flex flex-col">
          
          {/* Tabs */}
          <div className="flex border-b border-gray-100 px-2 overflow-x-auto">
            <button 
              onClick={() => setActiveTab('clinical')}
              className={`flex items-center px-6 py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'clinical' ? 'border-[#0097b2] text-[#0097b2]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Clinical Thresholds
            </button>

            <button 
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center px-6 py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'notifications' ? 'border-[#0097b2] text-[#0097b2]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Bell className="w-4 h-4 mr-2" />
              Notifications
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-8 flex-1">
            
            {/* CLINICAL THRESHOLDS TAB */}
            {activeTab === 'clinical' && (
              <div className="flex flex-col gap-8">
                {/* Mode Toggle at top */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm">
                  <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 mb-1">Threshold Configuration Mode</h3>
                      <p className="text-[11px] text-gray-500 font-bold">
                        Toggle between global thresholds for all devices or individual custom thresholds.
                      </p>
                    </div>
                    <div className="flex items-center space-x-4 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100">
                      <span className={`text-xs font-bold transition-colors ${globalTrigger ? 'text-[#0097b2]' : 'text-gray-400'}`}>Global</span>
                      <button 
                        onClick={() => setGlobalTrigger(!globalTrigger)}
                        className="w-12 h-6 rounded-full transition-colors relative bg-[#007b90]"
                      >
                        <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${globalTrigger ? 'translate-x-1' : 'translate-x-7'}`}></div>
                      </button>
                      <span className={`text-xs font-bold transition-colors ${!globalTrigger ? 'text-[#0097b2]' : 'text-gray-400'}`}>Individual</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column (Global Thresholds) */}
                  <div className={`space-y-6 transition-all duration-300 ${!globalTrigger ? 'opacity-40 pointer-events-none grayscale-[50%]' : ''}`}>
                    {/* Heart Rate Card */}
                    <div className="border border-gray-200 rounded-xl p-6 bg-white">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-sm font-bold text-gray-900">Heart Rate Thresholds (BPM)</h3>
                        <span className="bg-teal-50 text-[#0097b2] text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase">Global</span>
                      </div>

                      <div className="mb-6">
                        <div className="flex justify-between items-end mb-2">
                          <label className="text-xs font-bold text-gray-600">Minimum Heart Rate</label>
                          <div className="text-lg font-bold text-[#0097b2]">{hrMin} <span className="text-xs font-mono text-gray-500 ml-1">BPM</span></div>
                        </div>
                        <div className="relative h-2 bg-gray-200 rounded-full">
                          <div className="absolute top-0 left-0 h-full bg-[#0097b2] rounded-full" style={{ width: `${(hrMin/200)*100}%` }}></div>
                          <input 
                            type="range" min="30" max="100" value={hrMin} onChange={(e) => setHrMin(parseInt(e.target.value))}
                            className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-[#007b90] rounded-full border-2 border-white shadow-sm pointer-events-none" style={{ left: `calc(${(hrMin/200)*100}% - 8px)` }}></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-end mb-2">
                          <label className="text-xs font-bold text-gray-600">Maximum Heart Rate</label>
                          <div className="text-lg font-bold text-[#0097b2]">{hrMax} <span className="text-xs font-mono text-gray-500 ml-1">BPM</span></div>
                        </div>
                        <div className="relative h-2 bg-gray-200 rounded-full">
                          <div className="absolute top-0 left-0 h-full bg-[#0097b2] rounded-full" style={{ width: `${(hrMax/200)*100}%` }}></div>
                          <input 
                            type="range" min="100" max="200" value={hrMax} onChange={(e) => setHrMax(parseInt(e.target.value))}
                            className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-[#007b90] rounded-full border-2 border-white shadow-sm pointer-events-none" style={{ left: `calc(${(hrMax/200)*100}% - 8px)` }}></div>
                        </div>
                      </div>
                    </div>

                    {/* Respiration Card */}
                    <div className="border border-gray-200 rounded-xl p-6 bg-white">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-sm font-bold text-gray-900">Respiration Rate (Br/M)</h3>
                        <span className="bg-teal-50 text-[#0097b2] text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase">Global</span>
                      </div>
                      
                      <div className="mb-6">
                        <div className="flex justify-between items-end mb-2">
                          <label className="text-xs font-bold text-gray-600">Lower Boundary</label>
                          <div className="text-lg font-bold text-[#0097b2]">{respMin} <span className="text-xs font-mono text-gray-500 ml-1">Br/M</span></div>
                        </div>
                        <div className="relative h-2 bg-gray-200 rounded-full">
                          <div className="absolute top-0 left-0 h-full bg-[#0097b2] rounded-full" style={{ width: `${(respMin/40)*100}%` }}></div>
                          <input 
                            type="range" min="5" max="15" value={respMin} onChange={(e) => setRespMin(parseInt(e.target.value))}
                            className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-[#007b90] rounded-full border-2 border-white shadow-sm pointer-events-none" style={{ left: `calc(${(respMin/40)*100}% - 8px)` }}></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-end mb-2">
                          <label className="text-xs font-bold text-gray-600">Upper Boundary</label>
                          <div className="text-lg font-bold text-[#0097b2]">{respMax} <span className="text-xs font-mono text-gray-500 ml-1">Br/M</span></div>
                        </div>
                        <div className="relative h-2 bg-gray-200 rounded-full">
                          <div className="absolute top-0 left-0 h-full bg-[#0097b2] rounded-full" style={{ width: `${(respMax/40)*100}%` }}></div>
                          <input 
                            type="range" min="20" max="40" value={respMax} onChange={(e) => setRespMax(parseInt(e.target.value))}
                            className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-[#007b90] rounded-full border-2 border-white shadow-sm pointer-events-none" style={{ left: `calc(${(respMax/40)*100}% - 8px)` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column (Per Device Configuration) */}
                  <div className={`space-y-6 transition-all duration-300 ${globalTrigger ? 'opacity-40 pointer-events-none grayscale-[50%]' : ''}`}>
                    <div className="border border-gray-200 rounded-xl p-6 h-full flex flex-col bg-white">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-sm font-bold text-gray-900">Individual Settings</h3>
                        <span className="bg-purple-50 text-purple-600 text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase">Individual</span>
                      </div>
                      
                      <div className="mb-8">
                        <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Select Target Device</label>
                        <select 
                          value={selectedDevice} 
                          onChange={(e) => handleSelectDevice(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm font-medium text-gray-900 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-shadow"
                        >
                          <option value="" disabled>Select a device from your list</option>
                          {devices.map((d: any) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.customName || d.defaultName || d.deviceId} ({d.deviceId})
                            </option>
                          ))}
                        </select>
                      </div>

                      {selectedDevice ? (
                        <div className="space-y-6 flex-1 flex flex-col">
                          {/* Device Threshold Mode Indicator */}
                          <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
                            <div>
                              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Current Mode</span>
                              <div className="mt-0.5">
                                {deviceThresholdMode === 'global' ? (
                                  <span className="inline-flex items-center text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full">
                                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500 mr-1.5"></span>
                                    Global (Inherited)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full">
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mr-1.5"></span>
                                    Individual (Custom)
                                  </span>
                                )}
                              </div>
                            </div>
                            {deviceThresholdMode === 'individual' && (
                              <button
                                onClick={() => handleSaveDeviceThresholds('global')}
                                disabled={isSavingDevice}
                                className="text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                              >
                                Reset to Global
                              </button>
                            )}
                          </div>

                          {/* Heart Rate Sliders (Per Device) */}
                          <div className={`transition-opacity duration-200 ${deviceThresholdMode === 'global' ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex items-center justify-between mb-4">
                              <label className="text-sm font-bold text-gray-900">Heart Rate (BPM)</label>
                              <div className="text-[10px] text-gray-400 font-bold uppercase">{deviceHrMin} - {deviceHrMax} BPM</div>
                            </div>
                            
                            <div className="space-y-5 bg-gray-50 p-4 rounded-xl border border-gray-100">
                              <div>
                                <div className="flex justify-between items-end mb-1">
                                  <span className="text-xs font-bold text-gray-500">Min Threshold</span>
                                  <span className="text-sm font-bold text-purple-600">{deviceHrMin}</span>
                                </div>
                                <input type="range" min="30" max="100" value={deviceHrMin} onChange={e => setDeviceHrMin(parseInt(e.target.value))} className="w-full accent-purple-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                              </div>
                              <div>
                                <div className="flex justify-between items-end mb-1">
                                  <span className="text-xs font-bold text-gray-500">Max Threshold</span>
                                  <span className="text-sm font-bold text-purple-600">{deviceHrMax}</span>
                                </div>
                                <input type="range" min="100" max="200" value={deviceHrMax} onChange={e => setDeviceHrMax(parseInt(e.target.value))} className="w-full accent-purple-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                              </div>
                            </div>
                          </div>

                          {/* Respiration Sliders (Per Device) */}
                          <div className={`transition-opacity duration-200 ${deviceThresholdMode === 'global' ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex items-center justify-between mb-4">
                              <label className="text-sm font-bold text-gray-900">Respiration (Br/M)</label>
                              <div className="text-[10px] text-gray-400 font-bold uppercase">{deviceRespMin} - {deviceRespMax} Br/M</div>
                            </div>
                            
                            <div className="space-y-5 bg-gray-50 p-4 rounded-xl border border-gray-100">
                              <div>
                                <div className="flex justify-between items-end mb-1">
                                  <span className="text-xs font-bold text-gray-500">Min Threshold</span>
                                  <span className="text-sm font-bold text-purple-600">{deviceRespMin}</span>
                                </div>
                                <input type="range" min="5" max="15" value={deviceRespMin} onChange={e => setDeviceRespMin(parseInt(e.target.value))} className="w-full accent-purple-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                              </div>
                              <div>
                                <div className="flex justify-between items-end mb-1">
                                  <span className="text-xs font-bold text-gray-500">Max Threshold</span>
                                  <span className="text-sm font-bold text-purple-600">{deviceRespMax}</span>
                                </div>
                                <input type="range" min="20" max="40" value={deviceRespMax} onChange={e => setDeviceRespMax(parseInt(e.target.value))} className="w-full accent-purple-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                              </div>
                            </div>
                          </div>

                          <div className="mt-auto pt-6 space-y-3">
                            <button
                              onClick={() => handleSaveDeviceThresholds('individual')}
                              disabled={isSavingDevice}
                              className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-3.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center"
                            >
                              {isSavingDevice ? (
                                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div> Saving...</>
                              ) : (
                                'Save as Individual Thresholds'
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 p-8">
                          <Monitor className="w-10 h-10 text-gray-300 mb-3" />
                          <h4 className="text-sm font-bold text-gray-600 mb-1">No Device Selected</h4>
                          <p className="text-xs text-gray-400 text-center font-medium max-w-[200px]">Select a device from the dropdown above to configure its specific thresholds.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}



            {/* NOTIFICATIONS TAB */}
            {activeTab === 'notifications' && (
              <div className="max-w-3xl">
                <h3 className="text-sm font-bold text-gray-900 mb-6">Alert & Communication Channels</h3>
                <p className="text-sm text-gray-500 mb-8">Configure how and where the system sends clinical alarms and system alerts.</p>
                
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  
                  {/* SMS */}
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center hover:bg-gray-50 transition-colors">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">SMS Alerts</h4>
                      <p className="text-xs text-gray-500 mt-1">Receive critical bradycardia and apnea alerts via text message.</p>
                    </div>
                    <button 
                      onClick={() => setSmsEnabled(!smsEnabled)}
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ml-4 ${smsEnabled ? 'bg-[#007b90]' : 'bg-gray-300'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${smsEnabled ? 'translate-x-7' : 'translate-x-1'}`}></div>
                    </button>
                  </div>

                  {/* Screen Popup */}
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center hover:bg-gray-50 transition-colors">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">Screen Popup (In-App)</h4>
                      <p className="text-xs text-gray-500 mt-1">Force an immediate modal popup on the dashboard when a threshold is breached.</p>
                    </div>
                    <button 
                      onClick={() => setPopupEnabled(!popupEnabled)}
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ml-4 ${popupEnabled ? 'bg-[#007b90]' : 'bg-gray-300'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${popupEnabled ? 'translate-x-7' : 'translate-x-1'}`}></div>
                    </button>
                  </div>

                  {/* Email */}
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center hover:bg-gray-50 transition-colors">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">Email Digest</h4>
                      <p className="text-xs text-gray-500 mt-1">Receive a daily summary of all hardware errors, disconnections, and patient alerts.</p>
                    </div>
                    <button 
                      onClick={() => setEmailEnabled(!emailEnabled)}
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ml-4 ${emailEnabled ? 'bg-[#007b90]' : 'bg-gray-300'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${emailEnabled ? 'translate-x-7' : 'translate-x-1'}`}></div>
                    </button>
                  </div>

                  {/* Push */}
                  <div className="p-6 flex justify-between items-center hover:bg-gray-50 transition-colors">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">Browser Push Notifications</h4>
                      <p className="text-xs text-gray-500 mt-1">Get native operating system notifications even when the dashboard tab is in the background.</p>
                    </div>
                    <button 
                      onClick={() => setPushEnabled(!pushEnabled)}
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ml-4 ${pushEnabled ? 'bg-[#007b90]' : 'bg-gray-300'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${pushEnabled ? 'translate-x-7' : 'translate-x-1'}`}></div>
                    </button>
                  </div>

                </div>
              </div>
            )}

          </div>

          {/* Footer Save Action Bar */}
          <div className="border-t border-gray-100 bg-gray-50/50 p-6 flex justify-end items-center space-x-6 rounded-b-xl">
            {saveSuccess && (
              <span className="text-xs text-green-600 font-bold">
                {saveSuccess}
              </span>
            )}
            <button 
              onClick={handleResetToDefaults}
              disabled={isSaving}
              className="text-sm font-bold text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50"
            >
              Reset to Defaults
            </button>
            <button 
              onClick={handleSaveChanges}
              disabled={isSaving}
              className="bg-[#007b90] hover:bg-[#006a7c] text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm flex items-center justify-center min-w-[120px] disabled:opacity-75"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>



      </div>
    </DashboardLayout>
  );
}
