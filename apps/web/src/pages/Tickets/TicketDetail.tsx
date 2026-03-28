import React, { useState } from 'react';
import {
  Row, Col, Card, Typography, Tag, Space, Descriptions, Button, Input, List,
  Divider, Tabs, Spin, Tooltip, Progress, message,
} from 'antd';
import {
  ArrowLeftOutlined, RobotOutlined, SendOutlined, SyncOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useTicket, useReplyTicket, useUpdateTicket, useAiDraft } from '../../hooks/useTickets';
import PriorityBadge from '../../components/common/PriorityBadge';
import StatusBadge from '../../components/common/StatusBadge';
import DepartmentTag from '../../components/common/DepartmentTag';
import SentimentBadge from '../../components/tickets/SentimentBadge';
import SlaCountdown from '../../components/tickets/SlaCountdown';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { formatDate } from '../../utils/date.utils';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: ticket, isLoading } = useTicket(id!);
  const reply = useReplyTicket();
  const updateTicket = useUpdateTicket();
  const aiDraft = useAiDraft();
  const [replyText, setReplyText] = useState('');
  const [tab, setTab] = useState('replies');

  if (isLoading) return <LoadingSpinner tip="Loading ticket..." />;
  if (!ticket) return <div>Ticket not found</div>;

  const handleReply = () => {
    if (!replyText.trim()) return;
    reply.mutate({ id: id!, content: replyText }, { onSuccess: () => setReplyText('') });
  };

  const handleAiDraft = async () => {
    const res = await aiDraft.mutateAsync(id!);
    setReplyText(res.draft || '');
    message.success('AI draft generated — review and edit before sending');
  };

  const handleStatusChange = (status: string) => {
    updateTicket.mutate({ id: id!, data: { status } });
  };

  const replies = (ticket.replies || []).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const notes = (ticket.notes || []).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>
        Back
      </Button>

      <Row gutter={[20, 20]}>
        {/* Left panel — thread */}
        <Col span={15}>
          <Card style={{ borderRadius: 12 }}>
            <Title level={4}>{ticket.subject}</Title>
            <Paragraph style={{ background: '#f8fafc', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap' }}>
              {ticket.description}
            </Paragraph>

            <Divider />

            <Tabs activeKey={tab} onChange={setTab}
              items={[
                { key: 'replies', label: `Replies (${replies.length})` },
                { key: 'notes', label: `Internal Notes (${notes.length})` },
              ]}
            />

            {tab === 'replies' && (
              <List
                dataSource={replies}
                locale={{ emptyText: 'No replies yet' }}
                renderItem={(r: any) => (
                  <div style={{
                    padding: 12, marginBottom: 8, borderRadius: 10,
                    background: r.direction === 'outbound' ? '#e8f5e9' : '#f3f4f6',
                    marginLeft: r.direction === 'outbound' ? 40 : 0,
                    marginRight: r.direction === 'inbound' ? 40 : 0,
                  }}>
                    <Space>
                      <Text strong>{r.author?.name || 'Customer'}</Text>
                      <Tag>{r.direction}</Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(r.createdAt)}</Text>
                    </Space>
                    <Paragraph style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{r.content}</Paragraph>
                  </div>
                )}
              />
            )}

            {tab === 'notes' && (
              <List
                dataSource={notes}
                locale={{ emptyText: 'No internal notes' }}
                renderItem={(n: any) => (
                  <div style={{ padding: 12, marginBottom: 8, borderRadius: 10, background: '#fff7e6', borderLeft: '3px solid #F59E0B' }}>
                    <Space>
                      <Text strong>{n.author?.name}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(n.createdAt)}</Text>
                    </Space>
                    <Paragraph style={{ margin: '6px 0 0' }}>{n.content}</Paragraph>
                  </div>
                )}
              />
            )}

            <Divider />

            {/* Reply composer */}
            <Space direction="vertical" style={{ width: '100%' }}>
              <Row justify="space-between">
                <Text strong>Reply</Text>
                <Button icon={<RobotOutlined />} onClick={handleAiDraft} loading={aiDraft.isPending} size="small">
                  Generate AI Draft
                </Button>
              </Row>
              <TextArea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={4}
                placeholder="Type your reply..."
              />
              <Button type="primary" icon={<SendOutlined />} onClick={handleReply}
                loading={reply.isPending} disabled={!replyText.trim()}
                style={{ background: '#1E3A5F' }}>
                Send Reply
              </Button>
            </Space>
          </Card>
        </Col>

        {/* Right panel — metadata & AI */}
        <Col span={9}>
          <Card title="Details" style={{ borderRadius: 12, marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Status"><StatusBadge status={ticket.status} /></Descriptions.Item>
              <Descriptions.Item label="Priority"><PriorityBadge priority={ticket.priority} /></Descriptions.Item>
              <Descriptions.Item label="Department"><DepartmentTag name={ticket.department?.name} /></Descriptions.Item>
              <Descriptions.Item label="Channel"><Tag>{ticket.channel}</Tag></Descriptions.Item>
              <Descriptions.Item label="Assignee">{ticket.assignedTo?.name || 'Unassigned'}</Descriptions.Item>
              <Descriptions.Item label="Created">{formatDate(ticket.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Updated">{formatDate(ticket.updatedAt)}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="SLA" style={{ borderRadius: 12, marginBottom: 16 }}>
            <SlaCountdown slaResolutionAt={ticket.slaResolutionAt} slaBreached={ticket.slaBreached} createdAt={ticket.createdAt} />
          </Card>

          {(ticket.aiCategory || ticket.aiSentiment) && (
            <Card title="🤖 AI Insights" style={{ borderRadius: 12, marginBottom: 16 }}>
              <Space direction="vertical">
                {ticket.aiCategory && <div><Text type="secondary">Category:</Text> <Tag color="#1E3A5F">{ticket.aiCategory}</Tag></div>}
                {ticket.aiSentiment && <div><Text type="secondary">Sentiment:</Text> <SentimentBadge sentiment={ticket.aiSentiment} /></div>}
                {ticket.aiConfidence != null && (
                  <div>
                    <Text type="secondary">Confidence:</Text>
                    <Progress percent={Math.round(ticket.aiConfidence * 100)} size="small"
                      strokeColor={ticket.aiConfidence >= 0.8 ? '#0F9D58' : '#F59E0B'} />
                  </div>
                )}
              </Space>
            </Card>
          )}

          <Card title="Actions" style={{ borderRadius: 12 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {ticket.status !== 'resolved' && (
                <Button block onClick={() => handleStatusChange('resolved')} style={{ background: '#0F9D58', color: '#fff' }}>
                  Mark Resolved
                </Button>
              )}
              {ticket.status !== 'closed' && (
                <Button block onClick={() => handleStatusChange('closed')}>Close Ticket</Button>
              )}
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
