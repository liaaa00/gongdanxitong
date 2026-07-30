import { useState, useEffect } from 'react';
import { Card, Timeline, Tag, App, Empty } from 'antd';
import {
  AuditOutlined, RollbackOutlined,
  FileDoneOutlined, InboxOutlined, SendOutlined, CheckCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';

interface StageItem {
  id: string;
  stage_code: string;
  stage_label: string;
  remark: string;
  payload: Record<string, unknown> | null;
  operator_name: string;
  happened_at: string;
}

const STAGE_ICONS: Record<string, React.ReactNode> = {
  material_review: <AuditOutlined />,
  returned_for_supplement: <RollbackOutlined />,
  materials_received: <InboxOutlined />,
  offline_submitted: <SendOutlined />,
  completed: <CheckCircleOutlined />,
  node_feedback: <SyncOutlined />,
};

const STAGE_COLORS: Record<string, string> = {
  material_review: 'blue',
  returned_for_supplement: 'orange',
  materials_received: 'cyan',
  offline_submitted: 'geekblue',
  completed: 'green',
  node_feedback: 'default',
};

const DEFAULT_STAGES: StageItem[] = [
  { id: 's-1', stage_code: 'material_review', stage_label: '材料审核中', remark: '后道接单，开始审核材料', payload: null, operator_name: '合同乙', happened_at: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: 's-2', stage_code: 'returned_for_supplement', stage_label: '退回业务员补充', remark: '身份证复印件不清晰，需重新上传', payload: { returned_material_ids: ['att-1'] }, operator_name: '合同乙', happened_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 's-3', stage_code: 'material_review', stage_label: '材料审核中', remark: '补充材料已收到，审核中', payload: null, operator_name: '合同乙', happened_at: new Date(Date.now() - 43200000).toISOString() },
];

interface StagesTimelineProps {
  workOrderId: string;
}

const StagesTimeline: React.FC<StagesTimelineProps> = ({ workOrderId }) => {
  const { message } = App.useApp();
  const [stages, setStages] = useState<StageItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      setStages(DEFAULT_STAGES);
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [workOrderId]);

  if (loading) return <Card loading />;

  return (
    <Card title="工单节点">
      {stages.length === 0 ? (
        <Empty description="暂无节点" />
      ) : (
        <Timeline
          items={stages.map((stage) => {
            const icon = STAGE_ICONS[stage.stage_code] || <SyncOutlined />;
            const color = STAGE_COLORS[stage.stage_code] || 'default';
            return {
              dot: <Tag color={color} style={{ margin: 0 }}>{icon}</Tag>,
              children: (
                <Card size="small" style={{ marginBottom: 4 }}
                  styles={{ body: { padding: '6px 10px' } } as any}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>
                      <Tag color={color} style={{ marginRight: 6 }}>{stage.stage_label}</Tag>
                    </span>
                    <span style={{ fontSize: 11, color: '#999' }}>
                      {new Date(stage.happened_at).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  {stage.remark && (
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{stage.remark}</div>
                  )}
                  <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>
                    操作人: {stage.operator_name}
                  </div>
                </Card>
              ),
            };
          })}
        />
      )}
    </Card>
  );
};

export default StagesTimeline;
