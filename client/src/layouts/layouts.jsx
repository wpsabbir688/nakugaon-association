import { Outlet, Link, useParams } from 'react-router-dom';
import { Header, Footer } from '../components/ui.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLanguage } from '../contexts/LanguageContext.jsx';

export function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

const STAFF_ROLES = ['SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT', 'OPERATOR'];

export function AdminLayout() {
  const { user, ready } = useAuth();
  const { lang, t } = useLanguage();
  const { '*': rest } = useParams();
  void rest;
  if (!ready) return <div className="p-8">{t.loading}</div>;
  if (!user || !STAFF_ROLES.includes(user.role)) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="bg-white border rounded-2xl p-8 text-center">
          <p className="font-semibold">Access denied — staff only.</p>
          <Link to={`/${lang}/login`} className="text-teal-600 underline">Login</Link>
        </div>
      </div>
    );
  }
  const items = [
    ['dashboard', 'admin', t.dashboard],
    ['members', 'admin/members', t.members],
    ['vehicles', 'admin/vehicles', t.vehicles],
    ['weighbridge', 'admin/weighbridge', t.weighbridge],
    ['payments', 'admin/payments', t.payments],
    ['ledger', 'admin/ledger', t.ledger],
    ['reports', 'admin/reports', t.reports],
    ['fees', 'admin/fees', t.feeRules],
    ['notices', 'admin/notices', t.notices],
    ['expenses', 'admin/expenses', t.expenses],
    ['audit', 'admin/audit', t.auditLog],
    ['users', 'admin/users', t.users],
    ['settings', 'admin/settings', t.settings],
  ];
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 flex gap-6 flex-col md:flex-row">
        <aside className="md:w-56 shrink-0">
          <div className="bg-white border rounded-2xl p-3 flex md:flex-col gap-1 flex-wrap sticky top-20">
            {items.map(([key, path, label]) => (
              <Link key={key} to={`/${lang}/${path}`} className="px-3 py-2 rounded-lg text-sm hover:bg-slate-100 block">{label}</Link>
            ))}
          </div>
        </aside>
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
      <Footer />
    </div>
  );
}

export function MemberLayout() {
  const { user, ready } = useAuth();
  const { lang, t } = useLanguage();
  if (!ready) return <div className="p-8">{t.loading}</div>;
  if (!user || user.role !== 'MEMBER') {
    return (
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="bg-white border rounded-2xl p-8 text-center">
          <p className="font-semibold">Member portal — please log in as a member.</p>
          <Link to={`/${lang}/login`} className="text-teal-600 underline">Login</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <div className="flex gap-2 mb-6 flex-wrap">
          <Link to={`/${lang}/portal`} className="px-3 py-2 rounded-lg bg-white border text-sm">{t.myPortal}</Link>
          <Link to={`/${lang}/portal/ledger`} className="px-3 py-2 rounded-lg bg-white border text-sm">{t.ledger}</Link>
          <Link to={`/${lang}/portal/profile`} className="px-3 py-2 rounded-lg bg-white border text-sm">{t.navMembers}</Link>
        </div>
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}
