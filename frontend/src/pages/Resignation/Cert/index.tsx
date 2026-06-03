import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import { Card, Descriptions, Tag, Button, Space, App, Empty } from 'antd';
import { getWorkOrder } from '@/services/workOrders';
import type { WorkOrderItem } from '@/services/workOrders';
import MaterialsUpload from '@/components/MaterialsUpload';

const ResignationCert: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [order, setOrder] = useState<WorkOrderItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getWorkOrder(id)
      .then(setOrder)
      .catch(() => message.error('加载工单失败'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <PageContainer loading />;
  if (!order) return <PageContainer header={{ title: '离职材料收集' }}><Empty description="工单不存在" /></PageContainer>;

  return (
    <PageContainer header={{ title: '离职材料收集', extra: [
      <Button key="back" onClick={() => navigate('/resignation/' + id)}>返回详情</Button>,
    ]}}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="工单编号"><Tag color="blue">{order.order_no}</Tag></Descriptions.Item>
            <Descriptions.Item label="员工">{order.employee_name}</Descriptions.Item>
            <Descriptions.Item label="客户">{order.customer_name}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color="blue">{order.status}</Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <MaterialsUpload workOrderId={order.id} bizPurpose="resignation_cert" />
      </Space>
    </PageContainer>
  );
};

export default ResignationCert;
