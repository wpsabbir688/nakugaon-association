import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { LanguageProvider } from './contexts/LanguageContext.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { PublicLayout, AdminLayout, MemberLayout } from './layouts/layouts.jsx';
import { HomePage, AboutPage, ContactPage, PrivacyPage, NoticesPage } from './pages/public/static.jsx';
import { MembersPage, MemberProfilePage, OutstandingPage } from './pages/public/directory.jsx';
import { LoginPage } from './pages/public/Login.jsx';
import { AdminDashboard } from './pages/admin/Dashboard.jsx';
import { AdminMembers, AdminMemberDetail, AdminVehicles, AdminWeighbridge, AdminPayments, AdminLedger, AdminFeeRules } from './pages/admin/ops.jsx';
import { AdminReports, AdminNotices, AdminExpenses, AdminAudit, AdminUsers, AdminSettings } from './pages/admin/misc.jsx';
import { MemberPortal, MemberLedgerPage, MemberProfilePage as PortalProfile } from './pages/member/portal.jsx';

function LangRoutes() {
  const { lang } = useParams();
  if (lang !== 'bn' && lang !== 'en') return <Navigate to="/bn" replace />;
  return (
    <LanguageProvider>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="members/:memberId" element={<MemberProfilePage />} />
          <Route path="outstanding" element={<OutstandingPage />} />
          <Route path="notices" element={<NoticesPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="login" element={<LoginPage />} />
        </Route>
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="members" element={<AdminMembers />} />
          <Route path="members/:memberId" element={<AdminMemberDetail />} />
          <Route path="vehicles" element={<AdminVehicles />} />
          <Route path="weighbridge" element={<AdminWeighbridge />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="ledger" element={<AdminLedger />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="fees" element={<AdminFeeRules />} />
          <Route path="notices" element={<AdminNotices />} />
          <Route path="expenses" element={<AdminExpenses />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
        <Route path="portal" element={<MemberLayout />}>
          <Route index element={<MemberPortal />} />
          <Route path="ledger" element={<MemberLedgerPage />} />
          <Route path="profile" element={<PortalProfile />} />
        </Route>
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </LanguageProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/bn" replace />} />
        <Route path="/:lang/*" element={<LangRoutes />} />
        <Route path="*" element={<Navigate to="/bn" replace />} />
      </Routes>
    </AuthProvider>
  );
}
