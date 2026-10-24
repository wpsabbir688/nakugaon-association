import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../../services/api.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { Pagination, Empty, Badge } from '../../components/ui.jsx';
import { formatBDT, formatDate, formatDateTime, apiErrorMessage } from '../../utils/format.js';

export function Field({ label, error, children }) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1">{label}</label>
      {children}
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
const inputCls = 'w-full border rounded-xl px-3 py-2 bg-white';

export function AdminMembers() {
  const { lang, t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState('');
  const load = () => api.get('/members', { params: { search, page, limit: 20 } }).then((r) => { setRows(r.data.members); setMeta(r.data.meta); }).catch(() => {});
  useEffect(load, [search, page]); // eslint-disable-line react-hooks/exhaustive-deps
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(z.object({
      businessName: z.string().min(1), ownerName: z.string().min(1), phone: z.string().optional(),
      address: z.string().optional(), joiningDate: z.string().min(1), openingBalance: z.coerce.number().int().min(0).default(0),
    })),
  });
  const onCreate = async (data) => {
    setMsg('');
    try {
      const r = await api.post('/members', data);
      setMsg(`Created ${r.data.member.memberId}`);
      reset();
      load();
    } catch (e) { setMsg(apiErrorMessage(e)); }
  };
  const archive = async (id) => {
    if (!confirm('Archive this member? Financial history is preserved.')) return;
    await api.post(`/members/${id}/archive`);
    load();
  };
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t.members}</h1>
      <form onSubmit={handleSubmit(onCreate)} className="bg-white border rounded-2xl p-4 grid md:grid-cols-3 gap-3 mb-4">
        <Field label={t.businessName} error={errors.businessName?.message}><input {...register('businessName')} className={inputCls} /></Field>
        <Field label={t.ownerName} error={errors.ownerName?.message}><input {...register('ownerName')} className={inputCls} /></Field>
        <Field label="Phone"><input {...register('phone')} className={inputCls} /></Field>
        <Field label="Address"><input {...register('address')} className={inputCls} /></Field>
        <Field label="Joining date" error={errors.joiningDate?.message}><input type="date" {...register('joiningDate')} className={inputCls} /></Field>
        <Field label="Opening balance (৳)"><input type="number" {...register('openingBalance')} className={inputCls} /></Field>
        <div className="md:col-span-3 flex gap-2 items-center">
          <button className="bg-navy-900 text-white px-4 py-2 rounded-xl text-sm">Create member</button>
          {msg && <span className="text-sm">{msg}</span>}
        </div>
      </form>
      <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t.search} className="w-full border rounded-xl px-4 py-2 mb-4 bg-white" />
      {rows.length === 0 ? <Empty text={t.noData} /> : (
        <div className="bg-white border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 text-left"><tr><th className="p-3">{t.memberId}</th><th className="p-3">{t.businessName}</th><th className="p-3">{t.ownerName}</th><th className="p-3">Status</th><th className="p-3 text-right">{t.outstanding}</th><th className="p-3"></th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.memberId} className="border-t">
                  <td className="p-3">{m.memberId}</td>
                  <td className="p-3">{m.businessName}</td>
                  <td className="p-3">{m.ownerName}</td>
                  <td className="p-3"><Badge tone={m.status === 'ACTIVE' ? 'green' : 'slate'}>{m.status}</Badge></td>
                  <td className="p-3 text-right font-semibold">{formatBDT(m.outstandingBalance)}</td>
                  <td className="p-3 text-right">
                    <Link to={`/${lang}/admin/members/${m.memberId}`} className="text-teal-700 underline mr-3">Detail</Link>
                    {m.status === 'ACTIVE' && <button onClick={() => archive(m.memberId)} className="text-red-600 underline text-sm">Archive</button>}
                  </td>
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

export function AdminMemberDetail() {
  const { t } = useLanguage();
  const { memberId } = useParams();
  const [member, setMember] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [balance, setBalance] = useState(null);
  useEffect(() => {
    api.get(`/members/${memberId}`).then((r) => setMember(r.data.member)).catch(() => {});
    api.get(`/members/${memberId}/ledger?limit=50`).then((r) => setLedger(r.data.rows)).catch(() => {});
    api.get(`/members/${memberId}/balance`).then((r) => setBalance(r.data)).catch(() => {});
  }, [memberId]);
  if (!member) return <div className="p-8">{t.loading}</div>;
  return (
    <div>
      <h1 className="text-2xl font-bold">{member.businessName} <span className="text-slate-500 text-lg">({member.memberId})</span></h1>
      <p className="text-slate-600">{member.ownerName} · {member.phone} · {member.address}</p>
      {balance && (
        <div className="bg-white border rounded-2xl p-4 mt-4 flex gap-6 flex-wrap text-sm">
          <span>Opening: <b>{formatBDT(balance.openingBalance)}</b></span>
          <span>Cached: <b>{formatBDT(balance.cachedBalance)}</b></span>
          <span>Computed: <b>{formatBDT(balance.computedBalance)}</b></span>
          <Badge tone={balance.inSync ? 'green' : 'red'}>{balance.inSync ? 'In sync' : 'OUT OF SYNC — run reconcile'}</Badge>
        </div>
      )}
      <h2 className="font-semibold mt-6 mb-2">{t.ledger}</h2>
      <div className="bg-white border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
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
    </div>
  );
}

function EntryForm({ kind, onDone }) {
  const { t } = useLanguage();
  const [msg, setMsg] = useState('');
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    if (kind === 'weighbridge') api.get('/weighbridge/categories').then((r) => setCategories(r.data.categories)).catch(() => {});
  }, [kind]);
  const schema = kind === 'vehicle'
    ? z.object({ memberId: z.string().min(1), entryDate: z.string().min(1), quantity: z.coerce.number().int().min(1), notes: z.string().optional() })
    : z.object({ memberId: z.string().min(1), occurredAt: z.string().min(1), category: z.string().min(1), weightKg: z.coerce.number().positive().optional(), referenceNumber: z.string().optional(), operator: z.string().optional(), notes: z.string().optional() });
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema) });
  const onSubmit = async (data) => {
    setMsg('');
    try {
      const payload = { ...data, idempotencyKey: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
      await api.post(kind === 'vehicle' ? '/vehicles' : '/weighbridge', payload);
      setMsg('Saved ✓');
      reset();
      onDone && onDone();
    } catch (e) { setMsg(apiErrorMessage(e)); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-white border rounded-2xl p-4 grid md:grid-cols-3 gap-3 mb-4">
      <Field label={t.memberId} error={errors.memberId?.message}><input {...register('memberId')} placeholder="NAK-0001" className={inputCls} /></Field>
      {kind === 'vehicle' ? (
        <>
          <Field label="Entry date" error={errors.entryDate?.message}><input type="date" {...register('entryDate')} className={inputCls} /></Field>
          <Field label="Quantity" error={errors.quantity?.message}><input type="number" {...register('quantity')} className={inputCls} /></Field>
        </>
      ) : (
        <>
          <Field label="Date & time" error={errors.occurredAt?.message}><input type="datetime-local" {...register('occurredAt')} className={inputCls} /></Field>
          <Field label="Category" error={errors.category?.message}>
            <select {...register('category')} className={inputCls}>
              <option value="">Select…</option>
              {categories.map((c) => <option key={c.key} value={c.key}>{c.label} — ৳{c.amount}</option>)}
            </select>
          </Field>
          <Field label="Weight (kg)"><input type="number" step="0.01" {...register('weightKg')} className={inputCls} /></Field>
          <Field label="Reference no."><input {...register('referenceNumber')} className={inputCls} /></Field>
          <Field label="Operator"><input {...register('operator')} className={inputCls} /></Field>
        </>
      )}
      <Field label="Notes"><input {...register('notes')} className={inputCls} /></Field>
      <div className="md:col-span-3 flex gap-2 items-center">
        <button className="bg-navy-900 text-white px-4 py-2 rounded-xl text-sm">Save entry</button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
    </form>
  );
}

export function AdminVehicles() {
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const load = () => api.get('/vehicles?limit=30').then((r) => setRows(r.data.rows)).catch(() => {});
  useEffect(load, []);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t.vehicles} — ৳50 per vehicle</h1>
      <EntryForm kind="vehicle" onDone={load} />
      <div className="bg-white border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-slate-50 text-left"><tr><th className="p-2">Date</th><th className="p-2">Member</th><th className="p-2">Qty</th><th className="p-2">Fee</th><th className="p-2 text-right">Total</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} className="border-t">
                <td className="p-2">{formatDate(r.entryDate)}</td>
                <td className="p-2">{r.member?.businessName} ({r.member?.memberId})</td>
                <td className="p-2">{r.quantity}</td>
                <td className="p-2">{formatBDT(r.feePerVehicle)}</td>
                <td className="p-2 text-right font-semibold">{formatBDT(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminWeighbridge() {
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const load = () => api.get('/weighbridge?limit=30').then((r) => setRows(r.data.rows)).catch(() => {});
  useEffect(load, []);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t.weighbridge}</h1>
      <EntryForm kind="weighbridge" onDone={load} />
      <div className="bg-white border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-slate-50 text-left"><tr><th className="p-2">Date</th><th className="p-2">Member</th><th className="p-2">Category</th><th className="p-2">Fee</th><th className="p-2">Ref</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} className="border-t">
                <td className="p-2">{formatDateTime(r.occurredAt)}</td>
                <td className="p-2">{r.member?.businessName} ({r.member?.memberId})</td>
                <td className="p-2">{r.category}</td>
                <td className="p-2 font-semibold">{formatBDT(r.fee)}</td>
                <td className="p-2">{r.referenceNumber}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminPayments() {
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [receipt, setReceipt] = useState(null);
  const load = () => api.get('/payments?limit=30').then((r) => setRows(r.data.rows)).catch(() => {});
  useEffect(load, []);
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(z.object({
      memberId: z.string().min(1), amount: z.coerce.number().int().min(1), paidAt: z.string().min(1),
      method: z.enum(['CASH', 'BANK', 'OTHER']), reference: z.string().optional(), notes: z.string().optional(),
    })),
  });
  const onSubmit = async (data) => {
    setMsg('');
    try {
      const r = await api.post('/payments', { ...data, idempotencyKey: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
      setReceipt(r.data);
      setMsg('Payment recorded ✓');
      reset();
      load();
    } catch (e) { setMsg(apiErrorMessage(e)); }
  };
  const reverse = async (id) => {
    const reason = prompt('Reversal reason (required):');
    if (!reason) return;
    await api.post(`/payments/${id}/reverse`, { reason });
    load();
  };
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t.payments}</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="bg-white border rounded-2xl p-4 grid md:grid-cols-3 gap-3 mb-4">
        <Field label={t.memberId} error={errors.memberId?.message}><input {...register('memberId')} placeholder="NAK-0001" className={inputCls} /></Field>
        <Field label="Amount (৳)" error={errors.amount?.message}><input type="number" {...register('amount')} className={inputCls} /></Field>
        <Field label="Date" error={errors.paidAt?.message}><input type="date" {...register('paidAt')} className={inputCls} /></Field>
        <Field label="Method"><select {...register('method')} className={inputCls}><option value="CASH">Cash</option><option value="BANK">Bank</option><option value="OTHER">Other</option></select></Field>
        <Field label="Reference"><input {...register('reference')} className={inputCls} /></Field>
        <Field label="Notes"><input {...register('notes')} className={inputCls} /></Field>
        <div className="md:col-span-3 flex gap-2 items-center">
          <button className="bg-navy-900 text-white px-4 py-2 rounded-xl text-sm">Record payment</button>
          {msg && <span className="text-sm">{msg}</span>}
        </div>
      </form>
      {receipt && (
        <div className="bg-white border rounded-2xl p-4 mb-4">
          <h2 className="font-semibold">Receipt {receipt.payment.receiptNumber}</h2>
          <p className="text-sm">Previous balance: {formatBDT(receipt.previousBalance)} · Received: {formatBDT(receipt.payment.amount)} · Remaining: <b>{formatBDT(receipt.remainingBalance)}</b></p>
          <button onClick={() => window.print()} className="text-sm text-teal-700 underline mt-1">Print receipt</button>
        </div>
      )}
      <div className="bg-white border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50 text-left"><tr><th className="p-2">Date</th><th className="p-2">Member</th><th className="p-2">Receipt</th><th className="p-2">Method</th><th className="p-2 text-right">Amount</th><th className="p-2">Status</th><th className="p-2"></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} className="border-t">
                <td className="p-2">{formatDate(r.paidAt)}</td>
                <td className="p-2">{r.member?.businessName} ({r.member?.memberId})</td>
                <td className="p-2">{r.receiptNumber}</td>
                <td className="p-2">{r.method}</td>
                <td className="p-2 text-right font-semibold">{formatBDT(r.amount)}</td>
                <td className="p-2"><Badge tone={r.status === 'POSTED' ? 'green' : 'red'}>{r.status}</Badge></td>
                <td className="p-2">{r.status === 'POSTED' && <button onClick={() => reverse(r._id)} className="text-red-600 underline text-sm">Reverse</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminLedger() {
  const { t } = useLanguage();
  const [memberId, setMemberId] = useState('');
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const load = () => {
    if (!memberId) return;
    api.get(`/members/${memberId}/ledger?limit=100`).then((r) => setRows(r.data.rows)).catch((e) => setMsg(apiErrorMessage(e)));
  };
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t.ledger}</h1>
      <div className="flex gap-2 mb-4">
        <input value={memberId} onChange={(e) => setMemberId(e.target.value)} placeholder="NAK-0001" className="border rounded-xl px-3 py-2 bg-white" />
        <button onClick={load} className="bg-navy-900 text-white px-4 py-2 rounded-xl text-sm">Load</button>
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>
      <div className="bg-white border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
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

export function AdminFeeRules() {
  const { t } = useLanguage();
  const [rules, setRules] = useState([]);
  const [msg, setMsg] = useState('');
  const load = () => api.get('/fee-rules').then((r) => setRules(r.data.rules)).catch(() => {});
  useEffect(load, []);
  const update = async (id, amount) => {
    await api.patch(`/fee-rules/${id}`, { amount: Number(amount) });
    setMsg('Fee updated — historical charges keep their original snapshot.');
    load();
  };
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t.feeRules}</h1>
      <p className="text-sm text-slate-600 mb-4">Changing a fee never rewrites history — every charge stores the fee that applied when it was created.</p>
      {msg && <p className="text-sm mb-3">{msg}</p>}
      <div className="bg-white border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="bg-slate-50 text-left"><tr><th className="p-3">Rule</th><th className="p-3">Category</th><th className="p-3">Amount (৳)</th><th className="p-3"></th></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r._id} className="border-t">
                <td className="p-3">{r.label} ({r.key})</td>
                <td className="p-3">{r.category}</td>
                <td className="p-3"><input defaultValue={r.amount} type="number" id={`fee-${r._id}`} className="border rounded-lg px-2 py-1 w-28" /></td>
                <td className="p-3"><button onClick={() => update(r._id, document.getElementById(`fee-${r._id}`).value)} className="text-teal-700 underline text-sm">Update</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
