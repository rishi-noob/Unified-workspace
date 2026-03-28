import React from 'react';
import ManagerView from '../Dashboard/ManagerView';
import { Typography } from 'antd';

export default function AnalyticsPage() {
  return (
    <div>
      <Typography.Title level={3}>Analytics</Typography.Title>
      <ManagerView />
    </div>
  );
}
