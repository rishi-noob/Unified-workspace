import React, { useState, useEffect } from 'react';
import { Progress, Typography } from 'antd';
import { getSlaStatus } from '../../utils/sla.utils';

const { Text } = Typography;

export default function SlaCountdown({
  slaResolutionAt,
  slaBreached,
  createdAt,
}: {
  slaResolutionAt: string | null;
  slaBreached: boolean;
  createdAt: string;
}) {
  const [status, setStatus] = useState(() => getSlaStatus(slaResolutionAt, slaBreached, createdAt));

  useEffect(() => {
    if (!slaResolutionAt || slaBreached) return;
    const interval = setInterval(() => {
      setStatus(getSlaStatus(slaResolutionAt, slaBreached, createdAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [slaResolutionAt, slaBreached, createdAt]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Progress
        type="circle"
        percent={status.percent}
        size={36}
        strokeColor={status.color}
        format={() => ''}
      />
      <Text style={{ color: status.color, fontWeight: 600, fontSize: 13 }}>
        {status.timeLeft}
      </Text>
    </div>
  );
}
