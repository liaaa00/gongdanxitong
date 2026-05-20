import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import { Card, Descriptions, Tag, Button, Space, App, Empty, Steps, Tabs } from 'antd';
import { ClockCircleOutlined, SyncOutlined, CheckCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import DynamicForm from '@/components/DynamicForm';
import type { FieldConfig } from '@/components/DynamicForm';
import { useFieldPermissions } from '@/hooks/useFieldPermissions';
import { getWorkOrder } from '@/services/workOrders';
import type { WorkOrderItem } from '@/services/workOrders';
import { getFields } from '@/services/fields';
import StagesTimeline from '@/components/StagesTimeline';

const STATUS_STEPS = [
  { title: '草稿', value: 'draft', icon: <ClockCircleOutlined /> },
  { title: '待派发', value: 'pending', icon: <SyncOutlined /> },
  { title: '处理中', value: 'processing', icon: <SyncOutlined spin /> },
  { title: '已完成', value: 'completed', icon: <CheckCircleOutlined /> },
];
const STATUS_EXTRA: Array<{ value: string; title: string; icon: React.ReactNode }> = [
  { title: '已退回', value: 'returned', icon: <ExclamationCircleOutlined /> },
  { title: '已撤回', value: 'withdrawn', icon: <CloseCircleOutlined /> },
];
const ALL_STATUSES = [...STATUS_STEPS, ...STATUS_EXTRA];

const RenewalDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { permissions } = useFieldPermissions('main');
  const [order, setOrder] = useState<WorkOrderItem | null>(null);
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([getWorkOrder(id), getFields('renewal')])
      .then(([orderData, fieldList]) => {
        setOrder(orderData);
        setFields(fieldList);
      })
      .catch(() => message.error('加载续签详情失败'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <PageContainer loading />;
  if (!order) return <PageContainer header={{ title: '续签详情' }}><Empty description="工单不存在" /></PageContainer>;

  const currentStep = ALL_STATUSES.findIndex((s) => s.value === order.status);
  const stepsItems = ALL_STATUSES.map((s, idx) => ({
    title: s.title, icon: s.icon,
    status: (idx <= currentStep && s.value !== 'returned' && s.value !== 'withdrawn'
      ? (idx === currentStep ? 'process' as const : 'finish' as const)
      : (s.value === order.status && (s.value === 'returned' || s.value === 'withdrawn')
        ? 'error' as const : 'wait' as const)),
  }));

  const statusColorMap: Record<string, string> = {
    completed: 'success', returned: 'warning', processing: 'processing', withdrawn: 'default',
  };

  return (
    <PageContainer header={{ title: '续签详情', extra: [<Button key="back" onClick={() => navigate('/renewal')}>返回列表</Button>] }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card>
          <Descriptions column={3} bordered size="small">
            <Descriptions.Item label="工单编号"><Tag color="blue">{order.order_no}</Tag></Descriptions.Item>
            <Descriptions.Item label="订单类型"><Tag>续签</Tag></Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusColorMap[order.status] || 'blue'}>{order.status === 'draft' ? '草稿' : order.status === 'pending' ? '待派发' : order.status === 'processing' ? '处理中' : order.status === 'completed' ? '已完成' : order.status === 'returned' ? '已退回' : '已撤回'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="员工">{order.employee_name}</Descriptions.Item>
            <Descriptions.Item label="客户">{order.customer_name}</Descriptions.Item>
            <Descriptions.Item label="创建人">{order.created_by}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{order.created_at}</Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="工单进度">
          <Steps current={currentStep < 0 ? 0 : currentStep} items={stepsItems} style={{ marginBottom: 8 }} />
        </Card>

        <Tabs items={[
          { key: 'info', label: '续签信息',
            children: (
              <Card>
                <DynamicForm fields={fields} fieldPermissions={permissions} orderType="renewal" initialValues={order.extra_data} readOnly />
              </Card>
            ),
          },
          { key: 'stages', label: '工单节点',
            children: <StagesTimeline workOrderId={order.id} />,
          },
        ]} />
      </Space>
    </PageContainer>
  );
};

export default RenewalDetail;
