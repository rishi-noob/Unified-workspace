import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Space } from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth';

const { Title, Text } = Typography;

export default function LoginPage() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.email, values.password);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #1E3A5F 0%, #2E6DA4 50%, #0F9D58 100%)',
      }}
    >
      <Card
        style={{
          width: 420,
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%', textAlign: 'center' }}>
          <div>
            <Title level={2} style={{ margin: 0, color: '#1E3A5F' }}>🎫 Helpdesk Hub</Title>
            <Text type="secondary">Unified Ticketing System</Text>
          </div>

          <Form layout="vertical" onFinish={onFinish} size="large" autoComplete="off">
            <Form.Item name="email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
              <Input prefix={<MailOutlined />} placeholder="Email" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, min: 6, message: 'Password required (min 6 chars)' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="Password" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block
                style={{ height: 44, background: '#1E3A5F', borderRadius: 8 }}>
                Sign In
              </Button>
            </Form.Item>
          </Form>

          <div style={{ textAlign: 'left', background: '#f8fafc', padding: 12, borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <strong>Demo Credentials</strong> (password: Demo@1234)<br />
              admin@company.com · it-manager@company.com<br />
              it-lead@company.com · it-agent1@company.com
            </Text>
          </div>
        </Space>
      </Card>
    </div>
  );
}
