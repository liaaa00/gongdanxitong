import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Alert, App, Button, Input, Modal, Radio, Select, Space, Table, Tag, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { batchImportDispatchedOrders } from '@/services/dispatchedOrders';
import type { DispatchedBatchImportResult, DispatchedBatchImportRow } from '@/services/dispatchedOrders';

export type DispatchedBatchImportMode = 'status' | 'fields';
type BatchStatusAction = 'complete' | 'return';
const SOCIAL_FEEDBACK_MODULES = new Set(['social_insurance', 'social_insurance_resign', 'resignation_social_insurance']);

interface ModuleOption {
  label: string;
  value: string;
}

interface Props {
  open: boolean;
  mode: DispatchedBatchImportMode;
  moduleOptions: ModuleOption[];
  defaultModuleCode?: string;
  hideModuleSelect?: boolean;
  onClose: () => void;
  onImported?: () => void;
}


const ORDER_NO_ALIASES = ['工单编号', '工单编码', '工单号', '编号', '主工单号', '主工单编号', '子工单号', '子工单编号', 'order_no', 'orderNo'];
const EMPLOYEE_ID_ALIASES = ['员工证件号', '证件号', '证件号码', '身份证号', '身份证号码', '员工身份证号', '员工身份证号码', 'employee_id_card', 'employeeIdCard', 'id_card_no', 'idCardNo'];
const RESULT_ALIASES = ['办理结果', '结果', '状态', 'result', 'status'];
const RETURN_REASON_ALIASES = ['退回原因', '原因', 'returnReason', 'return_reason'];
const REMARK_ALIASES = ['办理备注', '完成备注', '备注', 'remark'];
const BANK_NAME_ALIASES = ['开户银行信息', '开户银行', '开户行', '开户行名称', '银行名称', 'bank_name', 'bankName'];
const BANK_ACCOUNT_ALIASES = ['银行借记卡帐号', '银行借记卡账号', '银行账号', '银行卡号', '银行卡账号', '工资卡号', 'bank_account', 'bankAccount'];
const HANDLING_FEEDBACK_ALIASES: Record<string, string[]> = {
  social_insurance_result: ['social_insurance_result', 'social_security_result', '社保是否办结', '社保办理结果', '社保结果', '社保状态'],
  social_insurance_remark: ['social_insurance_remark', 'social_security_remark', '社保公积金办理备注', '社保办理备注', '社保备注', '医保办理备注', '医保备注', '公积金办理备注', '公积金备注'],
  medical_insurance_result: ['medical_insurance_result', '医保是否办结', '医保办理结果', '医保结果', '医保状态'],
  housing_fund_result: ['housing_fund_result', '公积金是否办结', '公积金办理结果', '公积金结果', '公积金状态'],
};

function normalizeHeader(value: string): string {
  return String(value || '')
    .replace(/^\ufeff/, '')
    .replace(/[\s\u00a0\u3000]+/g, '')
    .replace(/[：:（）()\[\]【】]/g, '')
    .toLowerCase();
}

function normalizeRawRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const textKey = String(key || '').trim();
    normalized[textKey] = value;
    normalized[normalizeHeader(textKey)] = value;
  }
  return normalized;
}

function readCell(row: Record<string, unknown>, aliases: string[]): string | undefined {
  const normalized = normalizeRawRow(row);
  for (const alias of aliases) {
    const value = normalized[alias] ?? normalized[normalizeHeader(alias)];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return undefined;
}

function normalizeRow(row: Record<string, unknown>): DispatchedBatchImportRow {
  const orderNo = readCell(row, ORDER_NO_ALIASES);
  const employeeIdCard = readCell(row, EMPLOYEE_ID_ALIASES);
  const result = readCell(row, RESULT_ALIASES);
  const returnReason = readCell(row, RETURN_REASON_ALIASES);
  const remark = readCell(row, REMARK_ALIASES);
  const bankName = readCell(row, BANK_NAME_ALIASES);
  const bankAccount = readCell(row, BANK_ACCOUNT_ALIASES);
  const fields: Record<string, unknown> = {};
  if (bankName) fields.bank_name = bankName;
  if (bankAccount) fields.bank_account = bankAccount;
  for (const [fieldCode, aliases] of Object.entries(HANDLING_FEEDBACK_ALIASES)) {
    const value = readCell(row, aliases);
    if (value) fields[fieldCode] = value;
  }
  return { orderNo, employeeIdCard, idCardNo: employeeIdCard, result, status: result, returnReason, remark, fields, raw: row };
}

function normalizeSheetName(value: string): string {
  return normalizeHeader(value).replace(/子工单|列表|导出/g, '');
}

function pickSheetNames(workbook: XLSX.WorkBook, selectedModuleLabel?: string): string[] {
  const names = workbook.SheetNames || [];
  if (!selectedModuleLabel) return names;
  const target = normalizeSheetName(selectedModuleLabel);
  const preferred = names.filter((name) => normalizeSheetName(name).includes(target) || target.includes(normalizeSheetName(name)));
  return preferred.length > 0 ? preferred : names;
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

function hasImportIdentity(row: DispatchedBatchImportRow): boolean {
  return Boolean(row.orderNo || row.employeeIdCard || row.idCardNo);
}

function previewMessage(row: DispatchedBatchImportRow, mode: DispatchedBatchImportMode, action: BatchStatusAction, socialFeedback = false): { ok: boolean; text: string } {
  if (!hasImportIdentity(row)) return { ok: false, text: '缺少工单号/证件号码，无法匹配' };
  if (mode === 'status' && socialFeedback) {
    const missing = ['social_insurance_result', 'medical_insurance_result', 'housing_fund_result']
      .filter((fieldCode) => !String(row.fields?.[fieldCode] ?? '').trim());
    if (missing.length > 0) return { ok: false, text: '缺少社保/医保/公积金是否办结' };
  }
  if (mode === 'status' && !socialFeedback && action === 'return' && !(row.returnReason || '').trim()) return { ok: false, text: '退回动作缺少退回原因，将使用默认原因' };
  if (mode === 'fields' && Object.keys(row.fields || {}).length === 0) return { ok: false, text: '缺少可修改银行卡字段' };
  return { ok: true, text: '可导入，实际结果以系统权限和状态校验为准' };
}

function buildStatusRows(rows: DispatchedBatchImportRow[], action: BatchStatusAction): DispatchedBatchImportRow[] {
  const label = action === 'complete' ? '完成' : '退回';
  return rows.map((row) => ({ ...row, result: label, status: label }));
}

const DispatchedBatchImportModal: React.FC<Props> = ({ open, mode, moduleOptions, defaultModuleCode, hideModuleSelect = false, onClose, onImported }) => {
  const { message } = App.useApp();
  const [moduleCode, setModuleCode] = useState(defaultModuleCode || moduleOptions[0]?.value || '');
  const [statusAction, setStatusAction] = useState<BatchStatusAction>('complete');
  const [rows, setRows] = useState<DispatchedBatchImportRow[]>([]);
  const [result, setResult] = useState<DispatchedBatchImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const defaultRemark = '批量导入办理完成';
  const [defaultReturnReason, setDefaultReturnReason] = useState('批量导入退回');
  const wasOpenRef = useRef(false);
  const lastModeRef = useRef<DispatchedBatchImportMode>(mode);

  const options = useMemo(() => {
    if (mode === 'fields') return moduleOptions.filter((item) => item.value === 'onboarding_contact');
    return moduleOptions;
  }, [mode, moduleOptions]);
  const isSocialFeedbackModule = mode === 'status' && SOCIAL_FEEDBACK_MODULES.has(moduleCode);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    const modeChangedWhileOpen = open && lastModeRef.current !== mode;
    wasOpenRef.current = open;
    lastModeRef.current = mode;
    if (!open || (!justOpened && !modeChangedWhileOpen)) return;

    setRows([]);
    setResult(null);
    setStatusAction('complete');
    setDefaultReturnReason('批量导入退回');
    const preferred = mode === 'fields' ? 'onboarding_contact' : defaultModuleCode;
    const nextModule = options.some((item) => item.value === preferred) ? preferred : options[0]?.value;
    setModuleCode(nextModule || '');
  }, [open, mode, defaultModuleCode, options]);

  useEffect(() => {
    if (!open) return;
    if (options.length === 0) {
      setModuleCode('');
      return;
    }
    if (!options.some((item) => item.value === moduleCode)) setModuleCode(options[0].value);
  }, [open, options, moduleCode]);

  const parseFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const selectedModuleLabel = options.find((item) => item.value === moduleCode)?.label;
      const records = pickSheetNames(workbook, selectedModuleLabel)
        .flatMap((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) return [];
          return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
            .filter(hasAnyCell);
        });
      if (records.length === 0) {
        message.warning('未读取到工作表数据，请检查 Excel 文件');
        return;
      }
      const normalized = records.map(normalizeRow).filter((row) => hasImportIdentity(row) || Object.keys(row.fields || {}).length > 0);
      const missingMatch = normalized.filter((row) => !hasImportIdentity(row)).length;
      setRows(normalized);
      setResult(null);
      if (normalized.length === 0) message.warning('未读取到可导入数据，请确认表格至少包含工单号/证件号码');
      else if (missingMatch > 0) message.warning(`已读取 ${normalized.length} 行，其中 ${missingMatch} 行缺少工单号/证件号码，将在导入时失败`);
      else message.success(`已读取 ${normalized.length} 行，请确认后导入`);
    } catch {
      message.error('Excel 解析失败，请检查文件格式');
    }
  };

  const handleImport = async () => {
    if (!moduleCode) {
      message.warning(options.length === 0 ? '当前账号没有可导入办理的子工单类型' : '请选择子工单模块');
      return;
    }
    if (rows.length === 0) {
      message.warning('请先上传 Excel');
      return;
    }
    if (!isSocialFeedbackModule && mode === 'status' && statusAction === 'return' && !defaultReturnReason.trim() && rows.some((row) => !row.returnReason?.trim())) {
      message.warning('批办理退回必须填写默认退回原因，或在 Excel 中逐行填写退回原因');
      return;
    }
    setLoading(true);
    try {
      const importRows = mode === 'status' && !isSocialFeedbackModule ? buildStatusRows(rows, statusAction) : rows;
      const res = await batchImportDispatchedOrders({
        moduleCode,
        mode,
        rows: importRows,
        defaultRemark,
        defaultReturnReason,
        ...(mode === 'status' && !isSocialFeedbackModule ? { forceAction: statusAction } : {}),
      });
      setResult(res);
      if (res.failRows > 0) {
        const voidBlocked = res.rows.some((item) => !item.success && String(item.message || '').includes('已作废'));
        message.warning(voidBlocked
          ? `导入完成：成功 ${res.successRows} 行，失败 ${res.failRows} 行；其中包含已作废工单，系统已拦截未导入`
          : `导入完成：成功 ${res.successRows} 行，失败 ${res.failRows} 行`);
      } else message.success(`导入成功：${res.successRows} 行`);
      try {
        onImported?.();
      } catch {
        // 刷新列表失败不应覆盖导入本身的成功结果。
      }
    } catch {
      message.error('批量导入失败');
    } finally {
      setLoading(false);
    }
  };

  const previewRows = rows.map((row, index) => ({ ...row, previewRowNumber: index + 2, preview: previewMessage(row, mode, statusAction, isSocialFeedbackModule) }));
  const selectedActionLabel = isSocialFeedbackModule ? '按表内是否办结反馈' : (statusAction === 'complete' ? '批办理完成' : '批办理退回');

  return (
    <Modal
      title={mode === 'status' ? '批量导入办理结果' : '批量导入修改银行卡字段'}
      open={open}
      onCancel={onClose}
      width={900}
      footer={[
        <Button key="cancel" onClick={onClose}>关闭</Button>,
        <Button key="import" type="primary" loading={loading} disabled={rows.length === 0 || !moduleCode} onClick={handleImport}>确认导入</Button>,
      ]}
      destroyOnHidden
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {!hideModuleSelect && (
          <Space wrap>
            <span>子工单模块：</span>
            <Select
              style={{ width: 260 }}
              value={moduleCode || undefined}
              onChange={setModuleCode}
              disabled={mode === 'fields'}
              options={options}
              placeholder={options.length === 0 ? '当前无可导入模块' : '请选择子工单模块'}
            />
          </Space>
        )}
        {mode === 'status' && (
          isSocialFeedbackModule ? (
            <Alert
              type="info"
              showIcon
              message="社保公积金导入将按 Excel 中的社保/医保/公积金是否办结反馈"
              description="三项是否办结均填“是”时子工单自动完成；任一项为“否”时保持处理中，备注可不填。"
            />
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <span>批量办理动作：</span>
              <Radio.Group
                value={statusAction}
                onChange={(event) => {
                  setStatusAction(event.target.value);
                  setResult(null);
                }}
                optionType="button"
                buttonStyle="solid"
                options={[
                  { label: '批办理完成', value: 'complete' },
                  { label: '批办理退回', value: 'return' },
                ]}
              />
              {statusAction === 'return' && (
                <Input.TextArea
                  rows={3}
                  value={defaultReturnReason}
                  onChange={(e) => setDefaultReturnReason(e.target.value)}
                  placeholder="请后道人员填写批量退回原因"
                  maxLength={500}
                  showCount
                />
              )}
            </Space>
          )
        )}
        <Upload.Dragger
          accept=".xlsx,.xls"
          maxCount={1}
          beforeUpload={(file) => { void parseFile(file); return false; }}
          onRemove={() => { setRows([]); setResult(null); }}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽 Excel 到这里</p>
        </Upload.Dragger>
        {rows.length > 0 && !result && (
          <>

            <Table
              size="small"
              rowKey={(_, index) => `preview-${index}`}
              pagination={{ pageSize: 6 }}
              dataSource={previewRows}
              columns={[
                { title: 'Excel 行号', dataIndex: 'previewRowNumber', width: 90 },
                { title: '工单号', dataIndex: 'orderNo', width: 150, render: (value?: string) => value || <Tag color="orange">未填</Tag> },
                { title: '证件号码', dataIndex: 'employeeIdCard', width: 170, render: (value?: string) => value || <Tag color="orange">未填</Tag> },
                { title: mode === 'status' ? '导入动作' : '银行卡字段', width: 190, render: (_, row) => {
                  if (mode !== 'status') return Object.keys(row.fields || {}).join('、') || <Tag color="orange">未填</Tag>;
                  if (isSocialFeedbackModule) {
                    const summary = ['social_insurance_result', 'medical_insurance_result', 'housing_fund_result']
                      .map((fieldCode) => String(row.fields?.[fieldCode] ?? '').trim() || '未填')
                      .join('/');
                    return <Tag color="blue">{summary}</Tag>;
                  }
                  return <Tag color={statusAction === 'complete' ? 'green' : 'orange'}>{selectedActionLabel}</Tag>;
                } },
                { title: '预检', dataIndex: 'preview', render: (value: { ok: boolean; text: string }) => <Tag color={value.ok ? 'green' : 'red'}>{value.text}</Tag> },
              ]}
            />
          </>
        )}
        {result && (
          <>
            <Alert
              type={result.failRows > 0 ? 'warning' : 'success'}
              showIcon
              message={`导入结果：成功 ${result.successRows} 行，失败 ${result.failRows} 行`}
            />
            <Table
              size="small"
              rowKey="rowNumber"
              pagination={{ pageSize: 8 }}
              dataSource={result.rows}
              columns={[
                { title: 'Excel 行号', dataIndex: 'rowNumber', width: 90 },
                { title: '结果', dataIndex: 'success', width: 90, render: (ok: boolean) => <Tag color={ok ? 'green' : 'red'}>{ok ? '成功' : '失败'}</Tag> },
                { title: '工单号', dataIndex: 'orderNo', width: 160 },
                { title: '证件号码', dataIndex: 'employeeIdCard', width: 180 },
                { title: '动作', dataIndex: 'action', width: 100, render: resultActionText },
                { title: '原因', dataIndex: 'message' },
              ]}
            />
          </>
        )}
      </Space>
    </Modal>
  );
};

export default DispatchedBatchImportModal;
