import React from 'react';
import { Tag } from 'antd';
import type { AiSentiment } from '../../types/ticket.types';

const CONFIG: Record<AiSentiment, { color: string; emoji: string }> = {
  positive: { color: '#0F9D58', emoji: '😊' },
  neutral: { color: '#1E3A5F', emoji: '😐' },
  negative: { color: '#F59E0B', emoji: '😟' },
  urgent: { color: '#EF4444', emoji: '🚨' },
};

export default function SentimentBadge({ sentiment }: { sentiment: AiSentiment | null | undefined }) {
  if (!sentiment) return null;
  const cfg = CONFIG[sentiment] || CONFIG.neutral;
  return <Tag color={cfg.color}>{cfg.emoji} {sentiment}</Tag>;
}
