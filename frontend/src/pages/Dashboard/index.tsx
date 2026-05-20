import { useState, useEffect } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import {
  Card, Row, Col, Statistic, Table, Tag, Progress, Space, Select, Empty,
  Segmented,
} from 'antd';
import {
  FileTextOutlined, CheckCircleOutlined, SyncOutlined, ClockCircleOutlined,
  ExclamationCircleOutlined, WarningOutlined, TeamOutlined, UserOutlined,
} from '@ant-design/icons';
import { useUserStore } from '@/stores/userStore';
import { getSalespersonDashboard, getTeamDashboard, getManagerDashboard } from '@/services/dashboard';
import type { DashboardSalesperson, DashboardTeam, DashboardManager } from '@/services/dashboard';

const PERIOD_OPTIONS = [
  { label: '今天', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
];

const Dashboard: React.FC = () => {
  const { user } = useUserStore();
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);
  const [salesData, setSalesData] = useState<DashboardSalesperson | null>(null);
  const [teamData, setTeamData] = useState<DashboardTeam | null>(null);
  const [mgrData, setMgrData] = useState<DashboardManager | null>(null);

  const roles = user?.roles?.map((r) => r.code) || [];
  const isAdmin = roles.includes('admin');
  const isSales = roles.includes('salesperson');
  const isManager = roles.includes('manager');
  const supervisorRole = roles.find((r) => r.endsWith('_supervisor'));

  useEffect(() => {
    setLoading(true);
    const promises: Promise<unknown>[] = [];

    if (isSales || roles.length === 0) {
      promises.push(getSalespersonDashboard({ period }).then(setSalesData));
    }
    if (supervisorRole) {
      const moduleCode = supervisorRole.replace('_supervisor', '');
      promises.push(getTeamDashboard(moduleCode).then(setTeamData));
    } else if (isManager) {
      promises.push(getManagerDashboard().then(setMgrData));
    } else if (isAdmin) {
      promises.push(getManagerDashboard().then(setMgrData));
    }

    Promise.all(promises).finally(() => setLoading(false));
  }, [period, user]);

  const renderSalespersonDash = () => (
    <>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}><Card><Statistic title="本月工单" value={salesData?.total_orders || 0} prefix={<FileTextOutlined />} />{salesData && <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>上月: {salesData.last_month_total}</div>}</Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="处理中" value={salesData?.processing_orders || 0} prefix={<SyncOutlined spin />} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="已完成" value={salesData?.completed_orders || 0} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} />{salesData && <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>上月完成: {salesData.last_month_completed}</div>}</Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="待处理" value={salesData?.pending_orders || 0} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#faad14' }} /></Card></Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={14}>
          <Card title="本月趋势" size="small">
            <div style={{ display: 'flex', alignItems: 'flex-end', height: 120, gap: 8 }}>
              {(salesData?.monthly_trend || []).map((m) => (
                <div key={m.month} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ background: '#1677ff', height: (m.completed / 30) * 100, borderRadius: '4px 4px 0 0', minHeight: 4 }} />
                  <div style={{ background: '#e6f4ff', height: ((m.total - m.completed) / 30) * 100, borderRadius: '0 0 4px 4px', minHeight: 2 }} />
                  <div style={{ fontSize: 10, marginTop: 4 }}>{m.month}</div>
                  <div style={{ fontSize: 10, color: '#52c41a' }}>{m.completed}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
              <Tag color="#1677ff">■ 已完成</Tag><Tag color="#e6f4ff">■ 进行中</Tag>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="客户排行前三" size="small">
            <Table dataSource={salesData?.top_customers || []} rowKey="customer_name"
              pagination={false} size="small"
              columns={[
                { title: '客户', dataIndex: 'customer_name', key: 'name' },
                { title: '工单数', dataIndex: 'count', key: 'count', render: (v: number) => <Tag color="blue">{v}</Tag> },
              ]} />
          </Card>
        </Col>
      </Row>
    </>
  );

  const renderTeamDash = () => (
    <>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}><Card><Statistic title="待处理" value={teamData?.total_pending || 0} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="处理中" value={teamData?.total_processing || 0} prefix={<SyncOutlined spin />} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="今日完成" value={teamData?.completed_today || 0} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="本月完成" value={teamData?.completed_this_month || 0} prefix={<TeamOutlined />} valueStyle={{ color: '#722ed1' }} /></Card></Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={14}>
          <Card title="本周趋势" size="small">
            <div style={{ display: 'flex', alignItems: 'flex-end', height: 100, gap: 4 }}>
              {(teamData?.trend || []).map((t) => (
                <div key={t.date} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ background: '#1677ff', height: (t.completed / 10) * 80, borderRadius: 4, minHeight: 4, margin: '0 auto', width: 24 }} />
                  <div style={{ fontSize: 9, marginTop: 2 }}>{t.date}</div>
                  <div style={{ fontSize: 9, color: '#52c41a' }}>{t.completed}</div>
                </div>
              ))}
            </div>
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="成员负载" size="small">
            <Table dataSource={teamData?.members || []} rowKey="user_id" pagination={false} size="small"
              columns={[
                { title: '成员', dataIndex: 'user_name', key: 'name', width: 70 },
                { title: '待办', dataIndex: 'pending_count', key: 'p', width: 50, render: (v: number) => <Tag color="orange">{v}</Tag> },
                { title: '处理中', dataIndex: 'processing_count', key: 'pr', width: 60, render: (v: number) => <Tag color="blue">{v}</Tag> },
                { title: '今日完成', dataIndex: 'completed_today', key: 'c', width: 70, render: (v: number) => <Tag color="green">{v}</Tag> },
              ]} />
          </Card>
        </Col>
      </Row>
    </>
  );

  const renderManagerDash = () => (
    <>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={4}><Card><Statistic title="总工单" value={mgrData?.total_onboarding || 0} prefix={<FileTextOutlined />} /></Card></Col>
        <Col xs={12} sm={4}><Card><Statistic title="已完成" value={mgrData?.completed_onboarding || 0} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={12} sm={4}><Card><Statistic title="完成率" value={mgrData?.completion_rate || 0} suffix="%" precision={1} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col xs={12} sm={4}><Card><Statistic title="本月新增" value={mgrData?.total_this_month || 0} prefix={<FileTextOutlined />} /></Card></Col>
        <Col xs={12} sm={4}><Card><Statistic title="本月完成" value={mgrData?.completed_this_month || 0} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={12} sm={4}><Card><Statistic title="服务时限超期" value={mgrData?.sla_breach_count || 0} prefix={<ExclamationCircleOutlined />} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title="按模块分布" size="small">
            <Table dataSource={mgrData?.by_module || []} rowKey="module_code" pagination={false} size="small"
              columns={[
                { title: '模块', dataIndex: 'module_name', key: 'name' },
                { title: '待处理', dataIndex: 'pending', key: 'p', render: (v: number) => <Tag color="orange">{v}</Tag> },
                { title: '处理中', dataIndex: 'processing', key: 'pr', render: (v: number) => <Tag color="blue">{v}</Tag> },
                { title: '已完成', dataIndex: 'completed', key: 'c', render: (v: number) => <Tag color="green">{v}</Tag> },
              ]} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="按业务员排行" size="small">
            <Table dataSource={mgrData?.by_salesperson || []} rowKey="user_id" pagination={false} size="small"
              columns={[
                { title: '业务员', dataIndex: 'user_name', key: 'name' },
                { title: '总工单', dataIndex: 'total', key: 't' },
                { title: '已完成', dataIndex: 'completed', key: 'c', render: (v: number) => <Tag color="green">{v}</Tag> },
                { title: '处理中', dataIndex: 'processing', key: 'p', render: (v: number) => <Tag color="blue">{v}</Tag> },
              ]} />
          </Card>
        </Col>
      </Row>
    </>
  );

  const renderContent = () => {
    if (isAdmin) return renderManagerDash();
    if (isManager || supervisorRole) return teamData ? renderTeamDash() : renderManagerDash();
    return renderSalespersonDash();
  };

  return (
    <PageContainer header={{
      title: '仪表盘',
      extra: [
        <Segmented key="period" options={PERIOD_OPTIONS} value={period} onChange={(v) => setPeriod(v as string)} />,
      ],
    }}>
      {loading ? <Card loading /> : renderContent()}
    </PageContainer>
  );
};

export default Dashboard;
