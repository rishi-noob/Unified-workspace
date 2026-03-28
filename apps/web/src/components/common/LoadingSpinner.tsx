import React from 'react';
import { Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

export default function LoadingSpinner({ size = 40, tip }: { size?: number; tip?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 60, flexDirection: 'column', gap: 12 }}>
      <Spin indicator={<LoadingOutlined style={{ fontSize: size }} spin />} />
      {tip && <span style={{ color: '#888' }}>{tip}</span>}
    </div>
  );
}
