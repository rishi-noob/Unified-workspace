import React from 'react';
import { Tag } from 'antd';

const COLORS: Record<string, string> = {
  IT: '#1E3A5F', HR: '#722ED1', Travel: '#0F9D58',
};

export default function DepartmentTag({ name }: { name: string | null | undefined }) {
  if (!name) return <Tag>Unassigned</Tag>;
  return <Tag color={COLORS[name] || '#2E6DA4'}>{name}</Tag>;
}
