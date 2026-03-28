import React, { useState } from 'react';
import {
  Card, Typography, Button, Table, Tag, Progress, Alert, Space, Upload, Descriptions, Divider, message,
} from 'antd';
import { InboxOutlined, CheckCircleOutlined, CloseCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import { channelsApi } from '../../api/channels.api';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

const REQUIRED_HEADERS = [
  { key: 'subject', desc: 'Short title (max 255 characters)' },
  { key: 'description', desc: 'Full request details' },
  { key: 'department', desc: 'Must match a department slug: it, hr, or travel' },
  { key: 'priority', desc: 'One of: low, normal, high, critical' },
  { key: 'requester_email', desc: 'Valid email of the person raising the request' },
];

function parseUploadError(err: unknown): string {
  const e = err as { response?: { data?: { error?: { message?: string | string[] } } } };
  const m = e?.response?.data?.error?.message;
  if (Array.isArray(m)) return m.join(', ');
  if (typeof m === 'string') return m;
  return 'Upload failed';
}

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
      const payload = (res as any)?.data ?? res;
      setResult(payload);
      if (payload?.imported > 0) {
        message.success(`Imported ${payload.imported} ticket(s)`);
      }
    } catch (err: unknown) {
      setResult({ error: parseUploadError(err) });
    } finally {
      setUploading(false);
    }
  };

  const errorColumns = [
    { title: 'Row', dataIndex: 'row', key: 'row', width: 80 },
    {
      title: 'Errors',
      dataIndex: 'errors',
      key: 'errors',
      render: (errs: string[]) => errs.map((e, i) => <Tag color="red" key={i}>{e}</Tag>),
    },
  ];

  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      <Title level={3}>Excel Upload</Title>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        Bulk-create tickets from <Text strong>.xlsx</Text>, <Text strong>.xls</Text>, or <Text strong>.csv</Text>.
        The <Text strong>first sheet</Text> is read. Row 1 must be the header row; each following row is one ticket.
        (Requires <Text code>team_lead</Text> role or higher for this page.)
      </Paragraph>

      <Card title="Required format (row 1 = headers)" style={{ marginBottom: 20, borderRadius: 12 }}>
        <Descriptions column={1} size="small" bordered>
          {REQUIRED_HEADERS.map((h) => (
            <Descriptions.Item key={h.key} label={<Text code>{h.key}</Text>}>
              {h.desc}
            </Descriptions.Item>
          ))}
        </Descriptions>
        <Divider style={{ margin: '16px 0' }} />
        <Text type="secondary">
          Header names are matched case-insensitively; spaces become underscores (e.g. &quot;Requester Email&quot; →
          requester_email).
        </Text>
        <div style={{ marginTop: 16 }}>
          <Space wrap align="start">
            <a href="/ticketing-bulk-import-template.csv" download="ticketing-bulk-import-template.csv">
              <Button type="link" icon={<DownloadOutlined />} style={{ paddingLeft: 0 }}>
                Download sample CSV
              </Button>
            </a>
            <Text type="secondary">Open in Excel or Google Sheets, edit, then save as .xlsx if you prefer.</Text>
          </Space>
        </div>
      </Card>

      <Card style={{ borderRadius: 12 }}>
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
