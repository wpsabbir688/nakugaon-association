import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Globe, LogOut } from 'lucide-react';

export function Header() {
  const { lang, t, switchLang } = useLanguage();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = [
    { to: `/${lang}`, label: t.navHome },
    { to: `/${lang}/about`, label: t.navAbout },
    { to: `/${lang}/members`, label: t.navMembers },
    { to: `/${lang}/outstanding`, label: t.navOutstanding },
    { to: `/${lang}/notices`, label: t.navNotices },
    { to: `/${lang}/contact`, label: t.navContact },
  ];
  return (
    <header className="bg-navy-900 text-white sticky top-0 z-40 shadow">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
        <Link to={`/${lang}`} className="font-bold text-lg leading-tight">
          {t.orgShort}
        </Link>
        <nav className="flex gap-4 text-sm flex-wrap flex-1">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="hover:text-teal-500">{l.label}</Link>
          ))}
        </nav>
        <button onClick={() => switchLang(lang === 'bn' ? 'en' : 'bn')} className="flex items-center gap-1 text-sm border border-white/30 rounded-full px-3 py-1 hover:bg-white/10">
          <Globe size={14} /> {lang === 'bn' ? 'English' : 'বাংলা'}
        </button>
        {user ? (
          <>
            <Link to={user.role === 'MEMBER' ? `/${lang}/portal` : `/${lang}/admin`} className="text-sm bg-teal-600 px-3 py-1 rounded-full">
              {user.role === 'MEMBER' ? t.myPortal : t.dashboard}
            </Link>
            <button onClick={async () => { await logout(); navigate(`/${lang}`); }} className="text-sm flex items-center gap-1 hover:text-teal-500">
              <LogOut size={14} /> {t.logout}
            </button>
          </>
        ) : (
          <Link to={`/${lang}/login`} className="text-sm bg-teal-600 px-3 py-1 rounded-full">{t.navLogin}</Link>
        )}
      </div>
    </header>
  );
}

export function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="bg-navy-900 text-white/80 mt-12">
      <div className="max-w-7xl mx-auto px-4 py-8 text-sm flex flex-wrap gap-6 justify-between">
        <div>
          <div className="font-semibold text-white">{t.orgName}</div>
          <div className="mt-1">{t.currencyNote}</div>
        </div>
        <div>{t.privacyTitle}</div>
      </div>
    </footer>
  );
}

export function StatCard({ title, value, accent }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border p-5">
      <div className="text-sm text-slate-500">{title}</div>
      <div className={`text-2xl font-bold mt-1 ${accent || ''}`}>{value}</div>
    </div>
  );
}

export function Badge({ children, tone }) {
  const tones = {
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800',
    slate: 'bg-slate-100 text-slate-700',
    teal: 'bg-teal-100 text-teal-800',
  };
  return <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${tones[tone] || tones.slate}`}>{children}</span>;
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return null;
  return (
    <div className="flex gap-2 mt-4 flex-wrap">
      {Array.from({ length: meta.pages }, (_, i) => i + 1).map((p) => (
        <button key={p} onClick={() => onPage(p)} className={`px-3 py-1 rounded-lg border text-sm ${p === meta.page ? 'bg-navy-900 text-white' : 'bg-white'}`}>
          {p}
        </button>
      ))}
    </div>
  );
}

export function Empty({ text }) {
  return <div className="bg-white rounded-2xl border p-8 text-center text-slate-500">{text}</div>;
}
