import React, { useState } from 'react';
import { Layout, ConfigProvider, theme } from 'antd';
import { useLocation } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import AppRouter from './router';
import { useAuthStore } from './store/auth.store';

const { Content } = Layout;

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoginPage = location.pathname === '/login';
  const showLayout = isAuthenticated && !isLoginPage;

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1E3A5F',
          borderRadius: 8,
          colorBgContainer: '#fff',
        },
        algorithm: theme.defaultAlgorithm,
      }}
    >
      {showLayout ? (
        <Layout style={{ minHeight: '100vh' }}>
          <Sidebar collapsed={collapsed} />
          <Layout style={{ marginLeft: collapsed ? 80 : 240, transition: 'margin-left 0.2s' }}>
            <TopBar collapsed={collapsed} setCollapsed={setCollapsed} />
            <Content style={{
              padding: 24,
              background: '#F8FAFC',
              minHeight: 'calc(100vh - 64px)',
            }}>
              <AppRouter />
            </Content>
          </Layout>
        </Layout>
      ) : (
        <AppRouter />
      )}
    </ConfigProvider>
  );
}
