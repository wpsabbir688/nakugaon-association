import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { formatBDT, formatDateTime, apiErrorMessage } from '../../utils/format.js';

function useOwnMember() {
  const { user } = useAuth();
  return user?.memberPublicId;
}

export function MemberPortal() {
  const { t } = useLanguage();
  const memberId = useOwnMember();
  const [member, setMember] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!memberId) return;
    api.get(`/members/${memberId}`).then((r) => setMember(r.data.member)).catch((e) => setMsg(apiErrorMessage(e)));
    api.get(`/members/${memberId}/ledger?limit=10`).then((r) => setLedger(r.data.rows)).catch(() => {});
  }, [memberId]);
  if (!memberId) return <div className="bg-white border rounded-2xl p-8">No member account is linked to this login. Ask an administrator to link your member record.</div>;
  if (!member) return <div className="p-8">{msg || t.loading}</div>;
  return (
    <div>
      <h1 className="text-2xl font-bold">{member.businessName}</h1>
      <p className="text-slate-600">{member.ownerName} · {member.memberId}</p>
      <div className="mt-4 bg-red-50 border border-red-100 rounded-2xl p-4 max-w-md">
        <div className="text-sm text-slate-500">{t.outstanding}</div>
        <div className="text-3xl font-bold text-red-700">{formatBDT(member.outstandingBalance)}</div>
      </div>
      <h2 className="font-semibold mt-6 mb-2">Recent transactions</h2>
      <div className="bg-white border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-slate-50 text-left"><tr><th className="p-2">Date</th><th className="p-2">Kind</th><th className="p-2">Reference</th><th className="p-2 text-right">Amount</th><th className="p-2 text-right">Balance</th></tr></thead>
          <tbody>
            {ledger.map((r) => (
              <tr key={r._id} className="border-t">
                <td className="p-2">{formatDateTime(r.occurredAt)}</td>
                <td className="p-2">{r.kind}</td>
                <td className="p-2">{r.reference}</td>
                <td className="p-2 text-right">{formatBDT(r.amount)}</td>
                <td className="p-2 text-right font-semibold">{formatBDT(r.runningBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link to="ledger" className="text-teal-700 underline text-sm mt-3 inline-block">Full statement →</Link>
    </div>
  );
}

export function MemberLedgerPage() {
  const { t } = useLanguage();
  const memberId = useOwnMember();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!memberId) return;
    api.get(`/members/${memberId}/ledger?limit=100`).then((r) => setRows(r.data.rows)).catch(() => {});
  }, [memberId]);
  const downloadCsv = () => {
    const header = 'date,kind,reference,amount,runningBalance';
    const lines = rows.map((r) => `${new Date(r.occurredAt).toISOString().slice(0, 10)},${r.kind},${r.reference},${r.amount},${r.runningBalance}`);
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `statement-${memberId}.csv`;
    a.click();
  };
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">My statement</h1>
      <button onClick={downloadCsv} className="border rounded-xl px-3 py-2 text-sm mb-4">Download statement (CSV)</button>
      <div className="bg-white border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-slate-50 text-left"><tr><th className="p-2">Date</th><th className="p-2">Kind</th><th className="p-2">Reference</th><th className="p-2 text-right">Amount</th><th className="p-2 text-right">Balance</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} className="border-t">
                <td className="p-2">{formatDateTime(r.occurredAt)}</td>
                <td className="p-2">{r.kind}</td>
                <td className="p-2">{r.reference}</td>
                <td className="p-2 text-right">{formatBDT(r.amount)}</td>
                <td className="p-2 text-right font-semibold">{formatBDT(r.runningBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MemberProfilePage() {
  const { t } = useLanguage();
  const memberId = useOwnMember();
  const [member, setMember] = useState(null);
  useEffect(() => {
    if (!memberId) return;
    api.get(`/members/${memberId}`).then((r) => setMember(r.data.member)).catch(() => {});
  }, [memberId]);
  if (!member) return <div className="p-8">{t.loading}</div>;
  return (
    <div className="bg-white border rounded-3xl p-6 max-w-2xl">
      <h1 className="text-2xl font-bold">{member.businessName}</h1>
      <dl className="mt-4 space-y-2 text-sm">
        <div><dt className="text-slate-500">Member ID</dt><dd className="font-semibold">{member.memberId}</dd></div>
        <div><dt className="text-slate-500">Owner</dt><dd>{member.ownerName}</dd></div>
        <div><dt className="text-slate-500">Phone</dt><dd>{member.phone || '—'}</dd></div>
        <div><dt className="text-slate-500">Address</dt><dd>{member.address || '—'}</dd></div>
        <div><dt className="text-slate-500">Joining date</dt><dd>{member.joiningDate?.slice(0, 10)}</dd></div>
        <div><dt className="text-slate-500">Status</dt><dd>{member.status}</dd></div>
      </dl>
      <p className="text-sm text-slate-500 mt-4">Profile edits beyond authorized fields are handled by staff — contact the association office.</p>
    </div>
  );
}
