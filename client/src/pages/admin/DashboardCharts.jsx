import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatBDT } from '../../utils/format.js';

const COLORS = ['#0b2545', '#0f766e', '#14b8a6', '#f59e0b'];

// Split out of Dashboard.jsx so the heavy recharts bundle loads only when
// the admin dashboard renders, instead of bloating the initial app bundle.
export default function DashboardCharts({ charts }) {
  return (
    <div className="grid lg:grid-cols-2 gap-4 mt-4">
      <div className="bg-white border rounded-2xl p-4">
        <h2 className="font-semibold mb-2">Daily vehicles (14 days)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.vehicleTrend}>
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
              <Pie data={charts.wbByCategory} dataKey="total" nameKey="_id" outerRadius={90} label>
                {charts.wbByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => formatBDT(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
