import { useState } from 'react';
import { Alert, App, Button, Modal, Space, Table, Tag, Typography, Upload } from 'antd';
import { CloudDownloadOutlined, ImportOutlined, SyncOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import {
  batchUpdateCustomerRules, getAllCustomerRules, importCustomerRulesFromOrders,
  type BatchCustomerRuleRow, type ImportRulesFromOrdersResult,
} from '@/services/customerRules';
import { createRulesWorkbook, parseRulesWorkbook, type SpreadsheetRuleRow } from './ruleExcel';

interface ResultRow {
  key: string;
  rowNumber?: number;
  customerId: string;
  customerCode?: string;
  customerName?: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
}

interface Props { keyword: string; onComplete: () => Promise<void> }

const RuleBatchActions: React.FC<Props> = ({ keyword, onComplete }) => {
  const { message } = App.useApp();
  const [busy, setBusy] = useState<'download' | 'import' | 'history' | null>(null);
  const [progress, setProgress] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [resultTitle, setResultTitle] = useState('');
  const [results, setResults] = useState<ResultRow[]>([]);
  const [summary, setSummary] = useState('');

  const download = async () => {
    setBusy('download');
    try {
      const customers = await getAllCustomerRules(keyword || undefined);
      if (!customers.length) { message.info('当前筛选范围没有客户'); return; }
      XLSX.writeFile(createRulesWorkbook(customers), '客户办理规则批量模板.xlsx');
      message.success('已下载包含 ' + customers.length + ' 家客户的办理规则模板');
    } catch (error) { message.error(error instanceof Error ? error.message : '模板下载失败'); }
    finally { setBusy(null); }
  };

  const importFile = async (file: File) => {
    if (!/\.xlsx?$/i.test(file.name)) { message.error('请选择Excel文件（.xlsx或.xls）'); return Upload.LIST_IGNORE; }
    if (file.size > 10 * 1024 * 1024) { message.error('Excel文件不能超过10MB'); return Upload.LIST_IGNORE; }
    setBusy('import');
    setProgress('正在读取Excel');
    try {
      const parsed = parseRulesWorkbook(XLSX.read(await file.arrayBuffer(), { type: 'array' }));
      const collected: ResultRow[] = parsed.filter((row) => row.error).map((row) => ({
        key: String(row.rowNumber), rowNumber: row.rowNumber, customerId: row.customerId,
        customerCode: row.customerCode, customerName: row.customerName, status: 'failed', message: row.error!,
      }));
      const valid = parsed.filter((row) => !row.error);
      for (let offset = 0; offset < valid.length; offset += 500) {
        const batch = valid.slice(offset, offset + 500);
        setProgress('正在导入 ' + Math.min(offset + batch.length, valid.length) + ' / ' + valid.length + ' 行');
        const byId = new Map<string, SpreadsheetRuleRow>(batch.map((row) => [row.customerId, row]));
        try {
          const payload: BatchCustomerRuleRow[] = batch.map(({ customerId, rule, rowNumber }) => ({ customerId, rule, rowNumber }));
          const response = await batchUpdateCustomerRules(payload);
          for (const row of batch) {
            const result = response.results.find((item) => item.customerId.toLowerCase() === row.customerId);
            const original = byId.get(row.customerId)!;
            collected.push({
              key: String(original.rowNumber), rowNumber: original.rowNumber, customerId: original.customerId,
              customerCode: result?.customerCode ?? original.customerCode, customerName: result?.customerName ?? original.customerName,
              status: result?.success ? 'success' : 'failed', message: result?.message || '服务端未返回此行结果，请刷新列表核对后重试',
            });
          }
        } catch (error) {
          batch.forEach((row) => collected.push({
            key: String(row.rowNumber), rowNumber: row.rowNumber, customerId: row.customerId,
            customerCode: row.customerCode, customerName: row.customerName, status: 'failed',
            message: '请求未确认，请刷新列表核对后重试：' + (error instanceof Error ? error.message : '网络错误'),
          }));
        }
      }
      const success = collected.filter((row) => row.status === 'success').length;
      setResults(collected.sort((a, b) => (a.rowNumber || 0) - (b.rowNumber || 0)));
      setSummary('共 ' + parsed.length + ' 行，成功 ' + success + ' 行，失败 ' + (parsed.length - success) + ' 行');
      setResultTitle('办理规则批量导入明细');
      setResultOpen(true);
      await onComplete();
    } catch (error) { message.error(error instanceof Error ? error.message : 'Excel读取失败'); }
    finally { setBusy(null); setProgress(''); }
    return Upload.LIST_IGNORE;
  };

  const importHistory = async () => {
    setBusy('history');
    try {
      const customers = await getAllCustomerRules(keyword || undefined);
      if (!customers.length) { message.info('当前筛选范围没有客户'); setHistoryOpen(false); return; }
      const responses: ImportRulesFromOrdersResult[] = [];
      for (let offset = 0; offset < customers.length; offset += 500) {
        setProgress('正在从历史工单带入 ' + Math.min(offset + 500, customers.length) + ' / ' + customers.length + ' 家客户');
        responses.push(await importCustomerRulesFromOrders(customers.slice(offset, offset + 500).map((row) => row.customerId)));
      }
      const imported = responses.reduce((count, response) => count + response.importedCount, 0);
      const skipped = responses.reduce((count, response) => count + response.skippedCount, 0);
      const failed = responses.reduce((count, response) => count + (response.failedCount || 0), 0);
      setResults(responses.flatMap((response) => (response.results || []).map((row) => ({
        key: row.customerId, customerId: row.customerId, customerName: row.customerName, customerCode: row.customerCode,
        status: row.status === 'imported' ? 'success' as const : row.status === 'failed' ? 'failed' as const : 'skipped' as const,
        message: row.message,
      }))));
      setSummary('共 ' + customers.length + ' 家客户，带入 ' + imported + ' 家，跳过 ' + skipped + ' 家，失败 ' + failed + ' 家');
      setResultTitle('历史工单规则带入明细');
      setHistoryOpen(false);
      setResultOpen(true);
      await onComplete();
    } catch (error) { message.error(error instanceof Error ? error.message : '历史工单规则带入失败，请刷新列表核对已处理客户'); }
    finally { setBusy(null); setProgress(''); }
  };

  return <>
    <Space wrap>
      <Button icon={<CloudDownloadOutlined />} loading={busy === 'download'} disabled={busy !== null} onClick={() => void download()}>下载批量Excel模板</Button>
      <Upload accept=".xlsx,.xls" showUploadList={false} disabled={busy !== null} beforeUpload={importFile}>
        <Button icon={<ImportOutlined />} loading={busy === 'import'} disabled={busy !== null}>批量导入办理规则</Button>
      </Upload>
      <Button icon={<SyncOutlined />} loading={busy === 'history'} disabled={busy !== null} onClick={() => setHistoryOpen(true)}>从历史工单带入</Button>
      {progress && <Typography.Text type="secondary">{progress}</Typography.Text>}
    </Space>
    <Modal title="从历史工单带入客户规则" open={historyOpen} confirmLoading={busy === 'history'}
      okText="开始带入" cancelText="取消" onOk={() => void importHistory()} onCancel={() => { if (!busy) setHistoryOpen(false); }}>
      <Typography.Paragraph>{keyword ? '处理当前搜索条件“' + keyword + '”下的全部客户。' : '处理全部启用客户。'}</Typography.Paragraph>
      <Alert type="info" showIcon message="已有人工配置优先，只补充可信的入职、离职规则"
        description="薪资账单日、共享邮箱和办结邮件收件人需要通过页面或Excel配置，不会从历史工单推断。" />
    </Modal>
    <Modal title={resultTitle} open={resultOpen} width={1100} footer={<Button onClick={() => setResultOpen(false)}>关闭</Button>} onCancel={() => setResultOpen(false)}>
      <Alert type={results.some((row) => row.status === 'failed') ? 'warning' : 'success'} showIcon message={summary} style={{ marginBottom: 16 }} />
      <Table<ResultRow> rowKey="key" dataSource={results} size="small" scroll={{ x: 950 }} pagination={{ pageSize: 20, showSizeChanger: true }}
        columns={[
          { title: 'Excel行号', dataIndex: 'rowNumber', width: 95, render: (value) => value ?? '-' },
          { title: '客户UUID', dataIndex: 'customerId', width: 290 },
          { title: '客户编码', dataIndex: 'customerCode', width: 140 },
          { title: '客户名称', dataIndex: 'customerName', width: 180 },
          { title: '结果', dataIndex: 'status', width: 90,
            filters: [{ text: '成功', value: 'success' }, { text: '失败', value: 'failed' }, { text: '跳过', value: 'skipped' }],
            onFilter: (value, row) => row.status === value,
            render: (value: ResultRow['status']) => <Tag color={value === 'success' ? 'success' : value === 'failed' ? 'error' : 'default'}>{value === 'success' ? '成功' : value === 'failed' ? '失败' : '跳过'}</Tag> },
          { title: '明细', dataIndex: 'message', width: 300 },
        ]} />
    </Modal>
  </>;
};

export default RuleBatchActions;
