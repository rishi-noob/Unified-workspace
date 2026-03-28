import React, { useState } from 'react';
import { Card, Typography, Button, Table, Tag, Progress, Alert, Space, Upload } from 'antd';
import { InboxOutlined, CheckCircleOutlined, CloseCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import { channelsApi } from '../../api/channels.api';

const { Title, Text } = Typography;
const { Dragger } = Upload;

export default function ExcelUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<any>(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      const res = await channelsApi.uploadExcel(file, setProgress);
      setResult(res.data || res);
    } catch (err: any) {
      setResult({ error: err.response?.data?.error?.message || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const errorColumns = [
    { title: 'Row', dataIndex: 'row', key: 'row', width: 80 },
    { title: 'Errors', dataIndex: 'errors', key: 'errors', render: (errs: string[]) => errs.map((e, i) => <Tag color="red" key={i}>{e}</Tag>) },
  ];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Title level={3}>Excel Upload</Title>
      <Text type="secondary">Upload an Excel file (.xlsx, .xls, .csv) with columns: Subject, Description, Department, Priority, Requester Email</Text>

      <Card style={{ marginTop: 20, borderRadius: 12 }}>
        <Dragger
          accept=".xlsx,.xls,.csv"
          maxCount={1}
          beforeUpload={(f) => { setFile(f); setResult(null); return false; }}
          onRemove={() => { setFile(null); setResult(null); }}
          showUploadList={{ showRemoveIcon: true }}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined style={{ color: '#1E3A5F', fontSize: 48 }} /></p>
          <p className="ant-upload-text">Click or drag file here</p>
          <p className="ant-upload-hint">Max 10MB · .xlsx, .xls, .csv supported</p>
        </Dragger>

        {file && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Button type="primary" onClick={handleUpload} loading={uploading}
              style={{ background: '#1E3A5F', borderRadius: 8 }}>
              {uploading ? 'Uploading...' : 'Upload & Import'}
            </Button>
          </div>
        )}

        {uploading && <Progress percent={progress} style={{ marginTop: 16 }} />}
      </Card>

      {result && !result.error && (
        <Card style={{ marginTop: 20, borderRadius: 12 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type="success"
              message={<span><CheckCircleOutlined /> Imported {result.imported} of {result.total} tickets</span>}
            />
            {result.failed > 0 && (
              <>
                <Alert type="warning"
                  message={<span><CloseCircleOutlined /> {result.failed} rows failed validation</span>}
                />
                <Table dataSource={result.errors} columns={errorColumns} rowKey="row"
                  pagination={false} size="small" />
              </>
            )}
          </Space>
        </Card>
      )}

      {result?.error && (
        <Alert type="error" message={result.error} style={{ marginTop: 20 }} />
      )}
    </div>
  );
}
