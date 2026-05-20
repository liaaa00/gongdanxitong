import { useEffect, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Button, Card, Form, InputNumber, Space, Typography, App, Skeleton } from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import { getOperationLogRetention, updateOperationLogRetention } from '@/services/systemSettings';

interface SystemSettingsFormValues {
  days: number;
}

const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 3650;
const RANGE_ERROR_MESSAGE = '请输入 7-3650';

const AdminSystemSettings: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm<SystemSettingsFormValues>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const setting = await getOperationLogRetention();
      form.setFieldsValue({ days: setting.days });
    } catch {
      message.error('系统设置加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const updated = await updateOperationLogRetention(values.days);
      form.setFieldsValue({ days: updated.days });
      message.success('保存成功');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer title="系统设置">
      <Card title="操作日志保留天数">
        {loading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : (
          <Form<SystemSettingsFormValues>
            form={form}
            layout="vertical"
            requiredMark="optional"
            onFinish={handleSave}
            onFinishFailed={() => message.error(RANGE_ERROR_MESSAGE)}
          >
            <Form.Item
              name="days"
              label="保留天数"
              rules={[
                { required: true, message: RANGE_ERROR_MESSAGE },
                { type: 'number', min: MIN_RETENTION_DAYS, max: MAX_RETENTION_DAYS, message: RANGE_ERROR_MESSAGE },
              ]}
            >
              <InputNumber
                min={MIN_RETENTION_DAYS}
                max={MAX_RETENTION_DAYS}
                step={1}
                precision={0}
                style={{ width: 240 }}
                placeholder="请输入保留天数"
              />
            </Form.Item>
            <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
              超过设定天数的操作日志将在每日 03:00 自动清理。默认 365 天。修改后 30 秒内生效。
            </Typography.Paragraph>
            <Space wrap>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                保存
              </Button>
              <Button icon={<ReloadOutlined />} onClick={load} disabled={saving}>
                重新加载
              </Button>
            </Space>
          </Form>
        )}
      </Card>
    </PageContainer>
  );
};

export default AdminSystemSettings;
