import React from 'react';
import { Layout, Button, Dropdown, Typography, Badge, Space, Tag } from 'antd';
import {
  MenuFoldOutlined, MenuUnfoldOutlined, LogoutOutlined,
  UserOutlined, BellOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth';
import { useSocketStore } from '../../store/socket.store';

const { Header } = Layout;
const { Text } = Typography;

const ROLE_LABELS: Record<string, string> = {
  agent: 'Agent', team_lead: 'Team Lead', manager: 'Manager', super_admin: 'Super Admin',
};

export default function TopBar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const { user, logout } = useAuth();
  const connected = useSocketStore((s) => s.connected);

  return (
    <Header
      style={{
        padding: '0 24px',
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #f0f0f0',
        position: 'sticky',
        top: 0,
        zIndex: 99,
      }}
    >
      <Space>
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={() => setCollapsed(!collapsed)}
        />
      </Space>

      <Space size="middle">
        <Badge dot color={connected ? '#0F9D58' : '#ccc'}>
          <BellOutlined style={{ fontSize: 18 }} />
        </Badge>

        <Dropdown
          menu={{
            items: [
              { key: 'profile', label: `${user?.email}`, disabled: true },
              { key: 'role', label: <Tag>{ROLE_LABELS[user?.role || ''] || user?.role}</Tag>, disabled: true },
              { type: 'divider' },
              { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', onClick: logout },
            ],
          }}
        >
          <Space style={{ cursor: 'pointer' }}>
            <UserOutlined />
            <Text strong>{user?.name}</Text>
          </Space>
        </Dropdown>
      </Space>
    </Header>
  );
}
