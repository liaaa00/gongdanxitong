import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, App, Button, Drawer, Space, Table } from 'antd';
import type { ProFormInstance } from '@ant-design/pro-components';
import DynamicForm, { type FieldPermission } from '@/components/DynamicForm';
import { getFields, type FieldConfigItem } from '@/services/fields';
import { getWorkOrder, updateWorkOrder, submitWorkOrder, type WorkOrderItem } from '@/services/workOrders';
import { claimPortalIntake, getPortalIntake, type PortalIntakeRow } from '@/services/portalReview';
import MaterialsUpload from '@/components/MaterialsUpload';
import { normalizePortalIntakeValues } from './portalIntakeValues';

export default function PortalIntakeReview({ customerId }: { customerId: string }) {
  const { message } = App.useApp(); const navigate = useNavigate();
  const [rows, setRows] = useState<PortalIntakeRow[]>([]); const [error, setError] = useState('');
  const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<WorkOrderItem | null>(null); const [fields, setFields] = useState<FieldConfigItem[]>([]);
  const [selected, setSelected] = useState<PortalIntakeRow | null>(null);
  const formRef = useRef<ProFormInstance>(); const version = useRef(0);
  const initialValues = useMemo(() => normalizePortalIntakeValues(order?.extra_data ?? {}, fields), [order, fields]);
  async function load() {
    const current = ++version.current; if (!customerId) return;
    setLoading(true); setError('');
    try { const result = await getPortalIntake(customerId); if (current === version.current) setRows(result); }
    catch (e) { if (current === version.current) setError(e instanceof Error ? e.message : '加载失败'); }
    finally { if (current === version.current) setLoading(false); }
  }
  useEffect(() => { setRows([]); setOrder(null); setSelected(null); void load(); return () => { version.current++; }; }, [customerId]);
  async function review(row: PortalIntakeRow) {
    const current = version.current; setBusy(true);
    try {
      const claimed = await claimPortalIntake(customerId, row.id);
      const [detail, definitions] = await Promise.all([getWorkOrder(claimed.workOrderId), getFields(row.businessType)]);
      if (current !== version.current) return;
      setSelected(row); setOrder(detail); setFields(definitions.filter(field => !['customer_name', 'customer_code', 'branch_code', 'branchId'].includes(field.field_code)));
      await load();
    } catch (e) { message.error(e instanceof Error ? e.message : '认领失败'); }
    finally { setBusy(false); }
  }
  async function save(submit: boolean) {
    if (!order) return; setBusy(true);
    try {
      const values = submit ? await formRef.current?.validateFieldsReturnFormatValue?.() : formRef.current?.getFieldsFormatValue?.();
      if (!values) return;
      const patch = Object.fromEntries(Object.entries(values).filter(([key, value]) => !key.startsWith('portal_') && JSON.stringify(value) !== JSON.stringify(initialValues[key])));
      if (Object.keys(patch).length) await updateWorkOrder(order.id, { extra_data: patch });
      if (submit) { await submitWorkOrder(order.id); message.success('审核通过，已按现有规则派发'); setOrder(null); setSelected(null); }
      else { setOrder(await getWorkOrder(order.id)); message.success('审核资料已保存'); }
      await load();
    } catch (e) { message.error(e instanceof Error ? e.message : '请核对必填项和办理规则'); }
    finally { setBusy(false); }
  }
  return <Space direction="vertical" style={{ width: '100%' }}>
    {error && <Alert type="info" showIcon message={error} />}
    <Table<PortalIntakeRow> rowKey="id" dataSource={rows} loading={loading} pagination={{ pageSize: 20 }} title={() => <Space>增减员资料审核<Button onClick={() => void load()}>刷新受理记录</Button></Space>} columns={[
      { title: '受理编号', dataIndex: 'requestNo' }, { title: '业务', render: (_, row) => row.businessType === 'onboarding' ? '增员' : '减员' },
      { title: '待补配置', render: (_, row) => row.configurationMissing.join('、') || '已配置' },
      { title: '原始停保月', dataIndex: 'originalStopMonth' },
      { title: '操作', render: (_, row) => <Space><Button loading={busy} disabled={!row.canClaim} onClick={() => void review(row)}>{row.canReview ? '继续审核' : '认领并审核'}</Button>{row.workOrderId && row.canReview && <Button onClick={() => navigate(`/work-orders/${row.workOrderId}`)}>工单详情</Button>}</Space> },
    ]} />
    <Drawer title={`增减员资料审核 · ${selected?.requestNo ?? ''}`} width={1100} open={Boolean(order)} destroyOnClose onClose={() => { setOrder(null); setSelected(null); }} extra={<Space><Button loading={busy} onClick={() => void save(false)}>保存资料</Button><Button type="primary" loading={busy} disabled={Boolean(selected?.configurationMissing.length)} onClick={() => void save(true)}>审核通过并派发</Button></Space>}>
      {order && <>
        <Alert type="info" showIcon message="核对客户资料后提交派发" description={selected?.configurationMissing.length ? `请先在办理规则中补齐并填充草稿：${selected.configurationMissing.join('、')}` : '客户上传附件统一由共享邮箱接收；内部材料门禁仍按现有业务规则核验。'} style={{ marginBottom: 16 }} />
        {selected?.originalStopMonth && <Alert type="info" message={`客户填写的停保月：${selected.originalStopMonth}（该月起不产生费用）`} />}
        <DynamicForm key={order.id} formRef={formRef} fields={fields} orderType={order.order_type} initialValues={initialValues} fieldPermissions={order._fieldPermissions as Record<string, FieldPermission> | undefined} hideSubmit />
        <MaterialsUpload workOrderId={order.id} bizPurpose={order.order_type === 'resignation' ? 'resignation_material' : 'onboarding_material'} />
      </>}
    </Drawer>
  </Space>;
}
