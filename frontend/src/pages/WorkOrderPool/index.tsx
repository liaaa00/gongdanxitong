import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import { Table, Tabs, Button, Tag, Space, App, Popconfirm, Empty } from 'antd';
import { CheckOutlined, EyeOutlined } from '@ant-design/icons';
import { getPoolItems, claimPoolItem } from '@/services/workOrderPool';
import type { PoolItem } from '@/services/workOrderPool';
import { getModuleLabel } from '@/constants/modules';
import { getStatusText } from '@/constants/dictionaries';

const TABS = [
  { key: 'contract', label: '劳动合同新签池' },
  { key: 'onboarding_contact', label: '入职联系池' },
  { key: 'data_entry', label: '增员报岗录入池' },
  { key: 'social_insurance', label: '社保公积金增员池' },
];

const WorkOrderPool: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [activeTab, setActiveTab] = useState('contract');
  const [data, setData] = useState<PoolItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState<Record<string, boolean>>({});

  const load = async (moduleCode: string) => {
    setLoading(true);
    try {
      const res = await getPoolItems({ module_code: moduleCode, pageSize: 100 });
      setData(Array.isArray(res?.list) ? res.list : []);
    } catch { message.error('加载待认领工单失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(activeTab); }, [activeTab]);

  const handleClaim = async (item: PoolItem) => {
    setClaiming((prev) => ({ ...prev, [item.id]: true }));
    try {
      const res = await claimPoolItem(item.id);
      if (res.success) {
        message.success('认领成功');
        load(activeTab);
      } else {
        message.warning(res.message || '认领失败');
      }
    } catch { message.error('认领操作异常'); }
    finally { setClaiming((prev) => ({ ...prev, [item.id]: false })); }
  };

  return (
    <PageContainer header={{ title: '待认领工单', subTitle: '尚未指定具体办理人的子工单，按模块分类。点击认领后进入“我的待办”。' }}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={TABS.map((t) => ({
        key: t.key,
        label: t.label,
        children: (
          <Table
            rowKey="id"
            loading={loading}
            dataSource={data}
            locale={{ emptyText: <Empty description="当前池中无待认领工单" /> }}
            columns={[
              { title: '子工单号', dataIndex: 'order_no', width: 160 },
              { title: '员工', dataIndex: 'employee_name', width: 100 },
              { title: '客户', dataIndex: 'customer_name', width: 140 },
              { title: '模块', dataIndex: 'module_code', width: 140,
                render: (v: string) => <Tag>{getModuleLabel(v)}</Tag> },
              { title: '状态', dataIndex: 'status', width: 100,
                render: (v: string) => v === 'pending' ? <Tag color="blue">待认领</Tag> : <Tag color="processing">{getStatusText(v)}</Tag> },
              { title: '当前办理人', dataIndex: 'handler_name', width: 110, render: (v: string) => v || '—' },
              { title: '入池时间', dataIndex: 'dispatched_at', width: 160,
                render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
              { title: '操作', width: 160,
                render: (_, r) => (
                  <Space>
                    {r.status === 'pending' && (
                      <Popconfirm title="确认认领该工单？认领后将进入你的待办列表。"
                        onConfirm={() => handleClaim(r)}>
                        <Button type="primary" size="small" icon={<CheckOutlined />}
                          loading={claiming[r.id]}>认领</Button>
                      </Popconfirm>
                    )}
                    <Button size="small" icon={<EyeOutlined />}
                      onClick={() => navigate(`/my-dispatched/${r.id}`)}>查看</Button>
                  </Space>
                ),
              },
            ]}
            pagination={{ defaultPageSize: 20, showSizeChanger: true }}
          />
        ),
      }))} />
    </PageContainer>
  );
};

export default WorkOrderPool;
