import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import { Card, Descriptions, Tag, Button, Space, App, Empty, Steps, Tabs, Timeline, Alert, Row, Col } from 'antd';
import {
  ClockCircleOutlined, SyncOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
  CloseCircleOutlined, AuditOutlined, RollbackOutlined, FileDoneOutlined,
  FileProtectOutlined, InboxOutlined, SendOutlined,
} from '@ant-design/icons';
import DynamicForm from '@/components/DynamicForm';
import type { FieldConfig } from '@/components/DynamicForm';
import { useFieldPermissions } from '@/hooks/useFieldPermissions';
import { getWorkOrder } from '@/services/workOrders';
import type { WorkOrderItem } from '@/services/workOrders';
import { getFields } from '@/services/fields';
import MaterialsUpload from '@/components/MaterialsUpload';
import StagesTimeline from '@/components/StagesTimeline';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';

const STATUS_STEPS = [
  { title: '草稿', value: 'draft', icon: <ClockCircleOutlined /> },
  { title: '待派发', value: 'pending', icon: <SyncOutlined /> },
  { title: '处理中', value: 'processing', icon: <SyncOutlined spin /> },
  { title: '已完成', value: 'completed', icon: <CheckCircleOutlined /> },
];
const STATUS_EXTRA: Array<{ value: string; title: string; icon: React.ReactNode }> = [
  { title: getStatusText('returned'), value: 'returned', icon: <ExclamationCircleOutlined /> },
  { title: getStatusText('withdraw_pending'), value: 'withdraw_pending', icon: <ExclamationCircleOutlined /> },
  { title: getStatusText('void_pending'), value: 'void_pending', icon: <ExclamationCircleOutlined /> },
  { title: getStatusText('withdrawn'), value: 'withdrawn', icon: <CloseCircleOutlined /> },
  { title: getStatusText('void'), value: 'void', icon: <CloseCircleOutlined /> },
];
const ALL_STATUSES = [...STATUS_STEPS, ...STATUS_EXTRA];

const BENEFIT_STAGE_MAP: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  material_review: { label: '材料审核中', icon: <AuditOutlined />, color: 'blue' },
  returned_for_supplement: { label: '退回补充', icon: <RollbackOutlined />, color: 'orange' },
  stamp_requested: { label: '用印申请', icon: <FileProtectOutlined />, color: 'purple' },
  stamp_confirmed: { label: '用印完成', icon: <FileDoneOutlined />, color: 'green' },
  materials_received: { label: '材料收齐', icon: <InboxOutlined />, color: 'cyan' },
  offline_submitted: { label: '线下申报', icon: <SendOutlined />, color: 'geekblue' },
  node_feedback: { label: '节点反馈', icon: <SyncOutlined />, color: 'default' },
  completed: { label: '申报完结', icon: <CheckCircleOutlined />, color: 'success' },
};

const BenefitDetail: React.FC = () => {
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
    Promise.all([getWorkOrder(id), getFields('benefit')])
      .then(([orderData, fieldList]) => {
        setOrder(orderData);
        setFields(fieldList);
      })
      .catch(() => message.error('加载待遇申报详情失败'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <PageContainer loading />;
  if (!order) return <PageContainer header={{ title: '待遇申报详情' }}><Empty description="工单不存在" /></PageContainer>;

  const currentStep = ALL_STATUSES.findIndex((s) => s.value === order.status);
  const nonLinearStatuses = ['returned', 'withdraw_pending', 'void_pending', 'withdrawn', 'void'];
  const stepsItems = ALL_STATUSES.map((s, idx) => ({
    title: s.title, icon: s.icon,
    status: (idx <= currentStep && !nonLinearStatuses.includes(s.value)
      ? (idx === currentStep ? 'process' as const : 'finish' as const)
      : (s.value === order.status && nonLinearStatuses.includes(s.value)
        ? 'error' as const : 'wait' as const)),
  }));

  return (
    <PageContainer header={{ title: '待遇申报详情', extra: [<Button key="back" onClick={() => navigate('/benefit')}>返回列表</Button>] }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card>
          <Descriptions column={3} bordered size="small">
            <Descriptions.Item label="工单编号"><Tag color="blue">{order.order_no}</Tag></Descriptions.Item>
            <Descriptions.Item label="订单类型"><Tag>待遇申报</Tag></Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={getStatusColor(order.status)}>{getStatusText(order.status)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="员工">{order.employee_name}</Descriptions.Item>
            <Descriptions.Item label="客户">{order.customer_name}</Descriptions.Item>
            <Descriptions.Item label="创建人">{order.created_by}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{order.created_at}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{order.updated_at}</Descriptions.Item>
            <Descriptions.Item label="申报类型">{order.extra_data?.benefit_type as string || '—'}</Descriptions.Item>
          </Descriptions>
        </Card>

        {order.status === 'returned' && (order.extra_data?.benefit_return_reason as string) && (
          <Alert
            message="退回原因"
            description={order.extra_data?.benefit_return_reason as string}
            type="warning"
            showIcon
            icon={<RollbackOutlined />}
          />
        )}

        <Card title="工单进度">
          <Steps current={currentStep < 0 ? 0 : currentStep} items={stepsItems} style={{ marginBottom: 12 }} />
        </Card>

        <Card title="待遇申报节点（6 节点状态条）">
          <Row gutter={[8, 8]}>
            {Object.entries(BENEFIT_STAGE_MAP).map(([code, info]) => (
              <Col key={code} xs={24} sm={12} md={6} lg={3}>
                <Card size="small" hoverable style={{ textAlign: 'center' }}
                  styles={{ body: { padding: '8px 4px' } }}>
                  <div style={{ fontSize: 18, color: info.color }}>{info.icon}</div>
                  <div style={{ fontSize: 11, marginTop: 4, color: '#666' }}>{info.label}</div>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>

        <Tabs items={[
          { key: 'info', label: '申报信息',
            children: (
              <Card>
                <DynamicForm fields={fields} fieldPermissions={permissions} orderType="benefit" initialValues={order.extra_data} readOnly />
              </Card>
            ),
          },
          { key: 'materials', label: '材料管理',
            children: <MaterialsUpload workOrderId={order.id} bizPurpose="benefit_material" />,
          },
          { key: 'stages', label: '工单节点',
            children: <StagesTimeline workOrderId={order.id} />,
          },
        ]} />
      </Space>
    </PageContainer>
  );
};

export default BenefitDetail;
