import React from 'react';
import { Row, Col, Card, Statistic, Typography } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, WarningOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useAnalyticsOverview, useAnalyticsVolume, useAnalyticsSla, useAnalyticsChannels } from '../../hooks/useAnalytics';
import VolumeChart from '../../components/charts/VolumeChart';
import SlaDonut from '../../components/charts/SlaDonut';
import ChannelBreakdown from '../../components/charts/ChannelBreakdown';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const { Title } = Typography;

export default function ManagerView() {
  const { data: overview, isLoading } = useAnalyticsOverview();
  const { data: volume } = useAnalyticsVolume();
  const { data: sla } = useAnalyticsSla();
  const { data: channels } = useAnalyticsChannels();

  if (isLoading) return <LoadingSpinner tip="Loading dashboard..." />;

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>Manager Dashboard</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic title="Open Tickets" value={overview?.openCount || 0}
              prefix={<ClockCircleOutlined style={{ color: '#2E6DA4' }} />}
              valueStyle={{ color: '#2E6DA4' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic title="Resolved Today" value={overview?.resolvedToday || 0}
              prefix={<CheckCircleOutlined style={{ color: '#0F9D58' }} />}
              valueStyle={{ color: '#0F9D58' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic title="SLA Breach Rate" value={overview?.breachRate || 0} suffix="%"
              prefix={<WarningOutlined style={{ color: '#F59E0B' }} />}
              valueStyle={{ color: overview?.breachRate > 20 ? '#EF4444' : '#F59E0B' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic title="Avg Resolution" value={overview?.avgResolutionHours || 0} suffix="hrs"
              prefix={<ThunderboltOutlined style={{ color: '#1E3A5F' }} />}
              valueStyle={{ color: '#1E3A5F' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col span={14}>
          <Card title="Ticket Volume" style={{ borderRadius: 12 }}>
            <VolumeChart data={volume || []} />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="SLA Compliance" style={{ borderRadius: 12 }}>
            <SlaDonut data={sla?.data || []} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="Channel Breakdown" style={{ borderRadius: 12 }}>
            <ChannelBreakdown data={channels || []} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
