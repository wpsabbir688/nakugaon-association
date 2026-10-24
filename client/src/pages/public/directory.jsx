import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../services/api.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { Pagination, Empty, Badge } from '../../components/ui.jsx';
import { formatBDT, formatDate } from '../../utils/format.js';

export function MembersPage() {
  const { lang, t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const load = useCallback(() => {
    api.get('/public/members', { params: { search, page, limit: 20 } }).then((r) => {
      setRows(r.data.members);
      setMeta(r.data.meta);
    }).catch(() => {});
  }, [search, page]);
  useEffect(load, [load]);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t.navMembers}</h1>
      <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t.searchMembers} className="w-full border rounded-xl px-4 py-2 mb-4 bg-white" />
      {rows.length === 0 ? <Empty text={t.noData} /> : (
        <div className="grid md:grid-cols-2 gap-3">
          {rows.map((m) => (
            <Link key={m.memberId} to={`/${lang}/members/${m.memberId}`} className="bg-white border rounded-2xl p-4 flex gap-4 hover:shadow">
              {m.profileImageUrl ? <img src={m.profileImageUrl} alt="" className="w-16 h-16 rounded-xl object-cover" /> : <div className="w-16 h-16 rounded-xl bg-navy-900 text-white flex items-center justify-center font-bold">{m.businessName[0]}</div>}
              <div className="min-w-0">
                <div className="font-semibold truncate">{m.businessName}</div>
                <div className="text-sm text-slate-500">{m.ownerName} · {m.memberId}</div>
                <div className="text-sm mt-1">{t.outstanding}: <span className={m.outstandingBalance > 0 ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold'}>{formatBDT(m.outstandingBalance)}</span></div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Pagination meta={meta} onPage={setPage} />
    </div>
  );
}

export function MemberProfilePage() {
  const { lang, t } = useLanguage();
  const { memberId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get(`/public/members/${memberId}`).then((r) => setData(r.data)).catch(() => setError(t.noData));
  }, [memberId, t]);
  if (error) return <Empty text={error} />;
  if (!data) return <div className="p-8">{t.loading}</div>;
  const { member, summary } = data;
  return (
    <div className="bg-white border rounded-3xl p-6 md:p-8 max-w-3xl">
      <div className="flex gap-4 items-start flex-wrap">
        {member.profileImageUrl ? <img src={member.profileImageUrl} alt="" className="w-24 h-24 rounded-2xl object-cover" /> : <div className="w-24 h-24 rounded-2xl bg-navy-900 text-white flex items-center justify-center text-3xl font-bold">{member.businessName[0]}</div>}
        <div>
          <h1 className="text-2xl font-bold">{member.businessName}</h1>
          <p className="text-slate-600">{member.ownerName}</p>
          <p className="text-sm mt-1">{t.memberId}: <span className="font-semibold">{member.memberId}</span> · {formatDate(member.joiningDate)}</p>
          <Badge tone={member.status === 'ACTIVE' ? 'green' : 'slate'}>{member.status}</Badge>
        </div>
      </div>
      <div className="mt-6 bg-red-50 border border-red-100 rounded-2xl p-4">
        <div className="text-sm text-slate-500">{t.outstanding}</div>
        <div className="text-3xl font-bold text-red-700">{formatBDT(member.outstandingBalance)}</div>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-slate-500">Vehicle charges</dt><dd className="font-semibold">{formatBDT(summary.vehicleCharges)}</dd></div>
        <div><dt className="text-slate-500">Weighbridge charges</dt><dd className="font-semibold">{formatBDT(summary.weighbridgeCharges)}</dd></div>
        <div><dt className="text-slate-500">Other charges</dt><dd className="font-semibold">{formatBDT(summary.otherCharges)}</dd></div>
        <div><dt className="text-slate-500">{t.totalPayments}</dt><dd className="font-semibold">{formatBDT(summary.payments)}</dd></div>
        <div><dt className="text-slate-500">Credits</dt><dd className="font-semibold">{formatBDT(summary.credits)}</dd></div>
      </dl>
      <p className="text-xs text-slate-400 mt-6">{t.currencyNote} <Link to={`/${lang}/outstanding`} className="underline">{t.navOutstanding}</Link></p>
    </div>
  );
}

export function OutstandingPage() {
  const { lang, t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const load = useCallback(() => {
    api.get('/public/outstanding', { params: { search, page, limit: 20 } }).then((r) => {
      setRows(r.data.rows);
      setMeta(r.data.meta);
    }).catch(() => {});
  }, [search, page]);
  useEffect(load, [load]);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t.navOutstanding}</h1>
      <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t.searchMembers} className="w-full border rounded-xl px-4 py-2 mb-4 bg-white" />
      {rows.length === 0 ? <Empty text={t.noData} /> : (
        <div className="bg-white border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 text-left">
              <tr><th className="p-3">{t.businessName}</th><th className="p-3">{t.memberId}</th><th className="p-3 text-right">Vehicle</th><th className="p-3 text-right">Weighbridge</th><th className="p-3 text-right">{t.totalPayments}</th><th className="p-3 text-right">{t.outstanding}</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.memberId} className="border-t">
                  <td className="p-3"><Link to={`/${lang}/members/${r.memberId}`} className="text-teal-700 hover:underline">{r.businessName}</Link></td>
                  <td className="p-3">{r.memberId}</td>
                  <td className="p-3 text-right">{formatBDT(r.summary.vehicleCharges)}</td>
                  <td className="p-3 text-right">{formatBDT(r.summary.weighbridgeCharges)}</td>
                  <td className="p-3 text-right">{formatBDT(r.summary.payments)}</td>
                  <td className="p-3 text-right font-semibold">{formatBDT(r.outstandingBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination meta={meta} onPage={setPage} />
    </div>
  );
}
