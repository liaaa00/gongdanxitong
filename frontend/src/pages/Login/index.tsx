import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm, ProFormText } from '@ant-design/pro-components';
import { App, theme } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { login } from '@/services/auth';
import { useUserStore } from '@/stores/userStore';
import type { UserInfo } from '@/services/types';
import {
  BUSINESS_SCOPE,
  getBusinessScopeLandingPath,
  writeBusinessScope,
  type BusinessScope,
} from '@/utils/businessScope';

interface LoginPageProps {
  businessScope?: BusinessScope;
}

const LoginPage: React.FC<LoginPageProps> = ({ businessScope = BUSINESS_SCOPE.BEILUN }) => {
  const navigate = useNavigate();
  const { setToken, setUser, setMustChangePassword } = useUserStore();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  const { token: themeToken } = theme.useToken();

  const handleSubmit = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await login({ ...values, businessScope });
      const accessToken = res.accessToken || res.token;
      if (!accessToken) {
        throw new Error('登录成功但未返回访问令牌');
      }
      setToken(accessToken, res.refreshToken);
      const mustChangePassword = res.must_change_password ?? res.mustChangePassword ?? res.user.must_change_password ?? res.user.mustChangePassword ?? false;
      const userWithPermissions: UserInfo = {
        ...res.user,
        roles: res.roles || res.user.roles || [],
        permissions: res.permissions || res.user.permissions || [],
        must_change_password: mustChangePassword,
        mustChangePassword,
      };
      setUser(userWithPermissions);
      setMustChangePassword(Boolean(mustChangePassword));
      const accountScope = userWithPermissions.business_scope
        ?? userWithPermissions.businessScope
        ?? businessScope;
      writeBusinessScope(accountScope);
      message.success('登录成功');

      if (mustChangePassword) {
        navigate('/change-password', { replace: true });
      } else {
        navigate(getBusinessScopeLandingPath(accountScope), { replace: true });
      }
    } catch (error: unknown) {
      const err = error as Error;
      message.error(err?.message || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: `linear-gradient(135deg, ${themeToken.colorPrimary}15, ${themeToken.colorPrimaryBg})`,
      }}
    >
      <div style={{ width: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, color: themeToken.colorPrimary, margin: 0 }}>
            {businessScope === BUSINESS_SCOPE.OUT_OF_PROVINCE ? '浙江自签工单系统' : '工单管理系统'}
          </h1>
          <p style={{ color: themeToken.colorTextSecondary, marginTop: 8 }}>
            {businessScope === BUSINESS_SCOPE.OUT_OF_PROVINCE ? '省外社保公积金业务平台' : '北仑员工生命周期业务平台'}
          </p>
        </div>
        <LoginForm
          onFinish={handleSubmit}
          submitter={{
            searchConfig: { submitText: '登录' },
            submitButtonProps: { loading, block: true, size: 'large' },
          }}
        >
          <ProFormText
            name="username"
            fieldProps={{
              size: 'large',
              prefix: <UserOutlined />,
              placeholder: '用户名',
            }}
            rules={[{ required: true, message: '请输入用户名' }]}
          />
          <ProFormText.Password
            name="password"
            fieldProps={{
              size: 'large',
              prefix: <LockOutlined />,
              placeholder: '密码',
            }}
            rules={[{ required: true, message: '请输入密码' }]}
          />
        </LoginForm>
      </div>
    </div>
  );
};

export default LoginPage;
