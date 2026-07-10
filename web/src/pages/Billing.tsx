import DashboardLayout from '@/components/layout/DashboardLayout';
import { ChevronRight, Download, Plus, FileText, Users, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Billing() {
  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-8 pb-32">
        
        {/* Top Breadcrumb */}
        <div className="flex items-center text-xs font-bold text-gray-500 mb-6">
          <Link to="/settings" className="hover:text-gray-900 transition-colors">Settings</Link>
          <ChevronRight className="w-3 h-3 mx-2" />
          <span className="text-[#007b90]">Billing & Subscription</span>
        </div>

        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <h1 className="text-3xl font-bold text-gray-900">Billing & Subscription</h1>
          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <button className="flex-1 sm:flex-none flex items-center justify-center bg-white border border-[#007b90] text-[#007b90] hover:bg-teal-50 px-5 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm">
              <Download className="w-4 h-4 mr-2" />
              Export Statement
            </button>
            <button className="flex-1 sm:flex-none flex items-center justify-center bg-[#005f70] hover:bg-[#004a58] text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Seats
            </button>
          </div>
        </div>

        {/* Top Summary Cards */}
        <div className="flex flex-col lg:flex-row gap-6 mb-6">
          
          {/* Plan Information */}
          <div className="flex-1 bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col">
            <div className="flex justify-between items-start mb-6">
              <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-[#007b90]" />
              </div>
              <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-full text-xs font-bold flex items-center shadow-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2"></div>
                Clinical Trial - Active
              </div>
            </div>
            
            <h2 className="text-xl font-bold text-gray-900 mb-2">Dozemate Enterprise</h2>
            <p className="text-sm text-gray-500 mb-8 leading-relaxed max-w-sm">
              Full clinical surveillance suite for institutional research and sleep diagnostic labs.
            </p>
            
            <div className="mt-auto border-t border-gray-100 pt-5 flex justify-between items-end">
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Next Renewal</div>
                <div className="text-base font-bold text-[#005f70]">January 24, 2025</div>
              </div>
              <button className="text-sm font-bold text-[#007b90] hover:text-[#005f70] transition-colors underline">
                Change Plan
              </button>
            </div>
          </div>

          {/* Seat Usage */}
          <div className="flex-[1.5] bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mr-4">
                  <Users className="w-5 h-5 text-[#005f70]" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Seat Usage</h2>
                  <p className="text-sm text-gray-500">Organization resource allocation</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-3xl font-bold text-[#005f70]">65</span>
                <span className="text-lg font-medium text-gray-400">/100</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-xs font-bold mb-2">
                <span className="text-gray-700">Used Seats (65%)</span>
                <span className="text-[#007b90]">35 Available</span>
              </div>
              <div className="h-3 w-full bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-[#005f70] rounded-full" style={{ width: '65%' }}></div>
              </div>
            </div>

            {/* Breakdown Sub-grid */}
            <div className="grid grid-cols-3 gap-4">
              <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Clinicians</div>
                <div className="text-xl font-bold text-[#005f70]">42</div>
              </div>
              <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Admins</div>
                <div className="text-xl font-bold text-[#005f70]">08</div>
              </div>
              <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Viewers</div>
                <div className="text-xl font-bold text-[#005f70]">15</div>
              </div>
            </div>
          </div>
        </div>

        {/* Usage Alert Banner */}
        <div className="bg-[#fffdf0] border border-[#fde047] rounded-xl p-5 mb-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-[#d97706] shrink-0 mr-4 mt-0.5" />
            <div>
              <p className="text-sm text-gray-900 leading-relaxed max-w-4xl">
                <span className="font-bold text-[#b45309]">Usage Alert:</span> Your organization is nearing the 80% seat limit. Consider adding more seats to avoid disruption for new medical staff.
              </p>
            </div>
          </div>
          <button className="mt-4 sm:mt-0 shrink-0 text-sm font-bold text-[#b45309] border border-[#fde047] hover:bg-[#fefce8] bg-white px-4 py-2 rounded transition-colors sm:ml-4 shadow-sm">
            Upgrade<br />Seats
          </button>
        </div>

        {/* Billing History Table */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-8">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900">Billing History</h2>
            <span className="text-sm font-medium text-gray-400">Showing last 6 months</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-gray-50/50">
                  <th className="py-4 px-6">Invoice ID</th>
                  <th className="py-4 px-6">Date</th>
                  <th className="py-4 px-6">Amount</th>
                  <th className="py-4 px-6">Plan</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                
                {/* Row 1 */}
                <tr className="hover:bg-gray-50/30 transition-colors">
                  <td className="py-4 px-6 font-bold text-[#007b90]">INV-2024-0012</td>
                  <td className="py-4 px-6 text-gray-900">Dec 01, 2024</td>
                  <td className="py-4 px-6 font-bold text-gray-900">$1,240.00</td>
                  <td className="py-4 px-6 text-gray-600">Enterprise (Annual)</td>
                  <td className="py-4 px-6">
                    <span className="bg-green-50 text-green-700 text-[10px] font-bold px-3 py-1 rounded-full tracking-widest">Paid</span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button className="text-xs font-bold text-[#007b90] hover:text-[#005f70] transition-colors">Download</button>
                  </td>
                </tr>

                {/* Row 2 */}
                <tr className="hover:bg-gray-50/30 transition-colors">
                  <td className="py-4 px-6 font-bold text-[#007b90]">INV-2024-0011</td>
                  <td className="py-4 px-6 text-gray-900">Nov 01, 2024</td>
                  <td className="py-4 px-6 font-bold text-gray-900">$1,240.00</td>
                  <td className="py-4 px-6 text-gray-600">Enterprise (Annual)</td>
                  <td className="py-4 px-6">
                    <span className="bg-green-50 text-green-700 text-[10px] font-bold px-3 py-1 rounded-full tracking-widest">Paid</span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button className="text-xs font-bold text-[#007b90] hover:text-[#005f70] transition-colors">Download</button>
                  </td>
                </tr>

                {/* Row 3 */}
                <tr className="hover:bg-gray-50/30 transition-colors">
                  <td className="py-4 px-6 font-bold text-[#007b90]">INV-2024-0010</td>
                  <td className="py-4 px-6 text-gray-900">Oct 01, 2024</td>
                  <td className="py-4 px-6 font-bold text-gray-900">$1,240.00</td>
                  <td className="py-4 px-6 text-gray-600">Enterprise (Annual)</td>
                  <td className="py-4 px-6">
                    <span className="bg-red-50 text-red-600 text-[10px] font-bold px-3 py-1 rounded-full tracking-widest">Failed</span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button className="text-xs font-bold text-red-600 hover:text-red-700 transition-colors">Retry Payment</button>
                  </td>
                </tr>

                {/* Row 4 */}
                <tr className="hover:bg-gray-50/30 transition-colors">
                  <td className="py-4 px-6 font-bold text-[#007b90]">INV-2024-0009</td>
                  <td className="py-4 px-6 text-gray-900">Sep 01, 2024</td>
                  <td className="py-4 px-6 font-bold text-gray-900">$980.00</td>
                  <td className="py-4 px-6 text-gray-600">Standard (Annual)</td>
                  <td className="py-4 px-6">
                    <span className="bg-green-50 text-green-700 text-[10px] font-bold px-3 py-1 rounded-full tracking-widest">Paid</span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button className="text-xs font-bold text-[#007b90] hover:text-[#005f70] transition-colors">Download</button>
                  </td>
                </tr>

              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Payment Scaffolding */}
        <div className="flex gap-6">
          <div className="flex-1 bg-white border border-gray-200 rounded-xl p-6 shadow-sm h-32">
            <h2 className="text-lg font-bold text-gray-900">Payment Method</h2>
            {/* Content cut off in design */}
          </div>
          <div className="flex-[1.5] bg-white border border-gray-200 rounded-xl p-6 shadow-sm h-32">
             {/* Content cut off in design */}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
