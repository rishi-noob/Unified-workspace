import React from 'react';
import { Layout, Menu, Typography } from 'antd';
import {
  DashboardOutlined, CustomerServiceOutlined, UploadOutlined,
  BarChartOutlined, SettingOutlined, AuditOutlined, TeamOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { hasMinRole } from '../../utils/rbac.utils';

const { Sider } = Layout;
const { Title } = Typography;

export default function Sidebar({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const role = user?.role || 'agent';

  const items: any[] = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/tickets', icon: <CustomerServiceOutlined />, label: 'Tickets' },
  ];

  if (hasMinRole(role, 'team_lead')) {
    items.push({ key: '/upload', icon: <UploadOutlined />, label: 'Excel Upload' });
  }
  if (hasMinRole(role, 'team_lead')) {
    items.push({ key: '/analytics', icon: <BarChartOutlined />, label: 'Analytics' });
  }
  if (hasMinRole(role, 'super_admin')) {
    items.push({ type: 'divider' });
    items.push({ key: '/admin/users', icon: <TeamOutlined />, label: 'Users' });
    items.push({ key: '/admin/departments', icon: <SettingOutlined />, label: 'Departments' });
    items.push({ key: '/admin/sla', icon: <AuditOutlined />, label: 'SLA Policies' });
  }

  return (
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      width={240}
      style={{
        background: '#1E3A5F',
        minHeight: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
      }}
    >
      <div style={{ padding: collapsed ? '20px 8px' : '20px 16px', textAlign: 'center' }}>
        <Title level={4} style={{ color: '#fff', margin: 0, fontSize: collapsed ? 14 : 18 }}>
          {collapsed ? 'HD' : '🎫 Helpdesk Hub'}
        </Title>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        onClick={({ key }) => navigate(key)}
        items={items}
        style={{
          background: 'transparent',
          borderRight: 'none',
          color: '#C8DDF4',
        }}
        theme="dark"
      />
    </Sider>
  );
}
