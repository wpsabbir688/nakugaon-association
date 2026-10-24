import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { Empty } from '../../components/ui.jsx';

export function HomePage() {
  const { lang, t } = useLanguage();
  const [count, setCount] = useState(null);
  const [notices, setNotices] = useState([]);
  useEffect(() => {
    api.get('/public/members?limit=1').then((r) => setCount(r.data.meta.total)).catch(() => {});
    api.get('/public/notices').then((r) => setNotices(r.data.notices.slice(0, 5))).catch(() => {});
  }, []);
  return (
    <div>
      <section className="bg-navy-900 text-white rounded-3xl p-8 md:p-12">
        <h1 className="text-3xl md:text-4xl font-bold leading-snug">{t.heroTitle}</h1>
        <p className="mt-3 text-white/80 max-w-2xl">{t.heroSubtitle}</p>
        <div className="mt-6 flex gap-3 flex-wrap">
          <Link to={`/${lang}/members`} className="bg-teal-600 px-5 py-2 rounded-full font-medium">{t.navMembers}</Link>
          <Link to={`/${lang}/outstanding`} className="border border-white/40 px-5 py-2 rounded-full">{t.navOutstanding}</Link>
        </div>
        {count !== null && (
          <p className="mt-6 text-white/70 text-sm">{t.activeMembers}: {count}</p>
        )}
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-bold mb-3">{t.noticesTitle}</h2>
        {notices.length === 0 ? <Empty text={t.noData} /> : (
          <div className="grid gap-3">
            {notices.map((n) => (
              <article key={n._id} className="bg-white border rounded-2xl p-4">
                <h3 className="font-semibold">{n.title}</h3>
                <p className="text-slate-600 text-sm mt-1 whitespace-pre-wrap">{n.body}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function AboutPage() {
  const { t } = useLanguage();
  return (
    <div className="bg-white border rounded-3xl p-8 max-w-3xl">
      <h1 className="text-2xl font-bold">{t.aboutTitle}</h1>
      <p className="mt-4 text-slate-700 leading-relaxed">{t.aboutBody}</p>
    </div>
  );
}

export function ContactPage() {
  const { t } = useLanguage();
  return (
    <div className="bg-white border rounded-3xl p-8 max-w-3xl">
      <h1 className="text-2xl font-bold">{t.contactTitle}</h1>
      <p className="mt-4 text-slate-700">{t.contactBody}</p>
    </div>
  );
}

export function PrivacyPage() {
  const { t } = useLanguage();
  return (
    <div className="bg-white border rounded-3xl p-8 max-w-3xl">
      <h1 className="text-2xl font-bold">{t.privacyTitle}</h1>
      <p className="mt-4 text-slate-700 leading-relaxed">{t.privacyBody}</p>
    </div>
  );
}

export function NoticesPage() {
  const { t } = useLanguage();
  const [notices, setNotices] = useState([]);
  useEffect(() => {
    api.get('/public/notices').then((r) => setNotices(r.data.notices)).catch(() => {});
  }, []);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t.noticesTitle}</h1>
      {notices.length === 0 ? <Empty text={t.noData} /> : (
        <div className="grid gap-3">
          {notices.map((n) => (
            <article key={n._id} className="bg-white border rounded-2xl p-4">
              <h3 className="font-semibold">{n.title}</h3>
              <p className="text-slate-600 text-sm mt-1 whitespace-pre-wrap">{n.body}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
