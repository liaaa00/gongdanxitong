import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageContainer, ProDescriptions } from '@ant-design/pro-components';
import { Button, Card, Space, Tag, App } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { OUT_OF_PROVINCE_ORDER_TYPE_OPTIONS } from '@/constants/outOfProvince';

// TODO: 等后端接口实现后补充service导入
// import { getOutOfProvinceOrder, type OutOfProvinceOrder } from '@/services/outOfProvinceOrders';

export default function OutOfProvinceOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  // TODO: 加载详情数据
  // useEffect(() => {
  //   if (!id) return;
  //   setLoading(true);
  //   getOutOfProvinceOrder(id)
  //     .then(setDetail)
  //     .catch(() => message.error('加载详情失败'))
  //     .finally(() => setLoading(false));
  // }, [id, message]);

  const orderTypeLabel = OUT_OF_PROVINCE_ORDER_TYPE_OPTIONS.find(
    (o) => o.value === detail?.orderType
  )?.label;

  return (
    <PageContainer
      title="省外派单详情"
      loading={loading}
      extra={[
        <Button key="back" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          返回列表
        </Button>,
      ]}
    >
      <Card title="基本信息" style={{ marginBottom: 16 }}>
        <ProDescriptions
          column={2}
          dataSource={detail}
          columns={[
            {
              title: '工单编号',
              dataIndex: 'orderNo',
              copyable: true,
            },
            {
              title: '增减员类型',
              dataIndex: 'orderType',
              render: () => orderTypeLabel ? <Tag>{orderTypeLabel}</Tag> : '-',
            },
            {
              title: '客户名称',
              dataIndex: 'customerName',
            },
            {
              title: '部门',
              dataIndex: 'departmentName',
            },
            {
              title: '省份',
              dataIndex: 'province',
            },
            {
              title: '状态',
              dataIndex: 'status',
              render: (_, record: any) => <Tag>{record?.status || 'draft'}</Tag>,
            },
            {
              title: '创建时间',
              dataIndex: 'createdAt',
              render: (_, record: any) =>
                record?.createdAt ? dayjs(record.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-',
            },
            {
              title: '更新时间',
              dataIndex: 'updatedAt',
              render: (_, record: any) =>
                record?.updatedAt ? dayjs(record.updatedAt).format('YYYY-MM-DD HH:mm:ss') : '-',
            },
          ]}
        />
      </Card>

      {/* TODO: 补充员工信息、附件、流转记录等卡片 */}
      <Card title="员工信息（待补充）" style={{ marginBottom: 16 }}>
        <div style={{ color: '#999', padding: 16 }}>待业务提供菜鸟模板字段清单后补充</div>
      </Card>
    </PageContainer>
  );
}
