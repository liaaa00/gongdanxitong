import { useSearchParams } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import { Alert, Tabs } from 'antd';
import AdminCustomers from '@/pages/Admin/Customers';
import CustomerRules from '@/pages/CustomerRules';
import CustomerPortalAccounts from './CustomerPortalAccounts';
import CustomerPortalBusiness from './CustomerPortalBusiness';
import PortalNotifications from './PortalNotifications';
import PortalMonitor from './PortalMonitor';
import { useAuth } from '@/hooks/useAuth';

const VALID_TABS = new Set(['customers', 'accounts', 'rules', 'business', 'notifications', 'monitor']);

const CustomerConfig: React.FC = () => {
  const {hasRole}=useAuth();
  const isAdmin=hasRole('admin');
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'customers';
  const activeKey = VALID_TABS.has(requestedTab) && (isAdmin || !['notifications','monitor'].includes(requestedTab)) ? requestedTab : 'customers';
  const customerId = searchParams.get('customerId');

  if (requestedTab === 'intake-review') {
    const query = customerId ? `?customerId=${encodeURIComponent(customerId)}` : '';
    return <Navigate to={`/portal-intake-review${query}`} replace />;
  }

  return (
    <PageContainer title="客户门户配置" subTitle="统一维护客户资料、门户登录账号、办理规则与通知邮箱">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="所有业务员可维护全部客户"
        description="门户账号按“增减员”和“薪资”两项权限授权；业务通知邮箱在“办理规则与通知”中配置，数据始终按客户 UUID 隔离。"
      />
      <Tabs
        activeKey={activeKey}
        destroyInactiveTabPane={false}
        onChange={(tab) => setSearchParams(customerId ? { tab, customerId } : { tab })}
        items={[
          { key: 'customers', label: '客户资料', children: <AdminCustomers embedded /> },
          { key: 'accounts', label: '门户账号', children: <CustomerPortalAccounts /> },
          { key: 'rules', label: '办理规则与通知', children: <CustomerRules embedded /> },
          { key: 'business', label: '业务受理与邮件', children: <CustomerPortalBusiness /> },
          ...(isAdmin ? [
            { key:'notifications',label:'自动通知与工作日历',children:<PortalNotifications/> },
            { key:'monitor',label:'门户全过程监控',children:<PortalMonitor/> },
          ] : []),
        ]}
      />
    </PageContainer>
  );
};

export default CustomerConfig;
