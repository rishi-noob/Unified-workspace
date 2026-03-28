import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function VolumeChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data || data.length === 0) return <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>No data yet</div>;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Line type="monotone" dataKey="count" stroke="#1E3A5F" strokeWidth={2} dot={{ fill: '#2E6DA4' }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
