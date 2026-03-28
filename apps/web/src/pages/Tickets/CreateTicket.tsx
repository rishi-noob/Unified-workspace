import React, { useEffect, useState } from 'react';
import { Form, Input, Select, Button, Card, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useCreateTicket } from '../../hooks/useTickets';
import { departmentsApi } from '../../api/channels.api';

const { Title } = Typography;
const { TextArea } = Input;

export default function CreateTicket() {
  const navigate = useNavigate();
  const create = useCreateTicket();
  const [departments, setDepartments] = useState<any[]>([]);

  useEffect(() => {
    departmentsApi.list().then((res) => {
      const d = res.data || res;
      setDepartments(Array.isArray(d) ? d : []);
    }).catch(() => {});
  }, []);

  const onFinish = async (values: any) => {
    await create.mutateAsync(values);
    navigate('/tickets');
  };

  return (
    <Card style={{ maxWidth: 700, margin: '0 auto', borderRadius: 12 }}>
      <Title level={3}>Create Ticket</Title>
      <Form layout="vertical" onFinish={onFinish} size="large"
        initialValues={{ priority: 'normal' }}>
        <Form.Item name="subject" label="Subject" rules={[{ required: true, max: 255 }]}>
          <Input placeholder="Brief summary of the issue" />
        </Form.Item>
        <Form.Item name="description" label="Description" rules={[{ required: true }]}>
          <TextArea rows={5} placeholder="Describe the issue in detail..." />
        </Form.Item>
        <Form.Item name="priority" label="Priority">
          <Select>
            {['low', 'normal', 'high', 'critical'].map((p) => (
              <Select.Option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="departmentId" label="Department">
          <Select allowClear placeholder="Auto-assigned by AI if left blank">
            {departments.map((d: any) => (
              <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={create.isPending}
            style={{ background: '#1E3A5F', borderRadius: 8 }}>
            Create Ticket
          </Button>
          <Button style={{ marginLeft: 8 }} onClick={() => navigate('/tickets')}>Cancel</Button>
        </Form.Item>
      </Form>
    </Card>
  );
}
