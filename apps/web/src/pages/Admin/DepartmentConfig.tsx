import React, { useEffect, useState } from 'react';
import { Table, Typography } from 'antd';
import { departmentsApi } from '../../api/channels.api';

export default function DepartmentConfig() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    departmentsApi.list().then((r) => setDepartments(Array.isArray(r.data || r) ? (r.data || r) : []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Typography.Title level={3}>Departments</Typography.Title>
      <Table dataSource={departments} rowKey="id" loading={loading} columns={[
        { title: 'Name', dataIndex: 'name' },
        { title: 'Slug', dataIndex: 'slug' },
        { title: 'Email Alias', dataIndex: 'emailAlias' },
      ]} />
    </div>
  );
}
