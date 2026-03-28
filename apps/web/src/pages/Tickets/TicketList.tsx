import React, { useState } from 'react';
import { Table, Input, Select, Space, Button, Row, Col, Tag, Typography } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTickets } from '../../hooks/useTickets';
import PriorityBadge from '../../components/common/PriorityBadge';
import StatusBadge from '../../components/common/StatusBadge';
import DepartmentTag from '../../components/common/DepartmentTag';
import SentimentBadge from '../../components/tickets/SentimentBadge';
import { formatRelative } from '../../utils/date.utils';
import type { Ticket } from '../../types/ticket.types';

const { Title } = Typography;

export default function TicketList() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Record<string, any>>({ page: 1, limit: 20 });
  const { data, isLoading } = useTickets(filters);

  const columns = [
    {
      title: 'Subject', dataIndex: 'subject', key: 'subject',
      render: (text: string) => text.length > 50 ? text.substring(0, 50) + '…' : text,
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      render: (s: any) => <StatusBadge status={s} />,
    },
    {
      title: 'Priority', dataIndex: 'priority', key: 'priority', width: 100,
      render: (p: any) => <PriorityBadge priority={p} />,
    },
    {
      title: 'Department', key: 'department', width: 110,
      render: (_: any, rec: Ticket) => <DepartmentTag name={rec.department?.name} />,
    },
    {
      title: 'Sentiment', key: 'sentiment', width: 110,
      render: (_: any, rec: Ticket) => <SentimentBadge sentiment={rec.aiSentiment} />,
    },
    {
      title: 'Assignee', key: 'assignee', width: 130,
      render: (_: any, rec: Ticket) => rec.assignedTo?.name || <Tag>Unassigned</Tag>,
    },
    {
      title: 'Channel', dataIndex: 'channel', key: 'channel', width: 90,
      render: (c: string) => <Tag>{c}</Tag>,
    },
    {
      title: 'Created', dataIndex: 'createdAt', key: 'createdAt', width: 120,
      render: (d: string) => formatRelative(d),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Tickets</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/tickets/create')}
          style={{ background: '#1E3A5F', borderRadius: 8 }}>
          Create Ticket
        </Button>
      </Row>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search..." prefix={<SearchOutlined />} allowClear
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value || undefined, page: 1 }))} />
        </Col>
        <Col span={4}>
          <Select placeholder="Status" allowClear style={{ width: '100%' }}
            onChange={(v) => setFilters((f) => ({ ...f, status: v, page: 1 }))}>
            {['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed'].map((s) => (
              <Select.Option key={s}>{s.replace('_', ' ')}</Select.Option>
            ))}
          </Select>
        </Col>
        <Col span={4}>
          <Select placeholder="Priority" allowClear style={{ width: '100%' }}
            onChange={(v) => setFilters((f) => ({ ...f, priority: v, page: 1 }))}>
            {['low', 'normal', 'high', 'critical'].map((p) => (
              <Select.Option key={p}>{p}</Select.Option>
            ))}
          </Select>
        </Col>
      </Row>

      <Table
        dataSource={data?.items || []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        onRow={(record) => ({ onClick: () => navigate(`/tickets/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{
          current: data?.page || 1,
          total: data?.total || 0,
          pageSize: data?.limit || 20,
          onChange: (p) => setFilters((f) => ({ ...f, page: p })),
          showTotal: (t) => `${t} tickets`,
        }}
        style={{ borderRadius: 12 }}
      />
    </div>
  );
}
