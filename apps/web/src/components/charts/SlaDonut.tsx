import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#0F9D58', '#EF4444'];

export default function SlaDonut({ data }: { data: { name: string; value: number }[] }) {
  if (!data || data.length === 0) return <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>No data yet</div>;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
          paddingAngle={4} dataKey="value" label>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
