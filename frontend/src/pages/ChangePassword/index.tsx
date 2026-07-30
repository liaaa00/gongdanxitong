import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, App, Card, Typography, Space, Progress } from 'antd';
import { LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { Alert } from 'antd';
import { changePassword, logout as logoutApi } from '@/services/auth';
import { useUserStore } from '@/stores/userStore';

const { Text } = Typography;

interface PasswordStrength {
  score: number; // 0-4
  color: string;
  label: string;
}

function isStrong(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z\d]/.test(password)) score++;
  const clamped = Math.min(score, 4);
  const labels = ['很弱', '弱', '一般', '强', '很强'];
  const colors = ['#ff4d4f', '#faad14', '#52c41a', '#1677ff', '#722ed1'];
  return { score: clamped, color: colors[clamped], label: labels[clamped] };
}

function validatePasswordStrength(_: unknown, value: string) {
  if (!value) return Promise.reject(new Error('请输入新密码'));
  if (value.length < 8) return Promise.reject(new Error('密码长度至少 8 位'));
  if (value.length > 128) return Promise.reject(new Error('密码长度最多 128 位'));
  if (!/^(?=.*[a-zA-Z])(?=.*\d|.*[^a-zA-Z\d])/.test(value)) {
    return Promise.reject(new Error('密码需要包含字母和数字（或特殊字符）'));
  }
  return Promise.resolve();
}

const ChangePasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const {
    user,
    logout: storeLogout,
    mustChangePassword,
    isLoggedIn,
    loading: userLoading,
    fetchUser,
  } = useUserStore();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [strength, setStrength] = useState<PasswordStrength>({ score: 0, color: '#ff4d4f', label: '很弱' });
  const isForcedChange = mustChangePassword || Boolean(user?.must_change_password ?? user?.mustChangePassword ?? false);

  useEffect(() => {
    if (isLoggedIn && !user && !userLoading) {
      void fetchUser();
    }
  }, [fetchUser, isLoggedIn, user, userLoading]);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPassword(val);
    setStrength(isStrong(val));
  };

  const handleSubmit = async (values: { oldPassword: string; newPassword: string; confirm: string }) => {
    if (values.newPassword !== values.confirm) {
      message.error('两次输入的密码不一致');
      return;
    }
    if (values.oldPassword === values.newPassword) {
      message.error('新密码不能与旧密码相同');
      return;
    }
    if (strength.score < 2) {
      message.error('密码强度过低，请使用更复杂的密码');
      return;
    }

    setLoading(true);
    try {
      await changePassword({ oldPassword: values.oldPassword, newPassword: values.newPassword });
      try { await logoutApi(); } catch { /* ignore */ }
      storeLogout();
      message.success('密码修改成功，请重新登录');
      navigate('/login', { replace: true });
    } catch (e: any) {
      message.error(e?._friendlyMsg || e?.response?.data?.message || e?.message || '修改失败，请检查旧密码是否正确');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: 440, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}
        title={
          <Space>
            <SafetyOutlined style={{ color: '#1677ff' }} />
            <span>{isForcedChange ? '首次登录 — 请修改密码' : '修改密码'}</span>
          </Space>
        }>
        <Alert type={isForcedChange ? 'warning' : 'info'} showIcon style={{ marginBottom: 16 }}
          message={isForcedChange
            ? '检测到当前账号需要完成首次改密，请输入当前密码并设置新密码后继续使用系统。'
            : '为保障账号安全，请输入当前密码并设置新密码。修改成功后需要重新登录。'} />

        <Form layout="vertical" onFinish={handleSubmit}>
          <Form.Item label="当前密码" name="oldPassword"
            extra={isForcedChange ? '如管理员未单独告知，初始默认密码通常为 123456。' : undefined}
            rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>

          <Form.Item label="新密码" name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              { validator: validatePasswordStrength },
            ]}>
            <Input.Password prefix={<LockOutlined />} onChange={handlePasswordChange} placeholder="至少8位，含字母+数字或特殊字符" />
          </Form.Item>

          {password && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>密码强度</Text>
                <Text style={{ fontSize: 12, color: strength.color }}>{strength.label}</Text>
              </div>
              <Progress percent={strength.score * 25} showInfo={false}
                strokeColor={strength.color} trailColor="#f0f0f0" size="small" />
              <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 12, color: '#999' }}>
                <li style={{ color: password.length >= 8 ? '#52c41a' : '#999' }}>
                  {password.length >= 8 ? '✅' : '○'} 至少 8 位字符
                </li>
                <li style={{ color: /[a-zA-Z]/.test(password) && /\d/.test(password) ? '#52c41a' : '#999' }}>
                  {/[a-zA-Z]/.test(password) && /\d/.test(password) ? '✅' : '○'} 包含字母 + 数字
                </li>
                <li style={{ color: /[A-Z]/.test(password) && /[a-z]/.test(password) ? '#52c41a' : '#999' }}>
                  {/[A-Z]/.test(password) && /[a-z]/.test(password) ? '✅' : '○'} 大小写字母
                </li>
              </ul>
            </div>
          )}

          <Form.Item label="确认新密码" name="confirm"
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次密码不一致'));
                },
              }),
            ]}>
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large"
              icon={<SafetyOutlined />}>
              确认修改
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default ChangePasswordPage;
