import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, App, Button, Drawer, Space, Spin, Table, Tag } from 'antd';
import type { ProFormInstance } from '@ant-design/pro-components';
import DynamicForm, { type FieldPermission } from '@/components/DynamicForm';
import { getFields, type FieldConfigItem } from '@/services/fields';
import { getWorkOrder, updateWorkOrder, submitWorkOrder, type WorkOrderItem } from '@/services/workOrders';
import { claimPortalIntake, getPortalIntake, type PortalIntakeRow } from '@/services/portalReview';
import MaterialsUpload from '@/components/MaterialsUpload';
import { normalizePortalIntakeValues } from './portalIntakeValues';
import { getApiErrorDetails } from '@/services/request';

type PortalIntakeReviewProps = {
  customerId: string;
  autoOpenSubmissionId?: string | null;
  /** The cross-customer list already has the selected intake; do not fetch a second customer list. */
  submission?: PortalIntakeRow;
  compact?: boolean;
  onClosed?: () => void;
  onCompleted?: () => void;
};

const FIELD_LABELS: Record<string, string> = {
  social_location: '缴纳地',
  social_pay_region: '缴纳地',
  fund_ratio: '公积金比例',
  supplementary_fund_ratio: '补充公积金比例',
  contract_subject: '劳动合同主体',
  company_address: '主体注册地',
};

export function formatReviewError(error: unknown, definitions: FieldConfigItem[] = []): string {
  const message = error instanceof Error ? error.message : '请核对必填项和办理规则';
  const details = getApiErrorDetails(error);
  const invalid = Array.isArray(details?.invalid) ? details.invalid : [];
  if (!invalid.length) return message;
  const labels = new Map(definitions.map((field) => [field.field_code, field.field_name]));
  const items = invalid.map((item) => {
    if (!item || typeof item !== 'object') return String(item);
    const record = item as Record<string, unknown>;
    const code = String(record.fieldCode ?? record.field_code ?? '');
    const label = (labels.get(code) ?? FIELD_LABELS[code] ?? code) || '字段';
    const reason = String(record.reason ?? record.message ?? '值不符合规则');
    return `${label}：${reason}`;
  });
  return `${message}：${items.join('；')}`;
}

export default function PortalIntakeReview({ customerId, autoOpenSubmissionId, submission, compact = false, onClosed, onCompleted }: PortalIntakeReviewProps) {
  const { message } = App.useApp(); const navigate = useNavigate();
  const [rows, setRows] = useState<PortalIntakeRow[]>([]); const [error, setError] = useState('');
  const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<WorkOrderItem | null>(null); const [fields, setFields] = useState<FieldConfigItem[]>([]);
  const [selected, setSelected] = useState<PortalIntakeRow | null>(null);
  const [reviewError, setReviewError] = useState(''); const [dismissed, setDismissed] = useState(false);
  const formRef = useRef<ProFormInstance>(); const version = useRef(0); const listVersion = useRef(0);
  const autoOpened = useRef<string | null>(null); const busyRef = useRef(false);
  const initialValues = useMemo(() => normalizePortalIntakeValues(order?.extra_data ?? {}, fields), [order, fields]);
  async function load() {
    const current = version.current; const request = ++listVersion.current; if (!customerId) return;
    setLoading(true); setError('');
    try { const result = await getPortalIntake(customerId); if (current === version.current && request === listVersion.current) setRows(result); }
    catch (e) { if (current === version.current && request === listVersion.current) setError(e instanceof Error ? e.message : '加载失败'); }
    finally { if (current === version.current && request === listVersion.current) setLoading(false); }
  }
  useEffect(() => {
    setRows([]); setOrder(null); setSelected(null); setReviewError(''); setDismissed(false);
    setBusy(false); busyRef.current = false; autoOpened.current = null;
    if (!compact || !submission) void load();
    return () => { version.current++; };
  }, [customerId, compact, autoOpenSubmissionId]);
  async function review(row: PortalIntakeRow) {
    if (busyRef.current || (!row.canClaim && !row.canReview)) return;
    const current = version.current; busyRef.current = true;
    setBusy(true); setReviewError(''); setSelected(row);
    try {
      const claimed = await claimPortalIntake(customerId, row.id);
      const [detail, definitions] = await Promise.all([getWorkOrder(claimed.workOrderId), getFields(row.businessType)]);
      if (current !== version.current) return;
      if (detail.status !== 'draft' || detail.submitted_at) throw new Error('该资料已提交，请关闭并刷新审核列表');
      setSelected({ ...row, configurationMissing: Array.isArray(detail.extra_data.portal_configuration_missing) ? detail.extra_data.portal_configuration_missing as string[] : row.configurationMissing });
      setOrder(detail); setFields(definitions.filter(field => !['customer_name', 'customer_code', 'branch_code', 'branchId'].includes(field.field_code)));
      if (!compact) await load();
    } catch (e) { if (current === version.current) setReviewError(e instanceof Error ? e.message : '审核资料加载失败'); }
    finally { if (current === version.current) { setBusy(false); busyRef.current = false; } }
  }
  useEffect(() => {
    if (!compact || !autoOpenSubmissionId || order || selected || dismissed) return;
    const row = submission?.id === autoOpenSubmissionId ? submission : rows.find((item) => item.id === autoOpenSubmissionId);
    const key = `${customerId}:${autoOpenSubmissionId}`;
    if (!row || (!row.canClaim && !row.canReview) || autoOpened.current === key) return;
    autoOpened.current = key;
    void review(row);
  }, [autoOpenSubmissionId, compact, customerId, dismissed, order, rows, selected, submission]);
  async function save(submit: boolean) {
    if (!order || busyRef.current) return;
    const current = version.current; busyRef.current = true; setBusy(true);
    try {
      const values = submit ? await formRef.current?.validateFieldsReturnFormatValue?.() : formRef.current?.getFieldsFormatValue?.();
      if (!values) return;
      const patch = Object.fromEntries(Object.entries(values).filter(([key, value]) => !key.startsWith('portal_') && JSON.stringify(value) !== JSON.stringify(initialValues[key])));
      if (Object.keys(patch).length) await updateWorkOrder(order.id, { extra_data: patch });
      if (submit) {
        await submitWorkOrder(order.id);
        if (current !== version.current) return;
        message.success('审核通过，已按现有规则派发'); setOrder(null); setSelected(null); setDismissed(true); onCompleted?.();
      } else {
        const latest = await getWorkOrder(order.id);
        if (current !== version.current) return;
        setOrder(latest); message.success('审核资料已保存');
      }
      if (!compact) await load();
    } catch (e) { if (current === version.current) message.error(formatReviewError(e, fields)); }
    finally { if (current === version.current) { setBusy(false); busyRef.current = false; } }
  }
  const close = () => { setOrder(null); setSelected(null); setReviewError(''); setDismissed(true); onClosed?.(); };
  const target = submission?.id === autoOpenSubmissionId ? submission : rows.find((item) => item.id === autoOpenSubmissionId);
  return <Space direction="vertical" style={{ width: '100%' }}>
    {!compact && error && <Alert type="error" showIcon message={error} />}
    {!compact && reviewError && <Alert type="error" showIcon message={reviewError} />}
    {!compact && <Table<PortalIntakeRow> rowKey="id" dataSource={rows} loading={loading} pagination={{ pageSize: 20 }} title={() => <Space>增减员资料审核<Button onClick={() => void load()}>刷新受理记录</Button></Space>} columns={[
      { title: '受理编号', dataIndex: 'requestNo' }, { title: '业务', render: (_, row) => row.businessType === 'onboarding' ? '增员' : '减员' },
      { title: '待补配置', render: (_, row) => row.configurationMissing.join('、') || '已配置' },
      { title: '原始停保月', dataIndex: 'originalStopMonth' },
      { title: '操作', render: (_, row) => <Space>{row.canClaim || row.canReview ? <Button loading={busy} onClick={() => void review(row)}>{row.canReview ? '继续审核' : '认领并审核'}</Button> : <Tag>只读</Tag>}{row.workOrderId && row.canReview && <Button onClick={() => navigate(`/work-orders/${row.workOrderId}`)}>工单详情</Button>}</Space> },
    ]} />}
    <Drawer title={`增减员资料审核 · ${selected?.requestNo ?? target?.requestNo ?? ''}`} width={1100} open={Boolean(order) || Boolean(compact && autoOpenSubmissionId && !dismissed)} destroyOnClose closable={!busy} maskClosable={!busy} keyboard={!busy} onClose={close} extra={order && <Space><Button loading={busy} onClick={() => void save(false)}>保存资料</Button><Button type="primary" loading={busy} disabled={Boolean(selected?.configurationMissing.length)} onClick={() => void save(true)}>审核通过并派发</Button></Space>}>
      {!order && (busy || loading) && <Spin tip="正在加载审核资料"><div style={{ minHeight: 120 }} /></Spin>}
      {compact && !order && !busy && !loading && <Alert
        type="error" showIcon
        message={reviewError || error || (target ? '当前资料不可审核，请关闭并刷新列表' : '未找到该受理记录，请关闭并刷新列表')}
        action={(target?.canClaim || target?.canReview) || error ? <Button onClick={() => target ? void review(target) : void load()}>重试加载</Button> : undefined}
      />}
      {order && <>
        <Alert type="info" showIcon message="核对客户资料后提交派发" description={selected?.configurationMissing.length ? `请先在办理规则中补齐并填充草稿：${selected.configurationMissing.join('、')}` : '客户上传附件统一由共享邮箱接收；内部材料门禁仍按现有业务规则核验。'} style={{ marginBottom: 16 }} />
        {selected?.originalStopMonth && <Alert type="info" message={`客户填写的停保月：${selected.originalStopMonth}（该月起不产生费用）`} />}
        <DynamicForm key={order.id} formRef={formRef} fields={fields} orderType={order.order_type} initialValues={initialValues} fieldPermissions={order._fieldPermissions as Record<string, FieldPermission> | undefined} hideSubmit />
        <MaterialsUpload workOrderId={order.id} bizPurpose={order.order_type === 'resignation' ? 'resignation_material' : 'onboarding_material'} />
      </>}
    </Drawer>
  </Space>;
}
