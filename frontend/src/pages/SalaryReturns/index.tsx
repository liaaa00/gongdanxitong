import { useEffect, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Alert, App, Button, Descriptions, Drawer, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { getAllCustomerRules, type CustomerRuleItem } from '@/services/customerRules';
import { getPortalSalaryReturns, retryPortalEmail, type PortalSalaryReturnAttachment, type PortalSalaryReturnRow } from '@/services/customerPortalBusiness';

const statusLabels: Record<string, string> = { received: '待办理', completed: '已办结' };
const emailLabels: Record<string, string> = { pending: '待发送', sending: '发送中', sent: '已发送', failed: '发送失败', cancelled: '已取消' };
const emailColor: Record<string, string> = { pending: 'blue', sending: 'processing', sent: 'green', failed: 'red', cancelled: 'default' };
const modeLabels: Record<string, string> = { same: '与上月无变化', changed: '薪资有变化' };
const channelLabels: Record<string, string> = { text: '文字说明', attachment: '附件提交' };

const formatTime = (value: string | null | undefined) => (value ? new Date(value).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }) : '-');

function EmailStatus({ email, onRetry }: { email: PortalSalaryReturnRow['completionEmail'] | PortalSalaryReturnRow['attachmentEmail']; onRetry: () => void }) {
  if (!email) return <Tag>未生成</Tag>;
  return <Space size={4} wrap><Tag color={emailColor[email.status] ?? 'default'}>{emailLabels[email.status] ?? email.status}</Tag>{email.lastError && <Typography.Text type="danger">{email.lastError}</Typography.Text>}{['failed', 'pending'].includes(email.status) && <Button size="small" onClick={onRetry}>重试</Button>}</Space>;
}

function AttachmentList({ files, emptyText }: { files: PortalSalaryReturnAttachment[]; emptyText: string }) {
  if (!files.length) return <Typography.Text type="secondary">{emptyText}</Typography.Text>;
  return <Space direction="vertical" size={4}>{files.map((file) => (
    <div key={file.fileId}>
      <a href={file.downloadUrl} target="_blank" rel="noreferrer">{file.fileName}</a>
      <Typography.Text type="secondary"> {file.mimeType || '未知类型'} · {file.size === null || file.size === undefined ? '大小未知' : `${(file.size / 1024).toFixed(1)} KB`}</Typography.Text>
    </div>
  ))}</Space>;
}

function SubmittedContent({ row }: { row: PortalSalaryReturnRow }) {
  const note = (row.note ?? '').trim();
  return <Space direction="vertical" size={8} style={{ width: '100%' }}>
    <Space wrap size={6}>
      <Tag color={row.mode === 'changed' ? 'orange' : 'green'}>{modeLabels[row.mode ?? ''] ?? row.mode ?? '未填写'}</Tag>
      {row.mode === 'changed' && <Tag>{channelLabels[row.channel ?? ''] ?? row.channel ?? '未选择'}</Tag>}
    </Space>
    {row.mode === 'same' && <Typography.Text type="secondary">客户确认本月薪资与上月一致，未填写变化说明，也没有上传附件。</Typography.Text>}
    {row.mode === 'changed' && <>
      <div><Typography.Text strong>文字填写内容</Typography.Text>{note ? <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{note}</Typography.Paragraph> : <Typography.Text type="secondary">客户未填写文字说明</Typography.Text>}</div>
      <div><Typography.Text strong>附件提交内容</Typography.Text><AttachmentList files={row.submissionAttachments} emptyText={row.channel === 'attachment' ? '附件记录缺失，请核对共享邮箱投递' : '客户未上传附件'} /></div>
    </>}
  </Space>;
}

export default function SalaryReturnsPage() {
  const { message } = App.useApp();
  const [customers, setCustomers] = useState<CustomerRuleItem[]>([]);
  const [rows, setRows] = useState<PortalSalaryReturnRow[]>([]);
  const [selected, setSelected] = useState<PortalSalaryReturnRow | null>(null);
  const [month, setMonth] = useState(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 7));
  const [customerId, setCustomerId] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const result = await getPortalSalaryReturns({ month: month || undefined, customerId, status, search: search || undefined, page, pageSize: 20 });
      setRows(result.items); setTotal(result.total);
    } catch (error) { message.error(error instanceof Error ? error.message : '薪酬回传记录加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void getAllCustomerRules().then(setCustomers).catch(() => undefined); }, []);
  useEffect(() => { void load(); }, [month, customerId, status, search, page]);

  const retry = async (row: PortalSalaryReturnRow, emailId: string) => {
    try {
      await retryPortalEmail(row.customerId, emailId);
      message.success('邮件已重新进入发送队列');
      await load();
      if (selected?.id === row.id) setSelected(null);
    } catch (error) { message.error(error instanceof Error ? error.message : '邮件重试失败'); }
  };

  return <PageContainer title="薪酬回传" subTitle="查看客户在门户提交的薪资内容（文字或附件）、内部办理结果和回传邮件投递状态">
    <Alert type="info" showIcon message="薪资办理在工单系统内部完成，本页只做门户提交内容与回传结果追踪" description="客户可能填写文字说明，也可能上传薪资附件，两者都会在此展示。共享邮箱、结果收件人和邮件服务未配置时，记录会保留并明确显示失败原因，配置完成后可从此处重试。" style={{ marginBottom: 16 }} />
    <Space wrap style={{ marginBottom: 16 }}>
      <Input aria-label="薪资所属月份" type="month" value={month} onChange={(event) => { setMonth(event.target.value); setPage(1); }} />
      <Select allowClear showSearch optionFilterProp="label" placeholder="全部客户" style={{ width: 260 }} value={customerId} options={customers.map((item) => ({ value: item.customerId, label: `${item.customerName}（${item.customerCode}）` }))} onChange={(value) => { setCustomerId(value); setPage(1); }} />
      <Select allowClear placeholder="全部状态" style={{ width: 140 }} value={status} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => { setStatus(value); setPage(1); }} />
      <Input.Search allowClear placeholder="受理编号、客户、填写内容" style={{ width: 240 }} onSearch={(value) => { setSearch(value); setPage(1); }} />
      <Button onClick={() => void load()} loading={loading}>刷新</Button>
    </Space>
    <Table<PortalSalaryReturnRow> rowKey="id" loading={loading} dataSource={rows} pagination={{ current: page, pageSize: 20, total, showSizeChanger: false, onChange: (next) => setPage(next) }} onRow={(row) => ({ onClick: () => setSelected(row) })} columns={[
      { title: '客户', render: (_, row) => <span>{row.customerName || '-'}<br /><small>{row.customerCode || row.customerId}</small></span> },
      { title: '受理编号', dataIndex: 'requestNo' },
      { title: '所属月份', dataIndex: 'month' },
      { title: '状态', render: (_, row) => <Tag color={row.status === 'completed' ? 'green' : 'blue'}>{statusLabels[row.status] ?? row.status}</Tag> },
      { title: '客户填写内容', render: (_, row) => <Space direction="vertical" size={2}>
        <Tag color={row.mode === 'changed' ? 'orange' : 'green'}>{modeLabels[row.mode ?? ''] ?? row.mode ?? '未填写'}</Tag>
        {row.mode === 'changed' && <Typography.Text>{channelLabels[row.channel ?? ''] ?? row.channel ?? '未选择'}</Typography.Text>}
        {row.mode === 'changed' && ((row.note ?? '').trim() ? <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{(row.note ?? '').trim()}</Typography.Text> : <Typography.Text type="secondary">未填写文字说明</Typography.Text>)}
      </Space> },
      { title: '附件', render: (_, row) => <Space direction="vertical" size={2}>{row.submissionAttachments.length ? row.submissionAttachments.map((file) => <a key={file.fileId} href={file.downloadUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{file.fileName}</a>) : <Typography.Text type="secondary">无附件</Typography.Text>}{row.completionAttachments.length ? <Typography.Text type="secondary">回传附件 {row.completionAttachments.length} 个</Typography.Text> : null}</Space> },
      { title: '提交时间', dataIndex: 'createdAt', render: (value: string) => formatTime(value) },
      { title: '回传时间', dataIndex: 'completedAt', render: (value: string | null) => formatTime(value) },
      { title: '结果邮件', render: (_, row) => <EmailStatus email={row.completionEmail} onRetry={() => row.completionEmail && void retry(row, row.completionEmail.id)} /> },
      { title: '操作', render: (_, row) => <Button size="small" onClick={(event) => { event.stopPropagation(); setSelected(row); }}>查看详情</Button> },
    ]} />
    <Drawer title={`薪酬回传详情 · ${selected?.requestNo ?? ''}`} width={760} open={Boolean(selected)} onClose={() => setSelected(null)}>
      {selected && <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Descriptions bordered column={2} size="small"><Descriptions.Item label="客户">{selected.customerName}（{selected.customerCode}）</Descriptions.Item><Descriptions.Item label="客户 UUID">{selected.customerId}</Descriptions.Item><Descriptions.Item label="受理编号">{selected.requestNo}</Descriptions.Item><Descriptions.Item label="所属月份">{selected.month}</Descriptions.Item><Descriptions.Item label="提交方式">{modeLabels[selected.mode ?? ''] ?? selected.mode ?? '-'}</Descriptions.Item><Descriptions.Item label="填写渠道">{selected.channel ? channelLabels[selected.channel] ?? selected.channel : '-'}</Descriptions.Item><Descriptions.Item label="提交时间">{formatTime(selected.createdAt)}</Descriptions.Item><Descriptions.Item label="回传时间">{formatTime(selected.completedAt)}</Descriptions.Item></Descriptions>
        <Typography.Title level={5}>客户在门户填写的内容</Typography.Title>
        <SubmittedContent row={selected} />
        <Typography.Title level={5}>内部办理结果</Typography.Title>
        <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}>{selected.resultNote || '尚未办结'}</Typography.Paragraph>
        <div><Typography.Text strong>回传附件</Typography.Text><AttachmentList files={selected.completionAttachments} emptyText="暂无回传附件" /></div>
        <Typography.Title level={5}>投递状态</Typography.Title>
        <Descriptions bordered column={1} size="small"><Descriptions.Item label="共享邮箱附件投递"><EmailStatus email={selected.attachmentEmail} onRetry={() => selected.attachmentEmail && void retry(selected, selected.attachmentEmail.id)} /></Descriptions.Item><Descriptions.Item label="办结结果邮件"><EmailStatus email={selected.completionEmail} onRetry={() => selected.completionEmail && void retry(selected, selected.completionEmail.id)} /></Descriptions.Item></Descriptions>
      </Space>}
    </Drawer>
  </PageContainer>;
}
