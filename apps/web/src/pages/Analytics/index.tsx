import React from 'react';
import ManagerView from '../Dashboard/ManagerView';
import { Typography } from 'antd';
import { useAuthStore } from '../../store/auth.store';

export default function AnalyticsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isTeamLeadOnly = role === 'team_lead';

  return (
    <div>
      <Typography.Title level={3} style={{ marginBottom: 0 }}>Analytics</Typography.Title>
      <ManagerView
        title={isTeamLeadOnly ? 'Department analytics' : 'Manager analytics'}
        subtitle={
          isTeamLeadOnly
            ? 'Metrics include only tickets in your assigned department(s). Managers and super admins see organization-wide numbers on the manager dashboard.'
            : undefined
        }
      />
    </div>
  );
}
