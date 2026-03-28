import React, { useEffect, useState } from 'react';
import { Table, Typography, Tag } from 'antd';
import { slaPoliciesApi } from '../../api/channels.api';

export default function SlaConfig() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    slaPoliciesApi.list().then((r) => setPolicies(Array.isArray(r.data || r) ? (r.data || r) : []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Typography.Title level={3}>SLA Policies</Typography.Title>
      <Table dataSource={policies} rowKey="id" loading={loading} columns={[
        { title: 'Department', key: 'dept', render: (_: any, r: any) => r.department?.name || '—' },
        { title: 'Priority', dataIndex: 'priority', render: (p: string) => <Tag>{p}</Tag> },
        { title: 'First Response (hrs)', dataIndex: 'firstResponseHours' },
        { title: 'Resolution (hrs)', dataIndex: 'resolutionHours' },
      ]} />
    </div>
  );
}
