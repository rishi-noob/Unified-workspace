import React from 'react';
import { Tag } from 'antd';
import type { TicketStatus } from '../../types/ticket.types';

const CONFIG: Record<TicketStatus, { color: string; label: string }> = {
  new: { color: '#2E6DA4', label: 'New' },
  assigned: { color: '#722ED1', label: 'Assigned' },
  in_progress: { color: '#1890FF', label: 'In Progress' },
  pending: { color: '#F59E0B', label: 'Pending' },
  resolved: { color: '#0F9D58', label: 'Resolved' },
  closed: { color: '#999', label: 'Closed' },
};

export default function StatusBadge({ status }: { status: TicketStatus }) {
  const cfg = CONFIG[status] || { color: '#999', label: status };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
}
