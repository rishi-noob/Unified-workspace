import React from 'react';
import { Tag } from 'antd';
import type { TicketPriority } from '../../types/ticket.types';

const COLORS: Record<TicketPriority, string> = {
  low: '#52c41a',
  normal: '#1E3A5F',
  high: '#F59E0B',
  critical: '#EF4444',
};

export default function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return <Tag color={COLORS[priority] || '#999'}>{priority.toUpperCase()}</Tag>;
}
