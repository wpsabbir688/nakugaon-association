import { useEffect, useState } from 'react';
import api from '../../services/api.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { StatCard } from '../../components/ui.jsx';
import { formatBDT, formatDate } from '../../utils/format.js';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#0b2545', '#0f766e', '#14b8a6', '#f59e0b'];

export function AdminDashboard() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/admin/dashboard').then((r) => setData(r.data)).catch((e) => setError(e?.response?.data?.error?.message || 'Failed to load'));
  }, []);
  if (error) return <div className="bg-white border rounded-2xl p-8 text-red-600">{error}</div>;
  if (!data) return <div className="p-8">{t.loading}</div>;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t.dashboard}</h1>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard title={t.activeMembers} value={data.activeMembers} />
        <StatCard title={t.todayVehicles} value={data.todayVehicleCount} />
        <StatCard title={t.todayVehicleCharges} value={formatBDT(data.todayVehicleCharges)} />
        <StatCard title={t.todayWbCharges} value={formatBDT(data.todayWeighbridgeCharges)} />
        <StatCard title={t.todayPayments} value={formatBDT(data.todayPayments)} />
        <StatCard title={t.totalOutstanding} value={formatBDT(data.totalOutstanding)} accent="text-red-700" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <div className="bg-white border rounded-2xl p-4">
          <h2 className="font-semibold mb-2">Daily vehicles (14 days)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts.vehicleTrend}>
                <XAxis dataKey="_id" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="vehicles" fill="#0b2545" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white border rounded-2xl p-4">
          <h2 className="font-semibold mb-2">Weighbridge by category</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.charts.wbByCategory} dataKey="total" nameKey="_id" outerRadius={90} label>
                  {data.charts.wbByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatBDT(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="bg-white border rounded-2xl p-4 mt-4">
        <h2 className="font-semibold mb-2">Recent transactions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-slate-50 text-left"><tr><th className="p-2">Date</th><th className="p-2">Member</th><th className="p-2">Kind</th><th className="p-2 text-right">Amount</th><th className="p-2 text-right">Balance</th></tr></thead>
            <tbody>
              {data.recentTransactions.map((r) => (
                <tr key={r._id} className="border-t">
                  <td className="p-2">{formatDate(r.occurredAt)}</td>
                  <td className="p-2">{r.member?.businessName || '—'}</td>
                  <td className="p-2">{r.kind}</td>
                  <td className="p-2 text-right">{formatBDT(r.amount)}</td>
                  <td className="p-2 text-right font-semibold">{formatBDT(r.runningBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
