import React from 'react';
import { Typography, Card, Row, Col, Statistic } from 'antd';
import { TeamOutlined, CustomerServiceOutlined, SettingOutlined, AuditOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAnalyticsOverview } from '../../hooks/useAnalytics';
import ManagerView from './ManagerView';

const { Title } = Typography;

export default function AdminView() {
  const navigate = useNavigate();
  const { data: overview } = useAnalyticsOverview();

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>Admin Dashboard</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          { title: 'Manage Users', icon: <TeamOutlined />, path: '/admin/users', color: '#1E3A5F' },
          { title: 'Departments', icon: <SettingOutlined />, path: '/admin/departments', color: '#2E6DA4' },
          { title: 'SLA Policies', icon: <AuditOutlined />, path: '/admin/sla', color: '#0F9D58' },
          { title: 'All Tickets', icon: <CustomerServiceOutlined />, path: '/tickets', color: '#722ED1' },
        ].map((item) => (
          <Col span={6} key={item.path}>
            <Card hoverable onClick={() => navigate(item.path)}
              style={{ borderRadius: 12, borderTop: `3px solid ${item.color}`, textAlign: 'center' }}>
              <div style={{ fontSize: 32, color: item.color, marginBottom: 8 }}>{item.icon}</div>
              <Title level={5} style={{ margin: 0 }}>{item.title}</Title>
            </Card>
          </Col>
        ))}
      </Row>

      <ManagerView />
    </div>
  );
}
