import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Alert, App, Button, Input, Modal, Select, Space, Table, Tag, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { batchImportDispatchedOrders } from '@/services/dispatchedOrders';
import type { DispatchedBatchImportResult, DispatchedBatchImportRow } from '@/services/dispatchedOrders';

export type DispatchedBatchImportMode = 'status' | 'fields';

interface ModuleOption {
  label: string;
  value: string;
}

interface Props {
  open: boolean;
  mode: DispatchedBatchImportMode;
  moduleOptions: ModuleOption[];
  defaultModuleCode?: string;
  onClose: () => void;
  onImported?: () => void;
}

const STATUS_TIP = '办理结果列填写“完成”或“退回”；退回时请填写“退回原因”。系统按工单号优先匹配，没有工单号时按员工证件号匹配。';
const FIELD_TIP = '字段修改导入目前仅支持“入职联系子工单”的开户银行信息、银行借记卡帐号；导入后只更新字段，不自动完成工单。';

function readCell(row: Record<string, unknown>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return undefined;
}

function normalizeRow(row: Record<string, unknown>): DispatchedBatchImportRow {
  const orderNo = readCell(row, ['工单编号', '工单号', '主工单号', 'order_no', 'orderNo']);
  const employeeIdCard = readCell(row, ['员工证件号', '证件号', '身份证号', 'employee_id_card', 'idCardNo', 'employeeIdCard']);
  const result = readCell(row, ['办理结果', '结果', '状态', 'result', 'status']);
  const returnReason = readCell(row, ['退回原因', '原因', 'returnReason']);
  const remark = readCell(row, ['办理备注', '完成备注', '备注', 'remark']);
  const bankName = readCell(row, ['开户银行信息', '开户银行', '银行名称', '开户行', 'bank_name']);
  const bankAccount = readCell(row, ['银行借记卡帐号', '银行借记卡账号', '银行账号', '银行卡号', '工资卡号', 'bank_account']);
  const fields: Record<string, unknown> = {};
  if (bankName) fields.bank_name = bankName;
  if (bankAccount) fields.bank_account = bankAccount;
  return { orderNo, employeeIdCard, idCardNo: employeeIdCard, result, status: result, returnReason, remark, fields, raw: row };
}

function resultActionText(action?: string) {
  if (action === 'complete') return '完成';
  if (action === 'return') return '退回';
  if (action === 'fields') return '字段修改';
  return action || '-';
}

function hasAnyCell(row: Record<string, unknown>): boolean {
  return Object.values(row).some((value) => String(value ?? '').trim().length > 0);
}

function previewMessage(row: DispatchedBatchImportRow, mode: DispatchedBatchImportMode): { ok: boolean; text: string } {
  if (!row.orderNo && !row.employeeIdCard) return { ok: false, text: '缺少工单号/身份证号，无法匹配' };
  if (mode === 'status' && !row.result) return { ok: false, text: '缺少办理结果' };
  if (mode === 'fields' && Object.keys(row.fields || {}).length === 0) return { ok: false, text: '缺少可修改银行卡字段' };
  return { ok: true, text: '可导入，实际匹配结果以系统校验为准' };
}

const DispatchedBatchImportModal: React.FC<Props> = ({ open, mode, moduleOptions, defaultModuleCode, onClose, onImported }) => {
  const { message } = App.useApp();
  const [moduleCode, setModuleCode] = useState(defaultModuleCode || moduleOptions[0]?.value || 'onboarding_contact');
  const [rows, setRows] = useState<DispatchedBatchImportRow[]>([]);
  const [result, setResult] = useState<DispatchedBatchImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [defaultRemark, setDefaultRemark] = useState('批量导入办理完成');
  const [defaultReturnReason, setDefaultReturnReason] = useState('批量导入退回');

  useEffect(() => {
    if (!open) return;
    setRows([]);
    setResult(null);
    setModuleCode(mode === 'fields' ? 'onboarding_contact' : (defaultModuleCode || moduleOptions[0]?.value || 'onboarding_contact'));
  }, [open, mode, defaultModuleCode, moduleOptions]);

  const options = useMemo(() => {
    if (mode === 'fields') return moduleOptions.filter((item) => item.value === 'onboarding_contact');
    return moduleOptions;
  }, [mode, moduleOptions]);

  const parseFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }).filter(hasAnyCell);
      const normalized = records.map(normalizeRow);
      const missingMatch = normalized.filter((row) => !row.orderNo && !row.employeeIdCard).length;
      setRows(normalized);
      setResult(null);
      if (normalized.length === 0) message.warning('未读取到可导入数据，请确认表格内容');
      else if (missingMatch > 0) message.warning(`已读取 ${normalized.length} 行，其中 ${missingMatch} 行缺少工单号/身份证号，将在导入时失败`);
      else message.success(`已读取 ${normalized.length} 行，请确认后导入`);
    } catch {
      message.error('Excel 解析失败，请检查文件格式');
    }
  };

  const handleImport = async () => {
    if (!moduleCode) {
      message.warning('请选择子工单模块');
      return;
    }
    if (rows.length === 0) {
      message.warning('请先上传 Excel');
      return;
    }
    setLoading(true);
    try {
      const res = await batchImportDispatchedOrders({ moduleCode, mode, rows, defaultRemark, defaultReturnReason });
      setResult(res);
      if (res.failRows > 0) message.warning(`导入完成：成功 ${res.successRows} 行，失败 ${res.failRows} 行`);
      else message.success(`导入成功：${res.successRows} 行`);
      onImported?.();
    } catch {
      message.error('批量导入失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={mode === 'status' ? '批量导入办理/退回结果' : '批量导入修改银行卡字段'}
      open={open}
      onCancel={onClose}
      width={860}
      footer={[
        <Button key="cancel" onClick={onClose}>关闭</Button>,
        <Button key="import" type="primary" loading={loading} disabled={rows.length === 0} onClick={handleImport}>确认导入</Button>,
      ]}
      destroyOnHidden
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Alert type={mode === 'status' ? 'info' : 'warning'} showIcon message={mode === 'status' ? STATUS_TIP : FIELD_TIP} />
        <Space wrap>
          <span>子工单模块：</span>
          <Select
            style={{ width: 240 }}
            value={moduleCode}
            onChange={setModuleCode}
            disabled={mode === 'fields'}
            options={options}
            placeholder="请选择子工单模块"
          />
        </Space>
        {mode === 'status' && (
          <Space wrap style={{ width: '100%' }}>
            <Input style={{ width: 260 }} value={defaultRemark} onChange={(e) => setDefaultRemark(e.target.value)} placeholder="完成时默认备注" />
            <Input style={{ width: 260 }} value={defaultReturnReason} onChange={(e) => setDefaultReturnReason(e.target.value)} placeholder="退回时默认原因" />
          </Space>
        )}
        <Upload.Dragger
          accept=".xlsx,.xls"
          maxCount={1}
          beforeUpload={(file) => { void parseFile(file); return false; }}
          onRemove={() => { setRows([]); setResult(null); }}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽 Excel 到这里</p>
          <p className="ant-upload-hint">建议表头包含：工单号/员工证件号、办理结果、退回原因、办理备注；字段修改另需开户银行信息、银行借记卡帐号。</p>
        </Upload.Dragger>
        {rows.length > 0 && !result && (
          <>
            <Alert type="success" showIcon message={`已读取 ${rows.length} 行待导入数据，请先核对预览。`} />
            <Table
              size="small"
              rowKey={(_, index) => `preview-${index}`}
              pagination={{ pageSize: 6 }}
              dataSource={rows.map((row, index) => ({ ...row, previewRowNumber: index + 2, preview: previewMessage(row, mode) }))}
              columns={[
                { title: 'Excel 行号', dataIndex: 'previewRowNumber', width: 90 },
                { title: '工单号', dataIndex: 'orderNo', width: 150, render: (value?: string) => value || <Tag color="orange">未填</Tag> },
                { title: '员工证件号', dataIndex: 'employeeIdCard', width: 170, render: (value?: string) => value || <Tag color="orange">未填</Tag> },
                { title: mode === 'status' ? '办理结果' : '银行卡字段', width: 150, render: (_, row) => mode === 'status' ? (row.result || <Tag color="orange">未填</Tag>) : Object.keys(row.fields || {}).join('、') || <Tag color="orange">未填</Tag> },
                { title: '预检', dataIndex: 'preview', render: (value: { ok: boolean; text: string }) => <Tag color={value.ok ? 'green' : 'red'}>{value.text}</Tag> },
              ]}
            />
          </>
        )}
        {result && (
          <>
            <Alert type={result.failRows > 0 ? 'warning' : 'success'} showIcon message={`导入结果：成功 ${result.successRows} 行，失败 ${result.failRows} 行`} />
            <Table
              size="small"
              rowKey="rowNumber"
              pagination={{ pageSize: 8 }}
              dataSource={result.rows}
              columns={[
                { title: 'Excel 行号', dataIndex: 'rowNumber', width: 90 },
                { title: '结果', dataIndex: 'success', width: 90, render: (ok: boolean) => <Tag color={ok ? 'green' : 'red'}>{ok ? '成功' : '失败'}</Tag> },
                { title: '工单号', dataIndex: 'orderNo', width: 160 },
                { title: '员工证件号', dataIndex: 'employeeIdCard', width: 180 },
                { title: '动作', dataIndex: 'action', width: 100, render: resultActionText },
                { title: '说明', dataIndex: 'message' },
              ]}
            />
          </>
        )}
      </Space>
    </Modal>
  );
};

export default DispatchedBatchImportModal;
