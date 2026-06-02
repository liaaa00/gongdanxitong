import { useState, useEffect } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Button, Tag, Space, App, Card, Descriptions, Popconfirm, Alert, Typography, Divider } from 'antd';
import { ClearOutlined, ReloadOutlined, SafetyCertificateOutlined, DatabaseOutlined, UserOutlined } from '@ant-design/icons';
import {
  getAllUserPasswordStatus,
  resetAllSeedPasswords,
  clearAllAuthCache,
  verifyAllSeedUserCredentials,
  type PasswordStatus,
  type LoginVerifyResult,
} from '@/services/users';
import { useUserStore } from '@/stores/userStore';

const RESULT_TAG: Record<string, { color: string; text: string }> = {
  ok: { color: 'green', text: '可登录' },
  no_user: { color: 'red', text: '无用户' },
  no_password: { color: 'orange', text: '无密码' },
  wrong_password: { color: 'red', text: '密码错误' },
  disabled: { color: 'default', text: '已禁用' },
  error: { color: 'red', text: '错误' },
};

const LoginDebugPage: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useUserStore();
  const [passwordList, setPasswordList] = useState<PasswordStatus[]>([]);
  const [verifyResults, setVerifyResults] = useState<LoginVerifyResult[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshData = () => {
    setPasswordList(getAllUserPasswordStatus());
    setVerifyResults(verifyAllSeedUserCredentials());
  };

  useEffect(() => { refreshData(); }, []);

  const handleClearCache = () => {
    const cleared = clearAllAuthCache();
    message.success(`已清除 ${cleared.length} 个缓存项，页面即将刷新`);
    setTimeout(() => window.location.reload(), 1000);
  };

  const handleResetPasswords = () => {
    setLoading(true);
    const result = resetAllSeedPasswords();
    message.success(`已重置 ${result.fixed.length} 个种子用户密码为默认值`);
    refreshData();
    setLoading(false);
  };

  const okCount = verifyResults.filter((r) => r.status === 'ok').length;
  const failCount = verifyResults.filter((r) => r.status !== 'ok').length;
  const hasPasswordCount = passwordList.filter((p) => p.has_password).length;

  const passwordColumns: ProColumns<PasswordStatus>[] = [
    { title: '用户名', dataIndex: 'username', width: 130 },
    { title: '姓名', dataIndex: 'real_name', width: 120 },
    {
      title: '状态', dataIndex: 'is_active', width: 80,
      render: (_, r) => <Tag color={r.is_active ? 'green' : 'red'}>{r.is_active ? '启用' : '禁用'}</Tag>,
    },
    {
      title: '密码状态', dataIndex: 'has_password', width: 100,
      render: (_, r) => r.has_password
        ? <Tag color="green">有密码</Tag>
        : <Tag color="red">无密码</Tag>,
    },
    {
      title: '当前密码', dataIndex: 'password', width: 140,
      render: (_, r) => r.has_password ? <Typography.Text code>{r.password}</Typography.Text> : <Tag>无</Tag>,
    },
  ];

  const verifyColumns: ProColumns<LoginVerifyResult>[] = [
    { title: '用户名', dataIndex: 'username', width: 130 },
    { title: '姓名', dataIndex: 'real_name', width: 100 },
    {
      title: '验证结果', dataIndex: 'status', width: 100,
      render: (_, r) => {
        const cfg = RESULT_TAG[r.status] || { color: 'default', text: '未知' };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '预期密码', dataIndex: 'expected_password', width: 110,
      render: (_, r) => <Typography.Text code>{r.expected_password}</Typography.Text>,
    },
    { title: '详情', dataIndex: 'error', ellipsis: true },
  ];

  const sessionInfo = user ? [
    { label: '用户名', children: user.username },
    { label: '姓名', children: user.real_name },
    { label: '角色', children: user.roles?.map((r) => r.name).join(', ') || '无' },
  ] : [
    { label: '状态', children: '未登录' },
  ];

  return (
    <PageContainer header={{ title: '登录诊断工具' }}>
      <Alert
        type="info"
        showIcon
        message="诊断说明"
        description="此页面直接读取浏览器本地缓存中的用户和密码数据，帮助排查非管理员账号无法登录的问题。如发现问题，可使用下方按钮修复。"
        style={{ marginBottom: 16 }}
      />

      <Card
        title={<Space><DatabaseOutlined />本地存储诊断</Space>}
        extra={
          <Space>
            <Popconfirm title="确定清除所有认证缓存？清除后页面将刷新，所有数据将重置为种子数据。" onConfirm={handleClearCache}>
              <Button icon={<ClearOutlined />} danger>清除所有缓存</Button>
            </Popconfirm>
            <Popconfirm title="确定重置所有种子用户密码为默认值？" onConfirm={handleResetPasswords}>
              <Button icon={<ReloadOutlined />} loading={loading}>重置所有种子密码</Button>
            </Popconfirm>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Descriptions title={<Space><UserOutlined />当前会话</Space>} column={3} size="small" style={{ marginBottom: 16 }}>
          {sessionInfo.map((item) => (
            <Descriptions.Item key={item.label} label={item.label}>{item.children}</Descriptions.Item>
          ))}
        </Descriptions>

        <Divider />
        <Typography.Title level={5}>
          用户密码状态 ({hasPasswordCount}/{passwordList.length} 有密码)
        </Typography.Title>
        <ProTable<PasswordStatus>
          columns={passwordColumns}
          dataSource={passwordList}
          rowKey="username"
          search={false}
          options={false}
          pagination={false}
          size="small"
          toolBarRender={false}
        />
      </Card>

      <Card title={<Space><SafetyCertificateOutlined />登录验证结果</Space>}>
        {failCount > 0 && (
          <Alert
            type={okCount === 0 ? 'error' : 'warning'}
            showIcon
            message={`${okCount}/${verifyResults.length} 个用户可正常登录，${failCount} 个用户存在异常`}
            style={{ marginBottom: 16 }}
          />
        )}
        {failCount === 0 && (
          <Alert type="success" showIcon message={`全部 ${okCount} 个种子用户均可正常登录`} style={{ marginBottom: 16 }} />
        )}
        <ProTable<LoginVerifyResult>
          columns={verifyColumns}
          dataSource={verifyResults}
          rowKey="username"
          search={false}
          options={false}
          pagination={false}
          size="small"
          toolBarRender={false}
        />

        <Divider />
        <Typography.Title level={5}>种子用户及默认密码</Typography.Title>
        <Alert
          type="info"
          message={
            <Typography.Paragraph style={{ margin: 0 }}>
              所有种子账号默认密码均为 123456（admin123 为旧口径，当前后端会返回 401）<br />
              管理员账号：lizhanbo/123456、wangzixi/123456<br />
              业务负责人账号：aolei/123456、xuekun/123456、yuqinxia/123456<br />
              共享团队账号：jianglu/123456、yangchun/123456、maoyani/123456<br />
              数据录入账号：annazhen/123456<br />
              其余组长与组员账号：默认密码均为 123456
            </Typography.Paragraph>
          }
        />
      </Card>
    </PageContainer>
  );
};

export default LoginDebugPage;
