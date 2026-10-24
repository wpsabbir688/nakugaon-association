import { useEffect, useState } from 'react';
import api from '../../services/api.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { formatBDT, formatDate, apiErrorMessage } from '../../utils/format.js';

function downloadCsv(path, filename) {
  const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
  const token = document.cookie; // not used; axios path below instead
  void token;
  void filename;
  void path;
}

export function AdminReports() {
  const { t } = useLanguage();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [summary, setSummary] = useState(null);
  const [msg, setMsg] = useState('');
  const load = async () => {
    try {
      const [ie, out] = await Promise.all([
        api.get('/reports/income-expense', { params: { from, to } }),
        api.get('/reports/outstanding'),
      ]);
      setSummary({ ...ie.data, totalOutstanding: out.data.total });
    } catch (e) { setMsg(apiErrorMessage(e)); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const csv = async (endpoint, filename) => {
    try {
      const r = await api.get(endpoint, { params: { from, to, format: 'csv' }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setMsg(apiErrorMessage(e)); }
  };
  void downloadCsv;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t.reports}</h1>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-xl px-3 py-2 bg-white" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-xl px-3 py-2 bg-white" />
        <button onClick={load} className="bg-navy-900 text-white px-4 py-2 rounded-xl text-sm">Apply</button>
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border rounded-2xl p-4"><div className="text-sm text-slate-500">Income (charges)</div><div className="text-xl font-bold">{formatBDT(summary.income)}</div></div>
          <div className="bg-white border rounded-2xl p-4"><div className="text-sm text-slate-500">Payments collected</div><div className="text-xl font-bold">{formatBDT(summary.paymentsCollected)}</div></div>
          <div className="bg-white border rounded-2xl p-4"><div className="text-sm text-slate-500">Expenses</div><div className="text-xl font-bold">{formatBDT(summary.expenses)}</div></div>
          <div className="bg-white border rounded-2xl p-4"><div className="text-sm text-slate-500">Total outstanding</div><div className="text-xl font-bold text-red-700">{formatBDT(summary.totalOutstanding)}</div></div>
        </div>
      )}
      <div className="bg-white border rounded-2xl p-4 flex gap-2 flex-wrap">
        <button onClick={() => csv('/reports/vehicles', 'vehicle-report.csv')} className="border rounded-xl px-3 py-2 text-sm">Vehicle report (CSV)</button>
        <button onClick={() => csv('/reports/weighbridge', 'weighbridge-report.csv')} className="border rounded-xl px-3 py-2 text-sm">Weighbridge report (CSV)</button>
        <button onClick={() => csv('/reports/outstanding', 'outstanding-report.csv')} className="border rounded-xl px-3 py-2 text-sm">Outstanding report (CSV)</button>
        <button onClick={() => csv('/reports/payments', 'payment-report.csv')} className="border rounded-xl px-3 py-2 text-sm">Payment report (CSV)</button>
      </div>
      <p className="text-sm text-slate-500 mt-3">Exports are CSV only. Binary Excel (.xlsx) and PDF exports are not implemented — CSV opens in Excel and matches database records.</p>
    </div>
  );
}

export function AdminNotices() {
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => api.get('/notices').then((r) => setRows(r.data.notices)).catch(() => {});
  useEffect(load, []);
  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post('/notices', { title, body, isPublished: true });
      setTitle('');
      setBody('');
      setMsg('Published ✓');
      load();
    } catch (err) { setMsg(apiErrorMessage(err)); }
  };
  const toggle = async (n) => {
    await api.patch(`/notices/${n._id}`, { isPublished: !n.isPublished });
    load();
  };
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t.notices}</h1>
      <form onSubmit={create} className="bg-white border rounded-2xl p-4 space-y-3 mb-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full border rounded-xl px-3 py-2" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body (Bengali and/or English)" rows={4} className="w-full border rounded-xl px-3 py-2" />
        <button className="bg-navy-900 text-white px-4 py-2 rounded-xl text-sm">Publish notice</button>
        {msg && <span className="text-sm ml-2">{msg}</span>}
      </form>
      <div className="grid gap-3">
        {rows.map((n) => (
          <article key={n._id} className="bg-white border rounded-2xl p-4 flex justify-between gap-3">
            <div>
              <h3 className="font-semibold">{n.title}</h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{n.body}</p>
              <p className="text-xs text-slate-400 mt-1">{formatDate(n.createdAt)} · {n.isPublished ? 'Published' : 'Draft'}</p>
            </div>
            <button onClick={() => toggle(n)} className="text-sm text-teal-700 underline shrink-0">{n.isPublished ? 'Unpublish' : 'Publish'}</button>
          </article>
        ))}
      </div>
    </div>
  );
}

export function AdminExpenses() {
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ title: '', amount: '', spentAt: '', method: 'CASH', category: '', notes: '' });
  const [msg, setMsg] = useState('');
  const load = () => api.get('/expenses?limit=30').then((r) => setRows(r.data.rows)).catch(() => {});
  useEffect(load, []);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/expenses', { ...form, amount: Number(form.amount) });
      setMsg('Saved ✓');
      setForm({ title: '', amount: '', spentAt: '', method: 'CASH', category: '', notes: '' });
      load();
    } catch (err) { setMsg(apiErrorMessage(err)); }
  };
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t.expenses}</h1>
      <form onSubmit={submit} className="bg-white border rounded-2xl p-4 grid md:grid-cols-3 gap-3 mb-4">
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="border rounded-xl px-3 py-2" />
        <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount (৳)" type="number" className="border rounded-xl px-3 py-2" />
        <input value={form.spentAt} onChange={(e) => setForm({ ...form, spentAt: e.target.value })} type="date" className="border rounded-xl px-3 py-2" />
        <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="border rounded-xl px-3 py-2"><option value="CASH">Cash</option><option value="BANK">Bank</option><option value="OTHER">Other</option></select>
        <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" className="border rounded-xl px-3 py-2" />
        <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" className="border rounded-xl px-3 py-2" />
        <div className="md:col-span-3 flex gap-2 items-center"><button className="bg-navy-900 text-white px-4 py-2 rounded-xl text-sm">Record expense</button>{msg && <span className="text-sm">{msg}</span>}</div>
      </form>
      <div className="bg-white border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-slate-50 text-left"><tr><th className="p-2">Date</th><th className="p-2">Title</th><th className="p-2">Category</th><th className="p-2 text-right">Amount</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} className="border-t"><td className="p-2">{formatDate(r.spentAt)}</td><td className="p-2">{r.title}</td><td className="p-2">{r.category}</td><td className="p-2 text-right font-semibold">{formatBDT(r.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminAudit() {
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/audit?limit=50').then((r) => setRows(r.data.rows)).catch(() => {}); }, []);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t.auditLog}</h1>
      <div className="bg-white border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-slate-50 text-left"><tr><th className="p-2">Time</th><th className="p-2">Actor</th><th className="p-2">Action</th><th className="p-2">Entity</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} className="border-t"><td className="p-2">{new Date(r.createdAt).toLocaleString()}</td><td className="p-2">{r.actorName}</td><td className="p-2">{r.action}</td><td className="p-2">{r.entity} {r.entityId}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminUsers() {
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'OPERATOR' });
  const [msg, setMsg] = useState('');
  const load = () => api.get('/admin/users').then((r) => setRows(r.data.users)).catch(() => {});
  useEffect(load, []);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/users', form);
      setMsg('Staff created ✓');
      setForm({ name: '', email: '', password: '', role: 'OPERATOR' });
      load();
    } catch (err) { setMsg(apiErrorMessage(err)); }
  };
  const toggle = async (u) => {
    await api.patch(`/admin/users/${u.id}/status`, { isActive: !u.isActive });
    load();
  };
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t.users}</h1>
      <form onSubmit={submit} className="bg-white border rounded-2xl p-4 grid md:grid-cols-4 gap-3 mb-4">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="border rounded-xl px-3 py-2" />
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="border rounded-xl px-3 py-2" />
        <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password (min 8)" type="password" className="border rounded-xl px-3 py-2" />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="border rounded-xl px-3 py-2">
          <option value="OPERATOR">OPERATOR</option><option value="ACCOUNTANT">ACCOUNTANT</option><option value="MANAGER">MANAGER</option><option value="SUPER_ADMIN">SUPER_ADMIN</option><option value="MEMBER">MEMBER</option>
        </select>
        <div className="md:col-span-4 flex gap-2 items-center"><button className="bg-navy-900 text-white px-4 py-2 rounded-xl text-sm">Create staff</button>{msg && <span className="text-sm">{msg}</span>}</div>
      </form>
      <div className="bg-white border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-slate-50 text-left"><tr><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Role</th><th className="p-2">Active</th><th className="p-2"></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t"><td className="p-2">{u.name}</td><td className="p-2">{u.email}</td><td className="p-2">{u.role}</td><td className="p-2">{u.isActive ? 'Yes' : 'No'}</td><td className="p-2"><button onClick={() => toggle(u)} className="text-teal-700 underline text-sm">{u.isActive ? 'Deactivate' : 'Activate'}</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminSettings() {
  const { t } = useLanguage();
  const [form, setForm] = useState({ orgName: '', orgNameBn: '', tagline: '', taglineBn: '', about: '', aboutBn: '' });
  const [msg, setMsg] = useState('');
  useEffect(() => {
    api.get('/settings').then((r) => setForm((f) => ({ ...f, ...r.data.settings }))).catch(() => {});
  }, []);
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put('/settings', { settings: form });
      setMsg('Saved ✓ — official contact details and registration numbers stay empty until the association confirms them.');
    } catch (err) { setMsg(apiErrorMessage(err)); }
  };
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t.settings}</h1>
      <form onSubmit={save} className="bg-white border rounded-2xl p-4 space-y-3 max-w-2xl">
        {Object.keys(form).map((k) => (
          <div key={k}>
            <label className="text-sm font-medium block mb-1">{k}</label>
            <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="w-full border rounded-xl px-3 py-2" />
          </div>
        ))}
        <button className="bg-navy-900 text-white px-4 py-2 rounded-xl text-sm">Save settings</button>
        {msg && <p className="text-sm">{msg}</p>}
      </form>
    </div>
  );
}
