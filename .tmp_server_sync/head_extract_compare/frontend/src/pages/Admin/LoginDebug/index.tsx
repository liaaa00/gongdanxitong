import { useState, useEffect, useCallback } from 'react';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Button, Tag, Space, App, Card, Alert, Typography, Input, Form, Statistic, Row, Col } from 'antd';
import { ReloadOutlined, SafetyCertificateOutlined, LoginOutlined } from '@ant-design/icons';
import {
  diagnoseUserLoginReadiness,
  probeRealLogin,
  type LoginReadinessResult,
  type LoginReadinessReport,
  type RealLoginProbeResult,
} from '@/services/users';
import { isMockMode } from '@/services/mock';

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  ok: { color: 'green', text: '可登录' },
  disabled: { color: 'red', text: '已禁用' },
  no_role: { color: 'orange', text: '无角色' },
  never_logged_in: { color: 'gold', text: '从未登录' },
};

const formatDateTime = (value: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
};

const LoginDebugPage: React.FC = () => {
  const { message } = App.useApp();
  const [report, setReport] = useState<LoginReadinessReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<RealLoginProbeResult | null>(null);
  const [form] = Form.useForm<{ username: string; password: string }>();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await diagnoseUserLoginReadiness();
      setReport(data);
    } catch {
      message.error('拉取用户诊断数据失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleProbe = async () => {
    const values = await form.validateFields();
    setProbing(true);
    setProbeResult(null);
    try {
      const result = await probeRealLogin(values.username.trim(), values.password);
      setProbeResult(result);
    } catch {
      setProbeResult({ ok: false, status: 'error', message: '验证过程发生异常' });
    } finally {
      setProbing(false);
    }
  };

  const columns: ProColumns<LoginReadinessResult>[] = [
    { title: '用户名', dataIndex: 'username', width: 140, fixed: 'left' },
    { title: '姓名', dataIndex: 'real_name', width: 110 },
    {
      title: '账号状态', dataIndex: 'is_active', width: 90,
      render: (_, r) => <Tag color={r.is_active ? 'green' : 'red'}>{r.is_active ? '启用' : '禁用'}</Tag>,
    },
    { title: '角色', dataIndex: 'role_names', width: 180, ellipsis: true },
    {
      title: '最后登录', dataIndex: 'last_login_at', width: 170,
      render: (_, r) => formatDateTime(r.last_login_at),
    },
    {
      title: '诊断', dataIndex: 'status', width: 100, fixed: 'right',
      filters: Object.entries(STATUS_TAG).map(([value, cfg]) => ({ text: cfg.text, value })),
      onFilter: (value, record) => record.status === value,
      render: (_, r) => {
        const cfg = STATUS_TAG[r.status] || { color: 'default', text: '未知' };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    { title: '建议', dataIndex: 'advice', ellipsis: true },
  ];

  const backendUnreachable = report !== null && !report.backendReachable;

  return (
    <PageContainer header={{ title: '登录诊断工具' }}>
      <Alert
        type="info"
        showIcon
        message="诊断说明"
        description="本页拉取后端真实用户列表，依据后端登录规则（禁用账号直接拒绝、登录成功才记录最后登录时间、无角色登录后无权限）逐个诊断账号的登录就绪状态。下方还可用任意账号密码实调后端接口做真实登录验证。"
        style={{ marginBottom: 16 }}
      />

      {backendUnreachable && (
        <Alert
          type="error"
          showIcon
          message="无法连接后端"
          description="未能获取真实用户数据。请确认后端服务已启动，且当前不是 Mock 模式。"
          style={{ marginBottom: 16 }}
        />
      )}

      <Card
        title={<Space><SafetyCertificateOutlined />用户登录就绪诊断</Space>}
        extra={<Button icon={<ReloadOutlined />} loading={loading} onClick={() => void refresh()}>刷新</Button>}
        style={{ marginBottom: 16 }}
      >
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}><Statistic title="用户总数" value={report?.total ?? 0} /></Col>
          <Col span={8}><Statistic title="可正常登录" value={report?.okCount ?? 0} valueStyle={{ color: '#3f8600' }} /></Col>
          <Col span={8}><Statistic title="存在异常" value={report?.issueCount ?? 0} valueStyle={{ color: (report?.issueCount ?? 0) > 0 ? '#cf1322' : undefined }} /></Col>
        </Row>
        <ProTable<LoginReadinessResult>
          columns={columns}
          dataSource={report?.results ?? []}
          rowKey="username"
          loading={loading}
          search={false}
          options={false}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          size="small"
          scroll={{ x: 900 }}
          toolBarRender={false}
        />
      </Card>

      <Card title={<Space><LoginOutlined />真实登录验证</Space>}>
        <Alert
          type={isMockMode ? 'warning' : 'info'}
          showIcon
          message={isMockMode
            ? '当前为 Mock 模式，真实登录验证不可用（需连接真实后端）。'
            : '输入账号密码，直接调用后端 /auth/login 验证是否真能登录。此操作不会改变你当前的登录会话。'}
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="inline" onFinish={handleProbe}>
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="用户名" allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="密码" style={{ width: 180 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={probing} disabled={isMockMode}>验证登录</Button>
          </Form.Item>
        </Form>
        {probeResult && (
          <Alert
            type={probeResult.ok ? 'success' : 'error'}
            showIcon
            style={{ marginTop: 16 }}
            message={probeResult.ok ? '验证通过' : '验证失败'}
            description={
              <Typography.Paragraph style={{ margin: 0 }}>
                {probeResult.message}
                {probeResult.ok && probeResult.mustChangePassword && (
                  <><br /><Typography.Text type="warning">注意：该账号被标记为需要修改密码，登录后会跳转改密页。</Typography.Text></>
                )}
              </Typography.Paragraph>
            }
          />
        )}
      </Card>
    </PageContainer>
  );
};

export default LoginDebugPage;
