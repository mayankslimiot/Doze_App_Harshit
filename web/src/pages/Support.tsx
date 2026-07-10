import DashboardLayout from '@/components/layout/DashboardLayout';
import { Search, FileText, HelpCircle, Ticket, ArrowRight, BookOpen, AlertCircle, FileSpreadsheet, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import onOffSvg from '@/assets/device_setup/on_off.svg';
import bedPlacementSvg from '@/assets/device_setup/bed_placement.svg';
import provisionDeviceSvg from '@/assets/device_setup/provision_device.svg';

interface FAQ {
  q: string;
  a: string;
}

export default function Support() {
  const [activeAccordion, setActiveAccordion] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupStep, setSetupStep] = useState(1);
  const [showProtocolsModal, setShowProtocolsModal] = useState(false);
  const [protocolStep, setProtocolStep] = useState(1);
  const [showReportHelpModal, setShowReportHelpModal] = useState(false);
  const [reportHelpStep, setReportHelpStep] = useState(1);
  const [showAlertGuideModal, setShowAlertGuideModal] = useState(false);
  const [alertGuideStep, setAlertGuideStep] = useState(1);

  const faqs: FAQ[] = [
    {
      q: "How do I pair the Dozemate sensor with the local ward gateway?",
      a: "Power on the Dozemate sensor. Navigate to 'Devices' in your dashboard, select 'Provision/Pair New Device' and scan for BLE MAC addresses. Once detected, assign a Room and Bed ID to save configuration."
    },
    {
      q: "What should I do if the real-time signal quality indicator is yellow?",
      a: "A yellow signal indicator represents moderate signal attenuation. Ensure there are no large metallic objects directly between the sensor and gateway, and check that the participant is situated correctly in range."
    },
    {
      q: "How can I verify a participant's informed consent is logged?",
      a: "When starting a trial session, click the 'User Onboarding' / 'Patient Onboarding' menu button. Complete the fields and check the consent confirmation box at the bottom to save consent verification."
    },
    {
      q: "Can I download and export the sleep trial metrics as PDF?",
      a: "Yes. Navigate to the 'Reports' section from the sidebar, select your target Device/Bed, input the session date range, click 'Check Data Availability' and then click 'Generate PDF'."
    }
  ];

  const filteredFaqs = faqs.filter(
    faq => faq.q.toLowerCase().includes(searchQuery.toLowerCase()) || 
           faq.a.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-8 pb-16">
        
        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Pilot Support Center</h1>
          <p className="text-sm text-gray-500 font-medium">Technical assistance, hardware setup guides, and protocols for the hospital pilot.</p>
        </div>

        {/* Disclaimer Warning Box */}
        <div className="mb-8 bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-gray-900 mb-1">Non-Interventional Exploratory Pilot Notice</h4>
              <p className="text-xs text-gray-600 leading-relaxed mb-1">
                Dozemate is being utilized in this pilot strictly as a non-interventional, exploratory sleep/rest intelligence support tool. It is not a diagnostic system and does not replace clinical judgment or emergencies protocols.
              </p>
              <p className="text-xs font-bold text-gray-700">
                ⚠️ All clinical concerns and medical emergencies must follow the hospital’s existing clinical process. SlimIoT support handles device, dashboard, data, and report issues only.
              </p>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-10 group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400 group-focus-within:text-[#0097b2] transition-colors" />
          </div>
          <input
            type="text"
            placeholder="Search FAQs, device guides, or pilot document titles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-12 pr-16 py-4 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder-gray-500 focus:bg-white focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] transition-all shadow-sm"
          />
        </div>

        {/* Main 2-Column Grid */}
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Left Column (Main resources) */}
          <div className="flex-1 space-y-8">
            
            {/* Grid Items */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Device Setup Guide */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:border-teal-100 transition-colors group flex flex-col">
                <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center mb-4 text-[#0097b2]">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Device Setup Guide</h3>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed flex-1">
                  How to properly mount Dozemate sensors, position the gateway, and verify hardware connectivity in the ward.
                </p>
                <button 
                  onClick={() => {
                    setSetupStep(1);
                    setShowSetupModal(true);
                  }}
                  className="inline-flex items-center text-xs font-bold text-[#007b90] group-hover:text-[#0097b2] transition-colors focus:outline-none text-left"
                >
                  View Guide <ArrowRight className="w-3 h-3 ml-1" />
                </button>
              </div>

              {/* Pilot Protocols */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:border-teal-100 transition-colors group flex flex-col">
                <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center mb-4 text-[#0097b2]">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Pilot Protocols</h3>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed flex-1">
                  Step-by-step Standard Operating Procedures (SOPs) for participant enrollment and data-quality checks.
                </p>
                <button 
                  onClick={() => {
                    setProtocolStep(1);
                    setShowProtocolsModal(true);
                  }}
                  className="inline-flex items-center text-xs font-bold text-[#007b90] group-hover:text-[#0097b2] transition-colors focus:outline-none text-left"
                >
                  View Protocols <ArrowRight className="w-3 h-3 ml-1" />
                </button>
              </div>

              {/* Report Help */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:border-teal-100 transition-colors group flex flex-col">
                <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center mb-4 text-[#0097b2]">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Report Help</h3>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed flex-1">
                  Guide to reading hypnogram sleep stages, exporting clinical summaries, and checking CSV telemetry availability.
                </p>
                <button 
                  onClick={() => {
                    setReportHelpStep(1);
                    setShowReportHelpModal(true);
                  }}
                  className="inline-flex items-center text-xs font-bold text-[#007b90] group-hover:text-[#0097b2] transition-colors focus:outline-none text-left"
                >
                  Report Support <ArrowRight className="w-3 h-3 ml-1" />
                </button>
              </div>

              {/* Alert Interpretation Guide */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:border-teal-100 transition-colors group flex flex-col">
                <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center mb-4 text-[#0097b2]">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Alert Interpretation Guide</h3>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed flex-1">
                  Understand technical alerts (e.g. poor signal quality, device offline) and difference between global and custom thresholds.
                </p>
                <button 
                  onClick={() => {
                    setAlertGuideStep(1);
                    setShowAlertGuideModal(true);
                  }}
                  className="inline-flex items-center text-xs font-bold text-[#007b90] group-hover:text-[#0097b2] transition-colors focus:outline-none text-left"
                >
                  Interpretation Guide <ArrowRight className="w-3 h-3 ml-1" />
                </button>
              </div>
            </div>

            {/* FAQs Accordion */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                <HelpCircle className="w-5 h-5 text-[#0097b2] mr-2" />
                Frequently Asked Questions
              </h3>
              <div className="space-y-4">
                {filteredFaqs.length > 0 ? (
                  filteredFaqs.map((faq, index) => (
                    <div key={index} className="border-b border-gray-100 pb-3">
                      <button
                        onClick={() => setActiveAccordion(activeAccordion === index ? null : index)}
                        className="w-full text-left font-bold text-sm text-gray-800 hover:text-[#007b90] flex justify-between items-center py-2"
                      >
                        <span>{faq.q}</span>
                        <span className="text-lg">{activeAccordion === index ? '−' : '+'}</span>
                      </button>
                      {activeAccordion === index && (
                        <p className="text-xs text-gray-500 mt-2 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
                          {faq.a}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-400">No FAQ matches search query.</p>
                )}
              </div>
            </div>

            {/* Escalation Matrix */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm overflow-hidden">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                <FileSpreadsheet className="w-5 h-5 text-[#0097b2] mr-2" />
                Support Escalation Matrix
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs font-bold text-gray-500 uppercase">
                      <th className="pb-3">Level</th>
                      <th className="pb-3">Support Area</th>
                      <th className="pb-3">Contact Person / Desk</th>
                      <th className="pb-3">SLA Response</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs text-gray-600">
                    <tr>
                      <td className="py-3 font-bold">Tier 1 (Ward)</td>
                      <td className="py-3">Hardware pairing, cable routing</td>
                      <td className="py-3 font-medium">On-Duty Ward Coordinator</td>
                      <td className="py-3 text-[#007b90] font-semibold">Immediate</td>
                    </tr>
                    <tr>
                      <td className="py-3 font-bold">Tier 2 (Hospital IT)</td>
                      <td className="py-3">WiFi connectivity, local server status</td>
                      <td className="py-3 font-medium">Hospital Helpdesk (Ext: 4409)</td>
                      <td className="py-3 text-[#007b90] font-semibold">&lt; 1 Hour</td>
                    </tr>
                    <tr>
                      <td className="py-3 font-bold">Tier 3 (SlimIoT Dev)</td>
                      <td className="py-3">Dashboard bugs, report errors, database sync</td>
                      <td className="py-3 font-medium">SlimIoT Dev Desk (info@slimiot.com)</td>
                      <td className="py-3 text-[#007b90] font-semibold">&lt; 4 Hours</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>


          </div>

          {/* Right Column (Desk Operations) */}
          <div className="lg:w-[360px] shrink-0">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 flex flex-col space-y-6">
              
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Support Desk</h2>
                <p className="text-xs text-gray-500 leading-relaxed">Submit tickets or connect with pilot developers directly.</p>
              </div>

              {/* Technical Desk Action */}
              <div className="bg-teal-50 border border-teal-100 rounded-xl p-5">
                <div className="flex items-center mb-3">
                  <Ticket className="w-5 h-5 text-[#0097b2] mr-2" />
                  <h3 className="text-sm font-bold text-gray-900">Technical Desk</h3>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed mb-4">
                  Log setup issues, signal concerns, report errors, or dashboard bugs directly to our database.
                </p>
                <Link 
                  to="/tickets"
                  className="w-full bg-[#007b90] hover:bg-[#006a7c] text-white py-2.5 rounded-lg text-xs font-bold transition-colors shadow-sm uppercase tracking-wider block text-center"
                >
                  Manage Support Tickets
                </Link>
              </div>



              {/* Pilot Logo Stamp */}
              <div className="bg-gray-900 rounded-xl overflow-hidden relative h-28 flex items-end p-4 border border-gray-800">
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#00c4b5] via-gray-900 to-black"></div>
                <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '10px 10px' }}></div>
                <h4 className="relative z-10 text-white text-xs font-bold italic w-3/4 leading-snug">
                  "Supporting hospital pilot intelligence and workflow validation."
                </h4>
              </div>

            </div>
          </div>

        </div>

      </div>

      {/* Device Setup Guide Modal */}
      {showSetupModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Device Setup Guide</h3>
                <p className="text-xs text-gray-500 mt-1">
                  How to properly mount Dozemate sensors, position the gateway, and verify hardware connectivity in the ward.
                </p>
              </div>
              <button 
                onClick={() => setShowSetupModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Step Navigation Tabs */}
              <div className="flex border-b border-gray-100 pb-px">
                <button
                  onClick={() => setSetupStep(1)}
                  className={`pb-3 text-xs font-bold border-b-2 px-1 transition-all mr-6 focus:outline-none ${
                    setupStep === 1 
                      ? 'border-[#0097b2] text-[#0097b2]' 
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  Step 1: Power On
                </button>
                <button
                  onClick={() => setSetupStep(2)}
                  className={`pb-3 text-xs font-bold border-b-2 px-1 transition-all mr-6 focus:outline-none ${
                    setupStep === 2 
                      ? 'border-[#0097b2] text-[#0097b2]' 
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  Step 2: Place Sensor
                </button>
                <button
                  onClick={() => setSetupStep(3)}
                  className={`pb-3 text-xs font-bold border-b-2 px-1 transition-all mr-6 focus:outline-none ${
                    setupStep === 3 
                      ? 'border-[#0097b2] text-[#0097b2]' 
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  Step 3: Provision Device
                </button>
              </div>

              {/* Step 1 content */}
              {setupStep === 1 && (
                <div className="space-y-6">
                  {/* SVG Illustration Container */}
                  <div className="flex justify-center bg-gray-50/50 border border-gray-100 rounded-xl p-4">
                    <img 
                      src={onOffSvg} 
                      className="max-h-72 w-auto object-contain rounded-lg"
                      alt="Power On the Gateway" 
                    />
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-base font-bold text-gray-900">Step 1: Power On the Gateway</h4>
                    <ul className="space-y-2.5">
                      <li className="flex items-start text-sm text-gray-600">
                        <span className="w-1.5 h-1.5 bg-[#0097b2] rounded-full shrink-0 mt-2 mr-3" />
                        <span>Turn on the gateway before installation.</span>
                      </li>
                      <li className="flex items-start text-sm text-gray-600">
                        <span className="w-1.5 h-1.5 bg-[#0097b2] rounded-full shrink-0 mt-2 mr-3" />
                        <span>Wait 5 seconds before continuing.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Step 2 content */}
              {setupStep === 2 && (
                <div className="space-y-6">
                  {/* SVG Illustration Container */}
                  <div className="flex justify-center bg-gray-50/50 border border-gray-100 rounded-xl p-4">
                    <img 
                      src={bedPlacementSvg} 
                      className="max-h-72 w-auto object-contain rounded-lg"
                      alt="Place the Sensor" 
                    />
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-base font-bold text-gray-900">Step 2: Place the Sensor</h4>
                    <ul className="space-y-2.5">
                      <li className="flex items-start text-sm text-gray-600">
                        <span className="w-1.5 h-1.5 bg-[#0097b2] rounded-full shrink-0 mt-2 mr-3" />
                        <span>Lay the sensor flat under the mattress.</span>
                      </li>
                      <li className="flex items-start text-sm text-gray-600">
                        <span className="w-1.5 h-1.5 bg-[#0097b2] rounded-full shrink-0 mt-2 mr-3" />
                        <span>Position it beneath the chest area.</span>
                      </li>
                      <li className="flex items-start text-sm text-gray-600">
                        <span className="w-1.5 h-1.5 bg-[#0097b2] rounded-full shrink-0 mt-2 mr-3" />
                        <span>Keep the cable straight.</span>
                      </li>
                      <li className="flex items-start text-sm text-gray-600">
                        <span className="w-1.5 h-1.5 bg-[#0097b2] rounded-full shrink-0 mt-2 mr-3" />
                        <span>Do not fold or bend the sensor.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Step 3 content */}
              {setupStep === 3 && (
                <div className="space-y-6">
                  {/* SVG Illustration Container */}
                  <div className="flex justify-center bg-gray-50/50 border border-gray-100 rounded-xl p-4">
                    <img 
                      src={provisionDeviceSvg} 
                      className="max-h-72 w-auto object-contain rounded-lg"
                      alt="Device Provisioning" 
                    />
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-base font-bold text-gray-900">Step 3: Device Provisioning</h4>
                    <ul className="space-y-2.5">
                      <li className="flex items-start text-sm text-gray-600">
                        <span className="w-1.5 h-1.5 bg-[#0097b2] rounded-full shrink-0 mt-2 mr-3" />
                        <span>Provision the gateway using the Dozemate mobile app Settings page.</span>
                      </li>
                      <li className="flex items-start text-sm text-gray-600">
                        <span className="w-1.5 h-1.5 bg-[#0097b2] rounded-full shrink-0 mt-2 mr-3" />
                        <span>Tap Device Onboarding and follow instructions (credentials required).</span>
                      </li>
                      <li className="flex items-start text-sm text-gray-600">
                        <span className="w-1.5 h-1.5 bg-[#0097b2] rounded-full shrink-0 mt-2 mr-3" />
                        <span>After setup, the gateway will link and appear in Bed Overlays.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
              <div>
                {setupStep > 1 && (
                  <button
                    onClick={() => setSetupStep(prev => prev - 1)}
                    className="px-5 py-2.5 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm focus:outline-none"
                  >
                    Back
                  </button>
                )}
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowSetupModal(false)}
                  className="px-5 py-2.5 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm focus:outline-none"
                >
                  Close
                </button>
                {setupStep < 3 ? (
                  <button
                    onClick={() => setSetupStep(prev => prev + 1)}
                    className="px-5 py-2.5 text-xs font-bold text-white bg-[#007b90] hover:bg-[#0097b2] rounded-xl transition-all shadow-sm focus:outline-none"
                  >
                    Next Step
                  </button>
                ) : (
                  <button
                    disabled
                    className="px-5 py-2.5 text-xs font-bold text-white bg-gray-300 rounded-xl cursor-not-allowed focus:outline-none"
                  >
                    Next Step
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pilot Protocols Modal */}
      {showProtocolsModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Pilot SOPs & Protocols</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Standard Operating Procedures (SOPs) for participant enrollment, signal validation, and daily ward checklists.
                </p>
              </div>
              <button 
                onClick={() => setShowProtocolsModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Step Navigation Tabs */}
              <div className="flex border-b border-gray-100 pb-px">
                <button
                  onClick={() => setProtocolStep(1)}
                  className={`pb-3 text-xs font-bold border-b-2 px-1 transition-all mr-6 focus:outline-none ${
                    protocolStep === 1 
                      ? 'border-[#0097b2] text-[#0097b2]' 
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  1. Participant Enrollment
                </button>
                <button
                  onClick={() => setProtocolStep(2)}
                  className={`pb-3 text-xs font-bold border-b-2 px-1 transition-all mr-6 focus:outline-none ${
                    protocolStep === 2 
                      ? 'border-[#0097b2] text-[#0097b2]' 
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  2. Signal Validation
                </button>
                <button
                  onClick={() => setProtocolStep(3)}
                  className={`pb-3 text-xs font-bold border-b-2 px-1 transition-all mr-6 focus:outline-none ${
                    protocolStep === 3 
                      ? 'border-[#0097b2] text-[#0097b2]' 
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  3. Daily Schedule
                </button>
              </div>

              {/* Step 1 content */}
              {protocolStep === 1 && (
                <div className="space-y-4">
                  <h4 className="text-base font-bold text-gray-900">Participant Onboarding SOP</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Prior to placing any physical sensor, the following clinical and dashboard verification steps must be completed to protect patient data privacy.
                  </p>
                  <ul className="space-y-3 mt-2">
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <span className="w-6 h-6 bg-[#e0f7f4] text-[#0097b2] rounded-full shrink-0 flex items-center justify-center font-bold text-xs mr-3 mt-0.5">1</span>
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Verify Enrollment Eligibility</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Confirm the candidate meets the non-interventional pilot protocol parameters.</p>
                      </div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <span className="w-6 h-6 bg-[#e0f7f4] text-[#0097b2] rounded-full shrink-0 flex items-center justify-center font-bold text-xs mr-3 mt-0.5">2</span>
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Record Informed Consent</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Navigate to "Patient Onboarding" or "User Onboarding" on the sidebar, fill in patient/user parameters, and check the consent confirmation box before saving.</p>
                      </div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <span className="w-6 h-6 bg-[#e0f7f4] text-[#0097b2] rounded-full shrink-0 flex items-center justify-center font-bold text-xs mr-3 mt-0.5">3</span>
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Map Room & Bed IDs</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Link the onboarded participant record to their active Room and Bed ID on the Devices layout dashboard.</p>
                      </div>
                    </li>
                  </ul>
                </div>
              )}

              {/* Step 2 content */}
              {protocolStep === 2 && (
                <div className="space-y-4">
                  <h4 className="text-base font-bold text-gray-900">Telemetry & Signal Validation SOP</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Accurate sleep metrics rely on high-fidelity signal transmission. Confirm signal calibration indicators when the participant lies down.
                  </p>
                  <ul className="space-y-3 mt-2">
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3">
                      <span className="w-2.5 h-2.5 bg-green-500 rounded-full shrink-0 mt-1.5 mr-3" />
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">🟢 Green Status Indicator</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Signal quality is optimal. No action needed.</p>
                      </div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3">
                      <span className="w-2.5 h-2.5 bg-amber-500 rounded-full shrink-0 mt-1.5 mr-3" />
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">🟡 Yellow Status Indicator</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Moderate attenuation. Instruct ward staff to inspect sensor placement beneath the mattress; ensure the participant's chest is positioned directly above the sensor.</p>
                      </div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3">
                      <span className="w-2.5 h-2.5 bg-red-500 rounded-full shrink-0 mt-1.5 mr-3" />
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">🔴 Red Status Indicator</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Device is offline or the bed is unoccupied. Check power/gateway connectivity if the participant is present.</p>
                      </div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 mr-3" />
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Data Loss Threshold Notice</h5>
                        <p className="text-xs text-gray-600 mt-0.5 font-medium">If signal gaps exceed 10% of the overnight monitoring duration, sleep calculations will fail validation checks.</p>
                      </div>
                    </li>
                  </ul>
                </div>
              )}

              {/* Step 3 content */}
              {protocolStep === 3 && (
                <div className="space-y-4">
                  <h4 className="text-base font-bold text-gray-900">Daily Study Schedule Flow</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Follow this checklist daily to ensure clean data collection and report updates across the trial shifts.
                  </p>
                  <ul className="space-y-3 mt-2">
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <div className="shrink-0 mr-4">
                        <span className="text-xs font-bold text-[#0097b2] bg-[#e0f7f4] px-2.5 py-1.5 rounded-lg">10:00 PM</span>
                      </div>
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Confirm Live Connectivity</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Verify that the target participant's bed overlay shows active breathing curves on the dashboard.</p>
                      </div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <div className="shrink-0 mr-4">
                        <span className="text-xs font-bold text-[#0097b2] bg-[#e0f7f4] px-2.5 py-1.5 rounded-lg">08:00 AM</span>
                      </div>
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Verify Cycle Completion</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Check that the participant has exited the bed area and telemetry sync has finished.</p>
                      </div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <div className="shrink-0 mr-4">
                        <span className="text-xs font-bold text-[#0097b2] bg-[#e0f7f4] px-2.5 py-1.5 rounded-lg">Day Shift</span>
                      </div>
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Download & Export Reports</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Go to the "Reports" page, select the date range for the bed session, check data status, and export the hypnogram summaries.</p>
                      </div>
                    </li>
                  </ul>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
              <div>
                {protocolStep > 1 && (
                  <button
                    onClick={() => setProtocolStep(prev => prev - 1)}
                    className="px-5 py-2.5 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm focus:outline-none"
                  >
                    Back
                  </button>
                )}
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowProtocolsModal(false)}
                  className="px-5 py-2.5 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm focus:outline-none"
                >
                  Close
                </button>
                {protocolStep < 3 ? (
                  <button
                    onClick={() => setProtocolStep(prev => prev + 1)}
                    className="px-5 py-2.5 text-xs font-bold text-white bg-[#007b90] hover:bg-[#0097b2] rounded-xl transition-all shadow-sm focus:outline-none"
                  >
                    Next Step
                  </button>
                ) : (
                  <button
                    disabled
                    className="px-5 py-2.5 text-xs font-bold text-white bg-gray-300 rounded-xl cursor-not-allowed focus:outline-none"
                  >
                    Next Step
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Help Modal */}
      {showReportHelpModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Sleep Reports Guide</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Guide to selecting report ranges, configuring PDF downloads, and understanding hypnogram sleep stages.
                </p>
              </div>
              <button 
                onClick={() => setShowReportHelpModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Step Navigation Tabs */}
              <div className="flex border-b border-gray-100 pb-px">
                <button
                  onClick={() => setReportHelpStep(1)}
                  className={`pb-3 text-xs font-bold border-b-2 px-1 transition-all mr-6 focus:outline-none ${
                    reportHelpStep === 1 
                      ? 'border-[#0097b2] text-[#0097b2]' 
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  1. Report Selection
                </button>
                <button
                  onClick={() => setReportHelpStep(2)}
                  className={`pb-3 text-xs font-bold border-b-2 px-1 transition-all mr-6 focus:outline-none ${
                    reportHelpStep === 2 
                      ? 'border-[#0097b2] text-[#0097b2]' 
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  2. Sleep Stages (Hypnogram)
                </button>
                <button
                  onClick={() => setReportHelpStep(3)}
                  className={`pb-3 text-xs font-bold border-b-2 px-1 transition-all mr-6 focus:outline-none ${
                    reportHelpStep === 3 
                      ? 'border-[#0097b2] text-[#0097b2]' 
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  3. Key Metrics
                </button>
              </div>

              {/* Step 1 content */}
              {reportHelpStep === 1 && (
                <div className="space-y-4">
                  <h4 className="text-base font-bold text-gray-900">Configuring and Generating Reports</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Choose between querying a specific patient or a physical device to compile and generate overnight sleep studies.
                  </p>
                  <ul className="space-y-3.5 mt-2">
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <span className="w-6 h-6 bg-[#e0f7f4] text-[#0097b2] rounded-full shrink-0 flex items-center justify-center font-bold text-xs mr-3 mt-0.5">A</span>
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Patient-wise Selection Mode</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Select "Patient" mode, type the participant's name to search, and the dashboard will automatically map their active device telemetry.</p>
                      </div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <span className="w-6 h-6 bg-[#e0f7f4] text-[#0097b2] rounded-full shrink-0 flex items-center justify-center font-bold text-xs mr-3 mt-0.5">B</span>
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Device-wise Selection Mode</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Select "Device" mode, then pick the target gateway's hardware address from the drop-down list directly.</p>
                      </div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <span className="w-6 h-6 bg-[#e0f7f4] text-[#0097b2] rounded-full shrink-0 flex items-center justify-center font-bold text-xs mr-3 mt-0.5">C</span>
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Select Metrics & Generate PDF</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Click "Check Data Availability" to load graphs, choose which vitals curves to show, and click "Generate PDF Report" to download the document.</p>
                      </div>
                    </li>
                  </ul>
                </div>
              )}

              {/* Step 2 content */}
              {reportHelpStep === 2 && (
                <div className="space-y-4">
                  <h4 className="text-base font-bold text-gray-900">Understanding Hypnogram Sleep Stages</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    The overnight hypnogram visualizes transitions between four vital sleep/rest stages classified by the algorithm:
                  </p>
                  <ul className="space-y-3 mt-2">
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3">
                      <span className="w-2.5 h-2.5 bg-red-400 rounded-full shrink-0 mt-1.5 mr-3" />
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Awake / Disturbed</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Periods of clear wakefulness, micro-arousals, or substantial body turns detected by the sensors.</p>
                      </div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3">
                      <span className="w-2.5 h-2.5 bg-[#0097b2] rounded-full shrink-0 mt-1.5 mr-3" />
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">REM-like Sleep</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Sleep state showing heightened variability in heart and breathing rate signals, matching active dreaming rest.</p>
                      </div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3">
                      <span className="w-2.5 h-2.5 bg-blue-300 rounded-full shrink-0 mt-1.5 mr-3" />
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Light Sleep</h5>
                        <p className="text-xs text-gray-500 mt-0.5">The transitional default rest stage, representing stable physiological indicators.</p>
                      </div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3">
                      <span className="w-2.5 h-2.5 bg-blue-900 rounded-full shrink-0 mt-1.5 mr-3" />
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Deep Recovery Sleep</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Restorative deep recovery rest. Indicated by minimal movement, stable low heart rate, and low respiratory median indicators.</p>
                      </div>
                    </li>
                  </ul>
                </div>
              )}

              {/* Step 3 content */}
              {reportHelpStep === 3 && (
                <div className="space-y-4">
                  <h4 className="text-base font-bold text-gray-900">Key Overnight Metrics Definitions</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Definitions of key parameters displayed in the report header and summaries:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <h5 className="font-bold text-gray-900 text-xs">Total Sleep Time (TST)</h5>
                      <p className="text-xs text-gray-500 mt-0.5">The cumulative minutes spent in Deep, Light, and REM rest stages combined.</p>
                    </div>
                    <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <h5 className="font-bold text-gray-900 text-xs">Sleep Efficiency</h5>
                      <p className="text-xs text-gray-500 mt-0.5">Percentage of time in bed actually spent sleeping. Target efficiency is &gt;85%.</p>
                    </div>
                    <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <h5 className="font-bold text-gray-900 text-xs">WASO</h5>
                      <p className="text-xs text-gray-500 mt-0.5">Wake After Sleep Onset. Total minutes spent in the Awake stage after sleep was first initiated.</p>
                    </div>
                    <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <h5 className="font-bold text-gray-900 text-xs">Sleep Score</h5>
                      <p className="text-xs text-gray-500 mt-0.5">Calculated score out of 100 based on efficiency, deep sleep ratio, REM ratio, and awakenings.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
              <div>
                {reportHelpStep > 1 && (
                  <button
                    onClick={() => setReportHelpStep(prev => prev - 1)}
                    className="px-5 py-2.5 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm focus:outline-none"
                  >
                    Back
                  </button>
                )}
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowReportHelpModal(false)}
                  className="px-5 py-2.5 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm focus:outline-none"
                >
                  Close
                </button>
                {reportHelpStep < 3 ? (
                  <button
                    onClick={() => setReportHelpStep(prev => prev + 1)}
                    className="px-5 py-2.5 text-xs font-bold text-white bg-[#007b90] hover:bg-[#0097b2] rounded-xl transition-all shadow-sm focus:outline-none"
                  >
                    Next Step
                  </button>
                ) : (
                  <button
                    disabled
                    className="px-5 py-2.5 text-xs font-bold text-white bg-gray-300 rounded-xl cursor-not-allowed focus:outline-none"
                  >
                    Next Step
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert Interpretation Guide Modal */}
      {showAlertGuideModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Alert Interpretation Guide</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Guide to clinical threshold notifications, technical signal warnings, and global vs. individual configuration modes.
                </p>
              </div>
              <button 
                onClick={() => setShowAlertGuideModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Step Navigation Tabs */}
              <div className="flex border-b border-gray-100 pb-px">
                <button
                  onClick={() => setAlertGuideStep(1)}
                  className={`pb-3 text-xs font-bold border-b-2 px-1 transition-all mr-6 focus:outline-none ${
                    alertGuideStep === 1 
                      ? 'border-[#0097b2] text-[#0097b2]' 
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  1. Clinical Alerts & Thresholds
                </button>
                <button
                  onClick={() => setAlertGuideStep(2)}
                  className={`pb-3 text-xs font-bold border-b-2 px-1 transition-all mr-6 focus:outline-none ${
                    alertGuideStep === 2 
                      ? 'border-[#0097b2] text-[#0097b2]' 
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  2. Technical Alerts
                </button>
                <button
                  onClick={() => setAlertGuideStep(3)}
                  className={`pb-3 text-xs font-bold border-b-2 px-1 transition-all mr-6 focus:outline-none ${
                    alertGuideStep === 3 
                      ? 'border-[#0097b2] text-[#0097b2]' 
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  3. Configuration Modes
                </button>
              </div>

              {/* Step 1 content */}
              {alertGuideStep === 1 && (
                <div className="space-y-4">
                  <h4 className="text-base font-bold text-gray-900">Clinical Threshold Alerts</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Clinical alerts trigger in real-time when a patient's vitals cross safety boundaries, displaying an instant notification in the dashboard sidebar:
                  </p>
                  <ul className="space-y-3.5 mt-2">
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <span className="w-2.5 h-2.5 bg-red-500 rounded-full shrink-0 mt-1.5 mr-3" />
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Heart Rate Alarm (BPM)</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Triggers if the heart rate drops below the minimum limit or exceeds the maximum limit. Message format: <em>"In Room [Room] on Bed [Bed], [Patient]'s Heart Rate is [Value] (above max / below min)"</em>.</p>
                      </div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <span className="w-2.5 h-2.5 bg-red-500 rounded-full shrink-0 mt-1.5 mr-3" />
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Respiration Rate Alarm (Br/M)</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Triggers if breathing frequency falls out of bounds (and no active Heart Rate alert is present). Message format: <em>"In Room [Room] on Bed [Bed], [Patient]'s Respiration is [Value] (above max / below min)"</em>.</p>
                      </div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 bg-teal-50 border border-teal-100 rounded-xl p-3">
                      <AlertCircle className="w-4 h-4 text-[#0097b2] shrink-0 mt-0.5 mr-3" />
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs text-[#007b90]">Alert Throttling & Debounce</h5>
                        <p className="text-xs text-gray-600 mt-0.5">To prevent coordinator alarm fatigue, the system suppresses duplicate alerts for the same category on a device for a set period.</p>
                      </div>
                    </li>
                  </ul>
                </div>
              )}

              {/* Step 2 content */}
              {alertGuideStep === 2 && (
                <div className="space-y-4">
                  <h4 className="text-base font-bold text-gray-900">Technical Connection Alerts</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Technical alerts indicate issues with physical sensor positioning, hardware status, or local connection gaps:
                  </p>
                  <ul className="space-y-3.5 mt-2">
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <span className="w-2.5 h-2.5 bg-amber-500 rounded-full shrink-0 mt-1.5 mr-3" />
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Poor Signal Warning (Yellow Status)</h5>
                        <p className="text-xs text-gray-500 mt-0.5">Sensor waveforms are attenuated. Verify that the sensor strip is flat beneath the mattress and centered directly below the patient's chest.</p>
                      </div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <span className="w-2.5 h-2.5 bg-red-500 rounded-full shrink-0 mt-1.5 mr-3" />
                      <div>
                        <h5 className="font-bold text-gray-900 text-xs">Device Offline Alert (Red Status)</h5>
                        <p className="text-xs text-gray-500 mt-0.5">The server hasn't received telemetry packets from a bed for &gt;30 seconds. Verify the gateway is powered, connected to WiFi, and the device is within BLE range.</p>
                      </div>
                    </li>
                  </ul>
                </div>
              )}

              {/* Step 3 content */}
              {alertGuideStep === 3 && (
                <div className="space-y-4">
                  <h4 className="text-base font-bold text-gray-900">Global vs. Individual Configuration</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Manage alert configurations by navigating to the <strong>Configuration</strong> page and selecting the <strong>Clinical Thresholds</strong> tab.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <h5 className="font-bold text-gray-900 text-xs">Global Mode (Inherited)</h5>
                      <p className="text-xs text-gray-500 mt-1.5">
                        The device inherits the organization-wide limits set under Global Parameters. Any change made to the global limits instantly updates all beds operating in Global Mode.
                      </p>
                    </div>
                    <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-3.5">
                      <h5 className="font-bold text-gray-900 text-xs">Individual Mode (Customized)</h5>
                      <p className="text-xs text-gray-500 mt-1.5">
                        Select a device from the dropdown and modify its heart rate and respiration boundaries. Saving these custom boundaries decouples the device from global limits.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
              <div>
                {alertGuideStep > 1 && (
                  <button
                    onClick={() => setAlertGuideStep(prev => prev - 1)}
                    className="px-5 py-2.5 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm focus:outline-none"
                  >
                    Back
                  </button>
                )}
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowAlertGuideModal(false)}
                  className="px-5 py-2.5 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm focus:outline-none"
                >
                  Close
                </button>
                {alertGuideStep < 3 ? (
                  <button
                    onClick={() => setAlertGuideStep(prev => prev + 1)}
                    className="px-5 py-2.5 text-xs font-bold text-white bg-[#007b90] hover:bg-[#0097b2] rounded-xl transition-all shadow-sm focus:outline-none"
                  >
                    Next Step
                  </button>
                ) : (
                  <button
                    disabled
                    className="px-5 py-2.5 text-xs font-bold text-white bg-gray-300 rounded-xl cursor-not-allowed focus:outline-none"
                  >
                    Next Step
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
