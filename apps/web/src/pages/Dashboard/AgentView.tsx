import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Select, Input, Empty, notification, Typography, Tag, Space, List } from 'antd';
import { SearchOutlined, AlertOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTickets } from '../../hooks/useTickets';
import { useSocket } from '../../hooks/useSocket';
import PriorityBadge from '../../components/common/PriorityBadge';
import StatusBadge from '../../components/common/StatusBadge';
import DepartmentTag from '../../components/common/DepartmentTag';
import SlaCountdown from '../../components/tickets/SlaCountdown';
import SentimentBadge from '../../components/tickets/SentimentBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import type { Ticket } from '../../types/ticket.types';

const { Title, Text } = Typography;

export default function AgentView({ pageTitle = 'My dashboard' }: { pageTitle?: string } = {}) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Record<string, any>>({});
  const { data, isLoading } = useTickets(filters);
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: any) => {
      notification.info({
        message: 'New Ticket',
        description: payload.ticket?.subject || 'A new ticket arrived',
        icon: <AlertOutlined style={{ color: '#1E3A5F' }} />,
      });
    };
    socket.on('ticket:created', handler);
    return () => { socket.off('ticket:created', handler); };
  }, [socket]);

  const tickets: Ticket[] = data?.items || [];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>{pageTitle}</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col span={8}>
          <Input
            placeholder="Search tickets..."
            prefix={<SearchOutlined />}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value || undefined }))}
            allowClear
          />
        </Col>
        <Col span={4}>
          <Select placeholder="Status" allowClear style={{ width: '100%' }}
            onChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
            {['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed'].map((s) => (
              <Select.Option key={s} value={s}>{s.replace('_', ' ')}</Select.Option>
            ))}
          </Select>
        </Col>
        <Col span={4}>
          <Select placeholder="Priority" allowClear style={{ width: '100%' }}
            onChange={(v) => setFilters((f) => ({ ...f, priority: v }))}>
            {['low', 'normal', 'high', 'critical'].map((p) => (
              <Select.Option key={p} value={p}>{p}</Select.Option>
            ))}
          </Select>
        </Col>
      </Row>

      {isLoading ? (
        <LoadingSpinner tip="Loading tickets..." />
      ) : tickets.length === 0 ? (
        <Empty description="No tickets found" />
      ) : (
        <List
          dataSource={tickets}
          renderItem={(ticket) => (
            <Card
              hoverable
              size="small"
              style={{ marginBottom: 8, borderRadius: 12, borderLeft: `4px solid ${ticket.slaBreached ? '#EF4444' : '#1E3A5F'}` }}
              onClick={() => navigate(`/tickets/${ticket.id}`)}
            >
              <Row align="middle" justify="space-between">
                <Col flex="1">
                  <Space direction="vertical" size={2}>
                    <Text strong style={{ fontSize: 14 }}>
                      {ticket.subject.length > 60 ? ticket.subject.substring(0, 60) + '…' : ticket.subject}
                    </Text>
                    <Space size={4}>
                      <StatusBadge status={ticket.status} />
                      <PriorityBadge priority={ticket.priority} />
                      <DepartmentTag name={ticket.department?.name} />
                      <SentimentBadge sentiment={ticket.aiSentiment} />
                      {ticket.assignedTo && (
                        <Tag icon={<span>👤</span>}>{ticket.assignedTo.name}</Tag>
                      )}
                    </Space>
                  </Space>
                </Col>
                <Col>
                  <SlaCountdown
                    slaResolutionAt={ticket.slaResolutionAt}
                    slaBreached={ticket.slaBreached}
                    createdAt={ticket.createdAt}
                  />
                </Col>
              </Row>
            </Card>
          )}
        />
      )}

      {data && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary">Showing {tickets.length} of {data.total} tickets</Text>
        </div>
      )}
    </div>
  );
}
