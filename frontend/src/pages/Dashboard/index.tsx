import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { BellOutlined, CheckCircleOutlined, FileTextOutlined, RiseOutlined, ClockCircleOutlined, StopOutlined } from '@ant-design/icons';
import { Card, Col, Empty, Progress, Row, Segmented, Select, Space, Spin, Statistic, Tag, Tooltip, Typography } from 'antd';
import { canonicalRoleCodes, ROLE } from '@/constants/roles';
import { useUserStore } from '@/stores/userStore';
import {
  getDashboardCards,
  getLeaderTrend,
  getOrderTypeMatrix,
  type DashboardAudience,
  type DashboardCards,
  type DashboardOrderType,
  type DashboardScopeMode,
  type LeaderTrendBucket,
  type OrderTypeMatrixRow,
} from '@/services/dashboard';
import { getModuleConfigs } from '@/services/moduleConfigs';
import type { ModuleConfigItem } from '@/services/moduleConfigs';

const { Text } = Typography;

const EMPTY_CARDS: DashboardCards = {
  totalThisMonth: 0,
  processing: 0,
  completed: 0,
  voided: 0,
  myMessages: 0,
};

const TREND_ORDER_TYPES: Array<{ label: string; value: DashboardOrderType; color: string }> = [
  { label: '入职', value: 'onboarding', color: '#1677ff' },
  { label: '在职', value: 'renewal', color: '#722ed1' },
  { label: '离职', value: 'resignation', color: '#fa8c16' },
];

const BACKEND_ROLES = [
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.LABOR_CONTRACT_MEMBER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.SOCIAL_INSURANCE_SPECIALIST,
];

const BUSINESS_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_OWNER,
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.BUSINESS_GROUP_MEMBER,
];

const NOTIFICATION_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.BUSINESS_GROUP_MEMBER,
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.LABOR_CONTRACT_MEMBER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.SOCIAL_INSURANCE_SPECIALIST,
];

const CARD_BODY_STYLE: React.CSSProperties = { minHeight: 112 };

type DashboardRoleView = 'admin' | 'businessOwner' | 'businessLeader' | 'businessMember' | 'backend';

const DASHBOARD_ROLE_META: Record<DashboardRoleView, {
  title: string;
  subtitle: string;
  matrixTitle: string;
  cardTitles: {
    total: string;
    processing: string;
    completed: string;
    voided: string;
    messages: string;
  };
}> = {
  admin: {
    title: '全局运营看板',
    subtitle: '面向管理员展示全系统工单、后道办理和消息概览。',
    matrixTitle: '本月全系统节点总表',
    cardTitles: { total: '本月全量工单', processing: '全局处理中', completed: '全局已完成', voided: '全局已作废', messages: '待关注消息' },
  },
  businessOwner: {
    title: '业务负责人看板',
    subtitle: '聚焦团队整体发起量、办理结果和异常消息，不展示后道操作入口。',
    matrixTitle: '本月业务工单总表',
    cardTitles: { total: '本月业务工单', processing: '业务跟进中', completed: '已完成反馈', voided: '已作废', messages: '业务反馈消息' },
  },
  businessLeader: {
    title: '业务组长看板',
    subtitle: '默认关注本人/本组工单进展，便于跟进退回、撤回作废结果和字段变更反馈。',
    matrixTitle: '本月本组工单总表',
    cardTitles: { total: '本月工单', processing: '跟进中', completed: '已完成', voided: '已作废', messages: '待查看消息' },
  },
  businessMember: {
    title: '业务员看板',
    subtitle: '展示本人发起工单的进展和后道反馈，减少与团队管理数据混在一起。',
    matrixTitle: '本月本人工单总表',
    cardTitles: { total: '本人本月工单', processing: '处理中', completed: '已完成', voided: '已作废', messages: '我的消息' },
  },
  backend: {
    title: '后道办理看板',
    subtitle: '聚焦已派发到后道节点的待处理、完成和异常消息。',
    matrixTitle: '本月办理节点总表',
    cardTitles: { total: '本月派发节点', processing: '待处理/处理中', completed: '已办结', voided: '已作废', messages: '待处理消息' },
  },
};

type DashboardMatrixTreeRow = OrderTypeMatrixRow & {
  rowKey: string;
  routePath: string;
  isGroup?: boolean;
  children?: DashboardMatrixTreeRow[];
};

const DASHBOARD_MATRIX_GROUPS: Array<{
  key: string;
  label: string;
  orderType: DashboardOrderType;
  routePath: string;
  modules: Array<{ moduleCode: string; label: string; routePath: string }>;
}> = [
  {
    key: 'onboarding',
    label: '入职管理',
    orderType: 'onboarding',
    routePath: '/work-orders?orderType=onboarding',
    modules: [
      { moduleCode: 'data_entry', label: '数据录入', routePath: '/onboarding/data_entry' },
      { moduleCode: 'social_insurance', label: '社保公积金办理', routePath: '/onboarding/social_insurance' },
      { moduleCode: 'onboarding_contact', label: '入职联系', routePath: '/onboarding/onboarding_contact' },
      { moduleCode: 'contract', label: '劳动合同签订', routePath: '/onboarding/contract' },
    ],
  },
  {
    key: 'in_service',
    label: '在职管理',
    orderType: 'renewal',
    routePath: '/renewal',
    modules: [
      { moduleCode: 'renewal_contract', label: '续签合同', routePath: '/onboarding/renewal_contract' },
      { moduleCode: 'benefit_apply', label: '待遇申报', routePath: '/onboarding/benefit_apply' },
    ],
  },
  {
    key: 'resignation',
    label: '离职管理',
    orderType: 'resignation',
    routePath: '/resignation',
    modules: [
      { moduleCode: 'resignation_contact', label: '离职联系', routePath: '/onboarding/resignation_contact' },
      { moduleCode: 'resignation_cert', label: '离职证明', routePath: '/onboarding/resignation_cert' },
      { moduleCode: 'data_entry_resign', label: '社保停保', routePath: '/onboarding/data_entry_resign' },
    ],
  },
];

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function calculateCompletionRate(completed: number, total: number, voided: number): number {
  const denominator = Math.max(0, total - Math.max(0, voided || 0));
  return denominator > 0 ? clampRate((Math.max(0, completed || 0) / denominator) * 100) : 0;
}

function normalizeStatsTotal<T extends Pick<OrderTypeMatrixRow, 'total' | 'processing' | 'completed' | 'voided' | 'completionRate'>>(
  row: T,
  options: { preserveCompletionRate?: boolean } = {},
): T {
  const completed = Math.max(0, row.completed || 0);
  const voided = Math.max(0, row.voided || 0);
  const rawTotal = Math.max(0, row.total || 0);
  const rawProcessing = Math.max(0, row.processing || 0);
  const processing = Math.max(rawProcessing, rawTotal - completed - voided);
  const total = processing + completed + voided;
  return {
    ...row,
    total,
    processing,
    completed,
    voided,
    completionRate: options.preserveCompletionRate
      ? clampRate(row.completionRate)
      : calculateCompletionRate(completed, total, voided),
  };
}

function summarizeMatrixRows(rows: Array<Pick<OrderTypeMatrixRow, 'total' | 'processing' | 'completed' | 'voided'>>): Pick<OrderTypeMatrixRow, 'total' | 'processing' | 'completed' | 'voided' | 'completionRate'> {
  const normalizedRows = rows.map((row) => normalizeStatsTotal({ ...row, completionRate: 0 }));
  const processing = normalizedRows.reduce((sum, row) => sum + (row.processing || 0), 0);
  const completed = normalizedRows.reduce((sum, row) => sum + (row.completed || 0), 0);
  const voided = normalizedRows.reduce((sum, row) => sum + (row.voided || 0), 0);
  const total = processing + completed + voided;
  return {
    total,
    processing,
    completed,
    voided,
    completionRate: calculateCompletionRate(completed, total, voided),
  };
}

function flattenMatrixRows(rows: DashboardMatrixTreeRow[]): DashboardMatrixTreeRow[] {
  return rows.flatMap((row) => [row, ...(row.children ? flattenMatrixRows(row.children) : [])]);
}

function buildMatrixTreeRows(rows: OrderTypeMatrixRow[]): DashboardMatrixTreeRow[] {
  const rowsByModule = new Map<string, OrderTypeMatrixRow>();
  rows.forEach((row) => {
    if (row.moduleCode) rowsByModule.set(row.moduleCode, row);
  });

  return DASHBOARD_MATRIX_GROUPS.map((group) => {
    const children = group.modules.map<DashboardMatrixTreeRow>((module) => {
      const matched = rowsByModule.get(module.moduleCode);
      return normalizeStatsTotal({
        rowKey: `${group.key}:${module.moduleCode}`,
        orderType: group.orderType,
        moduleCode: module.moduleCode,
        dimension: 'node',
        label: module.label,
        routePath: module.routePath,
        total: matched?.total || 0,
        processing: matched?.processing || 0,
        completed: matched?.completed || 0,
        voided: matched?.voided || 0,
        completionRate: clampRate(matched?.completionRate || 0),
      }, { preserveCompletionRate: true });
    });
    const summary = summarizeMatrixRows(children);
    return {
      rowKey: group.key,
      orderType: group.orderType,
      dimension: 'orderType',
      label: group.label,
      routePath: group.routePath,
      isGroup: true,
      ...summary,
      children,
    };
  });
}


function buildTrendPolyline(buckets: LeaderTrendBucket[], width: number, height: number): string {
  if (!buckets.length) return '';
  const maxRate = Math.max(100, ...buckets.map((item) => clampRate(item.rate)));
  const left = 16;
  const right = width - 16;
  const top = 12;
  const bottom = height - 22;
  const span = Math.max(buckets.length - 1, 1);

  return buckets.map((item, index) => {
    const x = left + ((right - left) * index) / span;
    const y = bottom - ((bottom - top) * clampRate(item.rate)) / maxRate;
    return `${x},${y}`;
  }).join(' ');
}

interface MiniTrendLineProps {
  title: string;
  color: string;
  buckets: LeaderTrendBucket[];
}

const MiniTrendLine: React.FC<MiniTrendLineProps> = ({ title, color, buckets }) => {
  const width = 320;
  const height = 128;
  const points = buildTrendPolyline(buckets, width, height);
  const latest = buckets[buckets.length - 1];

  return (
    <Card size="small" title={title} extra={<Tag color={color}>{clampRate(latest?.rate || 0)}%</Tag>}>
      {buckets.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无趋势数据" />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height }} role="img" aria-label={`${title}月办结完成率趋势`}>
            <line x1="16" y1="106" x2="304" y2="106" stroke="#f0f0f0" />
            <line x1="16" y1="59" x2="304" y2="59" stroke="#f0f0f0" strokeDasharray="4 4" />
            <line x1="16" y1="12" x2="304" y2="12" stroke="#f0f0f0" strokeDasharray="4 4" />
            {points && <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
            {buckets.map((item, index) => {
              const x = 16 + ((width - 32) * index) / Math.max(buckets.length - 1, 1);
              const y = 106 - ((106 - 12) * clampRate(item.rate)) / 100;
              const showLabel = index === 0 || index === buckets.length - 1 || index % 3 === 0;
              return (
                <g key={`${item.month}-${index}`}>
                  <circle cx={x} cy={y} r="3.5" fill={color} />
                  {showLabel && <text x={x} y="124" fill="#8c8c8c" fontSize="10" textAnchor="middle">{item.month}</text>}
                </g>
              );
            })}
          </svg>
          <Row gutter={12}>
            <Col span={8}><Statistic title="最近总量" value={latest?.total || 0} /></Col>
            <Col span={8}><Statistic title="已办结" value={latest?.completed || 0} valueStyle={{ color: '#52c41a' }} /></Col>
            <Col span={8}><Statistic title="完成率" value={clampRate(latest?.rate || 0)} suffix="%" precision={1} /></Col>
          </Row>
        </Space>
      )}
    </Card>
  );
};

interface LeaderTrendChartProps {
  visible: boolean;
  moduleOptions: ModuleConfigItem[];
  scope?: DashboardScopeMode;
}

const LeaderTrendChart: React.FC<LeaderTrendChartProps> = ({ visible, moduleOptions, scope }) => {
  const [moduleCode, setModuleCode] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [trendMap, setTrendMap] = useState<Record<DashboardOrderType, LeaderTrendBucket[]>>({
    onboarding: [], renewal: [], resignation: [], benefit: [],
  });

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let mounted = true;
    setLoading(true);
    Promise.all(TREND_ORDER_TYPES.map((item) => getLeaderTrend(item.value, moduleCode, scope, controller.signal)))
      .then((results) => {
        if (!mounted) return;
        setTrendMap((prev) => ({
          ...prev,
          ...Object.fromEntries(results.map((result) => [result.orderType, result.buckets || []])),
        }));
      })
      .catch(() => {
        if (mounted) setTrendMap({ onboarding: [], renewal: [], resignation: [], benefit: [] });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [moduleCode, scope, visible]);

  if (!visible) return null;

  return (
    <Card
      title={<Space><RiseOutlined />负责人月办结完成率趋势</Space>}
      extra={(
        <Select
          size="small"
          allowClear
          placeholder="全部节点"
          style={{ width: 180 }}
          value={moduleCode}
          onChange={setModuleCode}
          options={moduleOptions.map((item) => ({
            value: item.module_code,
            label: item.module_name,
            title: `${item.module_name}（${item.module_code}）`,
          }))}
        />
      )}
    >
      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          {TREND_ORDER_TYPES.map((item) => (
            <Col key={item.value} xs={24} lg={8}>
              <MiniTrendLine title={item.label} color={item.color} buckets={trendMap[item.value] || []} />
            </Col>
          ))}
        </Row>
      </Spin>
    </Card>
  );
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useUserStore();
  const [cards, setCards] = useState<DashboardCards>(EMPTY_CARDS);
  const [matrixRows, setMatrixRows] = useState<DashboardMatrixTreeRow[]>([]);
  const [selectedMatrixRow, setSelectedMatrixRow] = useState<DashboardMatrixTreeRow | null>(null);
  const [moduleOptions, setModuleOptions] = useState<ModuleConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scopeMode, setScopeMode] = useState<DashboardScopeMode>('mine');

  const roles = useMemo(() => canonicalRoleCodes(user?.roles), [user?.roles]);
  const canViewLeaderTrend = roles.includes(ROLE.ADMIN) || roles.includes(ROLE.BUSINESS_OWNER);
  const canViewNotifications = roles.some((role) => NOTIFICATION_ROLES.includes(role as typeof NOTIFICATION_ROLES[number]));
  const roleView = useMemo<DashboardRoleView>(() => {
    const hasBackendRole = roles.some((role) => BACKEND_ROLES.includes(role as typeof BACKEND_ROLES[number]));
    const hasBusinessRole = roles.some((role) => BUSINESS_ROLES.includes(role as typeof BUSINESS_ROLES[number]));
    if (roles.includes(ROLE.ADMIN)) return 'admin';
    if (roles.includes(ROLE.BUSINESS_OWNER)) return 'businessOwner';
    if (roles.includes(ROLE.BUSINESS_GROUP_LEADER)) return 'businessLeader';
    if (roles.includes(ROLE.BUSINESS_GROUP_MEMBER)) return 'businessMember';
    if (hasBackendRole && !hasBusinessRole) return 'backend';
    return hasBackendRole ? 'backend' : 'businessMember';
  }, [roles]);
  const roleMeta = DASHBOARD_ROLE_META[roleView];
  const dashboardAudience = useMemo<DashboardAudience>(() => {
    const hasBackendRole = roles.some((role) => BACKEND_ROLES.includes(role as typeof BACKEND_ROLES[number]));
    const hasBusinessRole = roles.some((role) => BUSINESS_ROLES.includes(role as typeof BUSINESS_ROLES[number]));
    return hasBackendRole && !hasBusinessRole ? 'backend' : 'business';
  }, [roles]);
  const canSwitchDashboardScope = dashboardAudience === 'business' && (
    roles.includes(ROLE.ADMIN)
    || roles.includes(ROLE.BUSINESS_GROUP_LEADER)
    || roles.includes(ROLE.BUSINESS_OWNER)
    || (user?.permissions || []).some((permission) => ['work_order.view_team', 'work_order.view_all', 'data_scope.team', 'data_scope.all'].includes(permission))
  );
  const effectiveScope: DashboardScopeMode | undefined = canSwitchDashboardScope ? scopeMode : undefined;
  const normalizedCards = useMemo(() => normalizeStatsTotal({
    total: cards.totalThisMonth,
    processing: cards.processing,
    completed: cards.completed,
    voided: cards.voided || 0,
    completionRate: 0,
  }), [cards.completed, cards.processing, cards.totalThisMonth, cards.voided]);

  // 仪表盘总表按实际子工单模块展示：入职主工单提交后会拆成数据录入、社保公积金、入职联系、劳动合同签订等子工单。
  const matrixDimension = 'node';
  const matrixTitle = roleMeta.matrixTitle;

  const handleMatrixRowClick = (record: DashboardMatrixTreeRow) => {
    setSelectedMatrixRow(record);
  };

  const columns = useMemo<ProColumns<DashboardMatrixTreeRow>[]>(() => [
    {
      title: '模块',
      dataIndex: 'label',
      key: 'label',
      render: (_, record) => (
        <Tooltip title={record.moduleCode ? `${record.label}（${record.moduleCode}）` : `${record.label}整体汇总`}>
          <Text strong={record.isGroup} style={{ color: record.isGroup ? '#1677ff' : undefined }}>
            {record.label}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '本月工单总数',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      sorter: (a, b) => a.total - b.total,
    },
    {
      title: '未办结',
      dataIndex: 'processing',
      key: 'processing',
      align: 'right',
      render: (_, record) => <Text type="secondary">{record.processing}</Text>,
      sorter: (a, b) => a.processing - b.processing,
    },
    {
      title: '已完成',
      dataIndex: 'completed',
      key: 'completed',
      align: 'right',
      render: (_, record) => <Text type="success">{record.completed}</Text>,
      sorter: (a, b) => a.completed - b.completed,
    },
    {
      title: '已作废',
      dataIndex: 'voided',
      key: 'voided',
      align: 'right',
      render: (_, record) => <Text type="secondary">{record.voided || 0}</Text>,
      sorter: (a, b) => (a.voided || 0) - (b.voided || 0),
    },
    {
      title: '完成率',
      dataIndex: 'completionRate',
      key: 'completionRate',
      width: 220,
      render: (_, record) => (
        <Progress
          percent={clampRate(record.completionRate)}
          size="small"
          status={record.completionRate >= 100 ? 'success' : 'active'}
        />
      ),
      sorter: (a, b) => a.completionRate - b.completionRate,
    },
  ], []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.allSettled([
      getDashboardCards(dashboardAudience, effectiveScope),
      getOrderTypeMatrix({ dimension: matrixDimension, audience: dashboardAudience, scope: effectiveScope }),
      canViewLeaderTrend ? getModuleConfigs({ isActive: true }) : Promise.resolve([]),
    ])
      .then(([cardResult, matrixResult, moduleResult]) => {
        if (!mounted) return;
        setCards(cardResult.status === 'fulfilled' ? cardResult.value : EMPTY_CARDS);
        const nextMatrixRows = matrixResult.status === 'fulfilled' ? buildMatrixTreeRows(matrixResult.value.rows || []) : buildMatrixTreeRows([]);
        setMatrixRows(nextMatrixRows);
        setSelectedMatrixRow((prev) => {
          const flatRows = flattenMatrixRows(nextMatrixRows);
          return flatRows.find((row) => row.rowKey === prev?.rowKey) || flatRows[0] || null;
        });
        if (moduleResult.status === 'fulfilled') {
          setModuleOptions(moduleResult.value.filter((item) => item.module_type === 'sub' || item.moduleType === 'sub'));
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [dashboardAudience, effectiveScope, matrixDimension, canViewLeaderTrend]);

  return (
    <PageContainer header={{
      title: roleMeta.title,
      subTitle: roleMeta.subtitle,
      extra: canSwitchDashboardScope ? [
        <Space key="scope-switch" align="center">
          <Text type="secondary">数据范围</Text>
          <Segmented<DashboardScopeMode>
            size="small"
            value={scopeMode}
            onChange={setScopeMode}
            options={[
              { label: '本人数据', value: 'mine' },
              { label: '团队数据', value: 'team' },
            ]}
          />
        </Space>,
      ] : undefined,
    }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
          <Card loading={loading} styles={{ body: CARD_BODY_STYLE }}>
            <Statistic title={roleMeta.cardTitles.total} value={normalizedCards.total} prefix={<FileTextOutlined />} />
          </Card>
          <Card loading={loading} styles={{ body: CARD_BODY_STYLE }}>
            <Statistic title={roleMeta.cardTitles.processing} value={normalizedCards.processing} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#1677ff' }} />
          </Card>
          <Card loading={loading} styles={{ body: CARD_BODY_STYLE }}>
            <Statistic title={roleMeta.cardTitles.completed} value={normalizedCards.completed} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} />
          </Card>
          <Card loading={loading} styles={{ body: CARD_BODY_STYLE }}>
            <Statistic title={roleMeta.cardTitles.voided} value={normalizedCards.voided || 0} prefix={<StopOutlined />} valueStyle={{ color: '#8c8c8c' }} />
          </Card>
          {canViewNotifications && (
            <Card
              hoverable
              loading={loading}
              styles={{ body: CARD_BODY_STYLE }}
              onClick={() => navigate('/notifications')}
            >
              <Statistic title={roleMeta.cardTitles.messages} value={cards.myMessages} prefix={<BellOutlined />} valueStyle={{ color: '#faad14' }} />
            </Card>
          )}
        </div>

        <ProTable<DashboardMatrixTreeRow>
          rowKey="rowKey"
          headerTitle={matrixTitle}
          columns={columns}
          dataSource={matrixRows}
          loading={loading}
          search={false}
          pagination={false}
          options={false}
          toolBarRender={false}
          dateFormatter="string"
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无本月工单统计" /> }}
          onRow={(record) => ({
            onClick: () => handleMatrixRowClick(record),
            style: {
              cursor: 'pointer',
              background: selectedMatrixRow?.rowKey === record.rowKey ? '#f0f7ff' : undefined,
            },
          })}
        />

        {selectedMatrixRow && (
          <Card
            title={(
              <Space>
                <span>统计明细</span>
                <Tag color={selectedMatrixRow.isGroup ? 'blue' : 'purple'}>{selectedMatrixRow.isGroup ? '整体分类' : '明细节点'}</Tag>
              </Space>
            )}
            extra={<Text type="secondary">点击上方大类或子类可在本页切换查看</Text>}
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Row gutter={[16, 16]}>
                <Col xs={24} md={6}>
                  <Statistic title="当前查看" value={selectedMatrixRow.label} />
                </Col>
                <Col xs={8} md={4}>
                  <Statistic title="总数" value={selectedMatrixRow.total} />
                </Col>
                <Col xs={8} md={4}>
                  <Statistic title="未办结" value={selectedMatrixRow.processing} valueStyle={{ color: '#1677ff' }} />
                </Col>
                <Col xs={8} md={4}>
                  <Statistic title="已完成" value={selectedMatrixRow.completed} valueStyle={{ color: '#52c41a' }} />
                </Col>
                <Col xs={8} md={4}>
                  <Statistic title="已作废" value={selectedMatrixRow.voided || 0} valueStyle={{ color: '#8c8c8c' }} />
                </Col>
                <Col xs={24} md={6}>
                  <Text type="secondary">完成率</Text>
                  <Progress percent={clampRate(selectedMatrixRow.completionRate)} size="small" />
                </Col>
              </Row>

              {selectedMatrixRow.children && selectedMatrixRow.children.length > 0 && (
                <Row gutter={[12, 12]}>
                  {selectedMatrixRow.children.map((child) => (
                    <Col key={child.rowKey} xs={24} sm={12} lg={6}>
                      <Card size="small" hoverable onClick={() => setSelectedMatrixRow(child)}>
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <Text strong>{child.label}</Text>
                          <Text type="secondary">总数 {child.total} ｜ 未办结 {child.processing} ｜ 已完成 {child.completed} ｜ 已作废 {child.voided || 0}</Text>
                          <Progress percent={clampRate(child.completionRate)} size="small" />
                        </Space>
                      </Card>
                    </Col>
                  ))}
                </Row>
              )}
            </Space>
          </Card>
        )}

        <LeaderTrendChart visible={canViewLeaderTrend} moduleOptions={moduleOptions} scope={effectiveScope} />
      </Space>
    </PageContainer>
  );
};

export default Dashboard;
