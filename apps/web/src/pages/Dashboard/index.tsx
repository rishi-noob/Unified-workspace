import React from 'react';
import { useAuthStore } from '../../store/auth.store';
import AgentView from './AgentView';
import ManagerView from './ManagerView';
import AdminView from './AdminView';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role || 'agent';

  if (role === 'super_admin') return <AdminView />;
  if (role === 'manager') return <ManagerView title="Manager dashboard" />;
  if (role === 'team_lead') return <AgentView pageTitle="Team lead dashboard" />;
  return <AgentView />;
}
