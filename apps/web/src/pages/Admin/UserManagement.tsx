import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Tag, Typography, Space, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { usersApi } from '../../api/channels.api';
import type { User } from '../../types/user.types';

const { Title } = Typography;

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await usersApi.list();
      setUsers(Array.isArray(res.data || res) ? (res.data || res) : []);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (values: any) => {
    await usersApi.create(values);
    message.success('User created');
    setModal(false);
    form.resetFields();
    load();
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Role', dataIndex: 'role', key: 'role',
      render: (r: string) => <Tag color="#1E3A5F">{r.replace('_', ' ')}</Tag>,
    },
    {
      title: 'Status', dataIndex: 'isActive', key: 'isActive',
      render: (v: boolean) => v ? <Tag color="green">Active</Tag> : <Tag color="red">Inactive</Tag>,
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: any, rec: User) => (
        <Button size="small" danger onClick={async () => {
          await usersApi.delete(rec.id);
          message.success('User deactivated');
          load();
        }}>Deactivate</Button>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>User Management</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal(true)}
          style={{ background: '#1E3A5F' }}>Add User</Button>
      </Space>
      <Table dataSource={users} columns={columns} rowKey="id" loading={loading} />

      <Modal title="Create User" open={modal} onCancel={() => setModal(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, min: 6 }]}><Input.Password /></Form.Item>
          <Form.Item name="role" label="Role">
            <Select defaultValue="agent">
              {['agent', 'team_lead', 'manager', 'super_admin'].map((r) => (
                <Select.Option key={r}>{r.replace('_', ' ')}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" style={{ background: '#1E3A5F' }}>Create</Button></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
