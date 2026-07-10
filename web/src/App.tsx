import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import SessionDetails from '@/pages/SessionDetails';
import Devices from '@/pages/Devices';
import LiveGrid from '@/pages/LiveGrid';
import LiveDetail from '@/pages/LiveDetail';
import Reports from '@/pages/Reports';
import Feedback from '@/pages/Feedback';
import Notifications from '@/pages/Notifications';
import NewSession from '@/pages/NewSession';
import Configuration from '@/pages/Configuration';
import Support from '@/pages/Support';
import Tickets from '@/pages/Tickets';
import Settings from '@/pages/Settings';
import UserManagement from '@/pages/UserManagement';
import AccountProfile from '@/pages/AccountProfile';
import SecurityPrivacy from '@/pages/SecurityPrivacy';
import Billing from '@/pages/Billing';
import OrganizationProfile from '@/pages/OrganizationProfile';
import AdminDashboard from '@/pages/AdminDashboard';
import SuperAdminChangePassword from '@/pages/SuperAdminChangePassword';
import HospitalChangePassword from '@/pages/HospitalChangePassword';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import TermsOfService from '@/pages/TermsOfService';
import MobileBlocker from '@/components/common/MobileBlocker';
import NotFound from '@/pages/NotFound';

function App() {
  return (
    <>
      <MobileBlocker />
      <Router basename="/admin">
        <Routes>
          <Route path="/" element={<Login />} />
        <Route path="/admin/setup" element={<SuperAdminChangePassword />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/dashboard/setup" element={<HospitalChangePassword />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/sessions/new" element={<NewSession />} />
        <Route path="/sessions/:id" element={<SessionDetails />} />
        <Route path="/sessions" element={<SessionDetails />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/configuration" element={<Configuration />} />
        <Route path="/support" element={<Support />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/users" element={<UserManagement />} />
        <Route path="/settings/account" element={<AccountProfile />} />
        <Route path="/settings/organization" element={<OrganizationProfile />} />
        <Route path="/settings/security" element={<SecurityPrivacy />} />
        <Route path="/settings/billing" element={<Billing />} />
        <Route path="/live/:deviceId" element={<LiveDetail />} />
        <Route path="/live" element={<LiveGrid />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Router>
    </>
  );
}

export default App;
