import { useEffect, useState, lazy, Suspense } from 'react';
import api from '../../services/api.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { StatCard } from '../../components/ui.jsx';
import { formatBDT, formatDate } from '../../utils/format.js';

// Recharts is heavy — load it only when the dashboard renders, so the
// first paint (stats + transactions) is not blocked by the chart bundle.
const DashboardCharts = lazy(() => import('./DashboardCharts.jsx'));

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
      <Suspense fallback={<div className="bg-white border rounded-2xl p-4 mt-4 text-slate-500">{t.loading}</div>}>
        <DashboardCharts charts={data.charts} />
      </Suspense>
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
