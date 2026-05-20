import { useState, useMemo } from 'react';
import {
  Upload, Button, Table, Select, Alert, Space, Progress, Steps, Card,
  Tag, Badge, Tooltip, Collapse, Typography, Descriptions, App,
  Modal, Form, Input, Switch,
} from 'antd';
import {
  InboxOutlined, FileExcelOutlined, CheckCircleOutlined,
  WarningOutlined, CloseCircleOutlined, DownloadOutlined,
  ReloadOutlined, ThunderboltOutlined, QuestionCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';

const NEW_FIELD_SENTINEL = '__NEW_FIELD__';

const FIELD_TYPE_OPTIONS = [
  { label: '文本', value: 'text' },
  { label: '数字', value: 'number' },
  { label: '日期', value: 'date' },
  { label: '下拉', value: 'dropdown' },
  { label: '邮箱', value: 'email' },
  { label: '手机号', value: 'phone' },
];

export interface NewFieldDraft {
  header: string;
  fieldName: string;
  fieldType: string;
  required?: boolean;
}

const { Dragger } = Upload;
const { Text } = Typography;

const DEPRECATED_FIELDS = new Set([
  'social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio', 'social_urge',
]);

function filterDeprecatedFields(codes: string[] | undefined): string[] {
  if (!codes) return [];
  return codes.filter((c) => !DEPRECATED_FIELDS.has(c));
}

const ERROR_CODE_LABEL: Record<string, string> = {
  IMPORT_FILE_NOT_FOUND: '文件失效',
  DUPLICATE_ID_CARD_IN_MONTH: '同月身份证重复',
  DISPATCH_NO_MATCH: '未匹配派发规则',
  VALIDATION_FAILED: '必填或格式错误',
  REQUIRED_FIELD_MISSING: '必填或格式错误',
  INVALID_FORMAT: '必填或格式错误',
};

function getErrorCodeLabel(code?: string) {
  return code ? (ERROR_CODE_LABEL[code] || code) : '必填或格式错误';
}

function isImportFileExpiredError(err: unknown) {
  const anyErr = err as { message?: string; response?: { data?: unknown }; _friendlyMsg?: string } | undefined;
  const raw = JSON.stringify(anyErr?.response?.data || {});
  const msg = `${anyErr?.message || ''} ${anyErr?._friendlyMsg || ''} ${raw}`;
  return msg.includes('IMPORT_FILE_NOT_FOUND');
}

function canDownloadErrorReport(result: ImportJobResult | null) {
  return Boolean(result && (result.status === 'failed' || result.status === 'partially_failed' || result.partial) && result.failRows > 0);
}

export interface FieldMappingOption {
  excelColumn: string;
  systemFieldCode: string;
  systemFieldName: string;
  confidence?: number;
}

export interface FieldMappingResult {
  fileId?: string;
  mapping: FieldMappingOption[];
  availableFields: { field_code: string; field_name: string; is_required?: boolean }[];
  suggestedMapping: Record<string, string>;
  totalRows: number;
  previewRows: Record<string, unknown>[];
  missingRequired?: string[];
  unmatched?: string[];
  unmatchedHeaders?: string[];
  modelUsed?: string;
  fallbackReason?: string | null;
  _rows?: Record<string, unknown>[];
}

export interface ImportWarningItem {
  row?: number;
  field?: string;
  message: string;
  code?: string;
  originalValue?: unknown;
  normalizedValue?: unknown;
}

export interface ValidationErrorItem {
  row: number;
  field?: string;
  message: string;
  code?: string;              // ★ e.g. DUPLICATE_ID_CARD_IN_MONTH
  existedOrderNo?: string;     // ★ 冲突的原工单号
  originalValue?: unknown;
  suggestion?: string;
  autoFixed?: boolean;
  autoFixedValue?: unknown;
  normalizedValue?: unknown;
  level?: 'error' | 'warning';
}

export interface ImportJobResult {
  id: string;
  totalRows: number;
  successRows: number;
  failRows: number;
  warningRows?: number;
  status: 'processing' | 'completed' | 'failed' | 'partially_failed';
  errorReportUrl?: string | null;
  validationErrors?: ValidationErrorItem[];
  topErrors?: ValidationErrorItem[];
  warningDetails?: Array<{ row?: number; field?: string; message: string; code?: string; originalValue?: unknown; normalizedValue?: unknown }>;
  warnings?: string[];
  processedRows?: number;
  errorMessage?: string | null;
  detailMessages?: string[];
  partial?: boolean;           // ★ 部分成功标记
}

interface MappingTableRow {
  key: string;
  excelColumn: string;
  systemFieldCode: string;
  confidence?: number;
  systemFieldName: string;
}

interface ExcelUploaderProps {
  onPreview: (file: File) => Promise<FieldMappingResult>;
  onConfirm: (mapping: Record<string, string>, rows?: Record<string, unknown>[], previewResult?: FieldMappingResult, newFields?: NewFieldDraft[]) => Promise<ImportJobResult>;
  onPollJob?: (jobId: string) => Promise<ImportJobResult>;
  onDownloadErrorReport?: (jobId: string) => void;
}

function getConfidenceBadge(confidence?: number) {
  if (confidence === undefined || confidence === null) return <QuestionCircleOutlined style={{ color: '#999' }} />;
  if (confidence >= 0.9) return <Badge status="success" text={`${Math.round(confidence * 100)}%`} />;
  if (confidence >= 0.7) return <Badge status="warning" text={`${Math.round(confidence * 100)}%`} />;
  return <Badge status="error" text={`${Math.round(confidence * 100)}%`} />;
}

function ExcelUploader({ onPreview, onConfirm, onPollJob, onDownloadErrorReport }: ExcelUploaderProps) {
  const { message } = App.useApp();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mappingResult, setMappingResult] = useState<FieldMappingResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<ImportJobResult | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [newFields, setNewFields] = useState<Record<string, NewFieldDraft>>({});
  const [showAllImportErrors, setShowAllImportErrors] = useState(false);
  const [newFieldModalHeader, setNewFieldModalHeader] = useState<string | null>(null);
  const [newFieldForm] = Form.useForm<{ fieldName: string; fieldType: string; required?: boolean }>();

  const handleUpload: UploadProps['beforeUpload'] = (uploadFile) => {
    if (!uploadFile.name.endsWith('.xlsx') && !uploadFile.name.endsWith('.xls')) {
      setError('仅支持 .xlsx 或 .xls 格式的表格文件');
      return false;
    }
    setFile(uploadFile);
    setStep(1);
    setError(null);
    setLoading(true);
    setMappingResult(null);
    setMapping({});
    setImportResult(null);
    setValidationWarnings([]);
    setNewFields({});
    setShowAllImportErrors(false);

    onPreview(uploadFile)
      .then((result) => {
        setMappingResult(result);
        setMapping({ ...result.suggestedMapping });
        setStep(2);
      })
      .catch((err: Error) => setError(err?.message || '预览失败'))
      .finally(() => setLoading(false));
    return false;
  };

  const handleValidatePrecheck = () => {
    if (!mappingResult) return;

    // 基于实时 mapping state 重算 哪些必填字段仍未映射
    const mappedFieldCodes = new Set(
      Object.values(mapping).filter((v): v is string => !!v && v !== '' && v !== NEW_FIELD_SENTINEL)
    );
    // 反查：同时包含被映射为「新建字段 sentinel」的、且 newFields 里 isRequired=true 的项、也应当作「已满足」？
    // 本轮不动这个路径，只修“已有必填字段」逻辑。

    const requiredFields = mappingResult.availableFields.filter(
      (f) => f.is_required && !DEPRECATED_FIELDS.has(f.field_code),
    );
    const stillMissing = requiredFields.filter((f) => !mappedFieldCodes.has(f.field_code));

    const warnings: string[] = [];
    if (stillMissing.length > 0) {
      warnings.push(`缺少必填字段: ${stillMissing.map((f) => f.field_name).join('、')}`);
    }

    if (warnings.length > 0) {
      setValidationWarnings(warnings);
      message.warning('仍有必填字段未映射，请查看顶部提示');
    } else {
      setValidationWarnings([]);
      handleConfirm();
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setError(null);
    try {
      const newFieldsList = Object.values(newFields).filter((f) => mapping[f.header] === NEW_FIELD_SENTINEL);
      const result = await onConfirm(mapping, mappingResult?._rows, mappingResult ?? undefined, newFieldsList);
      setImportResult(result);
      setShowAllImportErrors(false);

      if (result.status === 'processing' && onPollJob) {
        setStep(3);
        const poll = setInterval(async () => {
          try {
            const updated = await onPollJob(result.id);
            setImportResult(updated);
            if (updated.status === 'completed' || updated.status === 'failed' || updated.status === 'partially_failed') {
              clearInterval(poll);
              setStep(4);
            }
          } catch {
            clearInterval(poll);
            setStep(4);
          }
        }, 3000);
        (window as unknown as Record<string, ReturnType<typeof setInterval>>)._importPoll = poll;
      } else {
        setStep(4);
      }
    } catch (err: unknown) {
      if (isImportFileExpiredError(err)) {
        const expiredMsg = '上传文件已过期，请重新上传表格文件';
        setStep(0);
        setFile(null);
        setMappingResult(null);
        setMapping({});
        setImportResult(null);
        setValidationWarnings([]);
        setError(expiredMsg);
        message.error(expiredMsg);
      } else {
        setError((err as Error)?.message || '确认失败');
      }
    } finally {
      setConfirming(false);
    }
  };

  const handleReset = () => {
    const poll = (window as unknown as Record<string, ReturnType<typeof setInterval>>)._importPoll;
    if (poll) clearInterval(poll);
    setStep(0);
    setMappingResult(null);
    setMapping({});
    setImportResult(null);
    setValidationWarnings([]);
    setError(null);
    setNewFields({});
    setShowAllImportErrors(false);
  };

  const openNewFieldModal = (header: string) => {
    const existing = newFields[header];
    newFieldForm.resetFields();
    newFieldForm.setFieldsValue({
      fieldName: existing?.fieldName ?? header,
      fieldType: existing?.fieldType ?? 'text',
      required: existing?.required ?? false,
    });
    setNewFieldModalHeader(header);
  };

  const handleNewFieldOk = async () => {
    if (!newFieldModalHeader) return;
    const values = await newFieldForm.validateFields();
    const draft: NewFieldDraft = {
      header: newFieldModalHeader,
      fieldName: values.fieldName.trim(),
      fieldType: values.fieldType,
      required: values.required ?? false,
    };
    setNewFields((prev) => ({ ...prev, [newFieldModalHeader]: draft }));
    setMapping((prev) => ({ ...prev, [newFieldModalHeader]: NEW_FIELD_SENTINEL }));
    setNewFieldModalHeader(null);
  };

  const handleNewFieldCancel = () => {
    if (newFieldModalHeader && mapping[newFieldModalHeader] === NEW_FIELD_SENTINEL && !newFields[newFieldModalHeader]) {
      setMapping((prev) => ({ ...prev, [newFieldModalHeader]: '' }));
    }
    setNewFieldModalHeader(null);
  };

  const handleDownloadError = () => {
    if (!importResult) return;
    if (onDownloadErrorReport) {
      onDownloadErrorReport(importResult.id);
      return;
    }
    window.open(importResult.errorReportUrl || `/api/work-orders/import/jobs/${importResult.id}/error-report`, '_blank');
  };

  const mappingColumns: ColumnsType<MappingTableRow> = [
    {
      title: '表格列名', dataIndex: 'excelColumn', key: 'excelColumn', width: 160,
    },
    {
      title: '置信度', dataIndex: 'confidence', key: 'confidence', width: 100,
      render: (_: unknown, record: MappingTableRow) => getConfidenceBadge(record.confidence),
    },
    {
      title: '映射到系统字段', dataIndex: 'systemFieldCode', key: 'systemFieldCode', width: 320,
      render: (_: string, record: MappingTableRow) => {
        const isNewField = record.systemFieldCode === NEW_FIELD_SENTINEL;
        const draft = newFields[record.excelColumn];
        return (
          <Space>
            <Select
              value={record.systemFieldCode}
              onChange={(val: string) => {
                if (val === NEW_FIELD_SENTINEL) {
                  openNewFieldModal(record.excelColumn);
                  return;
                }
                setMapping((prev) => ({ ...prev, [record.excelColumn]: val }));
              }}
              options={[
                { label: '— 不导入 —', value: '' },
                ...(mappingResult?.availableFields || []).map((f) => ({
                  label: (
                    <span>
                      {f.field_name}
                      {f.is_required && <Text type="danger" style={{ marginLeft: 4 }}>*必填</Text>}
                    </span>
                  ),
                  value: f.field_code,
                })),
                {
                  label: (
                    <span style={{ color: '#1677ff' }}>
                      <PlusOutlined /> 新建字段...
                    </span>
                  ),
                  value: NEW_FIELD_SENTINEL,
                },
              ]}
              style={{ width: 240 }}
              allowClear
              placeholder="选择字段或忽略"
            />
            {isNewField && draft && (
              <Tooltip title="编辑新建字段">
                <Tag color="blue" style={{ cursor: 'pointer' }} onClick={() => openNewFieldModal(record.excelColumn)}>
                  新建：{draft.fieldName}
                </Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  const mappingData: MappingTableRow[] =
    mappingResult?.mapping.map((m, i) => ({
      key: `${i}`,
      excelColumn: m.excelColumn,
      systemFieldCode: mapping[m.excelColumn] || '',
      confidence: m.confidence,
      systemFieldName: m.systemFieldName,
    })) || [];

  const processedRows = importResult?.processedRows ?? (importResult ? importResult.successRows + importResult.failRows : 0);
  const warningRows = importResult?.warningRows ?? 0;
  const progressPercent = importResult
    ? importResult.totalRows > 0
      ? Math.round((processedRows / importResult.totalRows) * 100)
      : 0
    : 0;
  const completionPercent = importResult
    ? importResult.totalRows > 0
      ? Math.round((processedRows / importResult.totalRows) * 100)
      : 0
    : 0;
  const resultDetailMessages = importResult?.detailMessages?.filter((item) => Boolean(item?.trim())) || [];
  const allValidationDetails = [
    ...(importResult?.validationErrors || []),
    ...(importResult?.topErrors || []),
  ].filter((item, index, arr) => {
    const key = `${item.row}-${item.field || ''}-${item.message}-${String(item.originalValue ?? '')}-${item.level || ''}`;
    return arr.findIndex((next) => `${next.row}-${next.field || ''}-${next.message}-${String(next.originalValue ?? '')}-${next.level || ''}` === key) === index;
  });
  const importErrorDetails = allValidationDetails.filter((item) => item.level !== 'warning');
  const importWarningDetails = [
    ...(importResult?.warningDetails || []),
    ...allValidationDetails.filter((item) => item.level === 'warning').map((item) => ({
      row: item.row,
      field: item.field,
      message: item.message,
      code: item.code,
      originalValue: item.originalValue,
      normalizedValue: item.normalizedValue ?? item.autoFixedValue,
    })),
  ].filter((item, index, arr) => {
    const key = `${item.row || ''}-${item.field || ''}-${item.message}-${String(item.originalValue ?? '')}-${item.code || ''}`;
    return arr.findIndex((next) => `${next.row || ''}-${next.field || ''}-${next.message}-${String(next.originalValue ?? '')}-${next.code || ''}` === key) === index;
  });
  const displayedImportErrors = showAllImportErrors ? importErrorDetails : importErrorDetails.slice(0, 20);
  const displayedWarningDetails = importWarningDetails.slice(0, 20);
  const importWarnings = importResult?.warnings?.filter((item) => Boolean(item?.trim())) || [];
  const fallbackValidationMessage = importErrorDetails.find((item) => item.message)?.message;
  const primaryErrorMessage = importResult?.errorMessage || resultDetailMessages[0] || fallbackValidationMessage || null;
  const completionPercentText = `${completionPercent}%`;
  const statusIsSuccess = importResult?.status === 'completed' || (importResult?.status === 'partially_failed' && importResult.failRows === 0);
  const displayStatus = statusIsSuccess ? 'completed' : importResult?.status;

  const unmatchedHeaders = mappingResult ? (mappingResult.unmatchedHeaders || mappingResult.unmatched || []) : [];
  const modelUsed = mappingResult?.modelUsed;
  const isFallbackMapping = Boolean(modelUsed?.startsWith('fallback:'));
  const modelLabelMap: Record<string, string> = {
    openai: '默认智能服务', qwen: '通义千问服务', deepseek: '深度求索服务',
  };
  const getModelLabel = (raw: string | undefined) => {
    if (!raw) return '未知';
    if (raw.startsWith('fallback:')) return '本地规则';
    return modelLabelMap[raw] || raw;
  };
  const fallbackReasonText: Record<string, string> = {
    no_api_key: '未配置接口密钥，未启用外部智能服务',
    provider_error: '智能服务不可用或返回异常，已退回本地规则',
    timeout: '智能服务超时，已退回本地规则',
    rate_limit: '智能服务限流，已退回本地规则',
    schema_invalid: '智能服务返回格式不符合要求，已退回本地规则',
  };

  return (
    <Card title="批量导入工单">
      <Steps
        current={step}
        items={[
          { title: '上传文件', icon: <InboxOutlined /> },
          { title: '智能字段映射', icon: <ThunderboltOutlined /> },
          { title: '规则验证', icon: <CheckCircleOutlined /> },
          { title: '导入中', icon: <ReloadOutlined /> },
          { title: '结果', icon: <DownloadOutlined /> },
        ]}
        style={{ marginBottom: 24 }}
      />

      {error && (
        <Alert message={error} type="error" closable onClose={() => setError(null)}
          style={{ marginBottom: 16 }} />
      )}

      {step === 0 && (
        <Dragger accept=".xlsx,.xls" beforeUpload={handleUpload} showUploadList={false} disabled={loading}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽表格文件到此处上传</p>
          <p className="ant-upload-hint">支持 .xlsx 和 .xls 格式，系统会自动识别字段映射</p>
        </Dragger>
      )}

      {step === 1 && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Progress type="circle" percent={99} status="active" />
          <p style={{ marginTop: 16 }}>
            {loading ? '正在解析表头并匹配系统字段...' : '处理中...'}
          </p>
        </div>
      )}

      {step === 2 && mappingResult && (
        <>
          <Alert
            message={isFallbackMapping ? '当前使用本地规则匹配，未使用外部智能服务' : '当前使用智能匹配'}
            description={(
              <Space direction="vertical" size={4}>
                <span>匹配来源：<Tag color={isFallbackMapping ? 'orange' : 'green'}>{getModelLabel(modelUsed)}</Tag></span>
                {mappingResult.fallbackReason && (
                  <span>原因：{fallbackReasonText[mappingResult.fallbackReason] || mappingResult.fallbackReason}</span>
                )}
                {isFallbackMapping && (
                  <span>本地规则已支持常见业务别名，但复杂表头、多行表头或非标准叫法仍建议人工复核。</span>
                )}
              </Space>
            )}
            type={isFallbackMapping ? 'warning' : 'success'}
            showIcon
            style={{ marginBottom: 16 }}
          />

          {unmatchedHeaders.length > 0 && (
            <Alert
              message={`仍有 ${unmatchedHeaders.length} 个表格表头未自动匹配`}
              description={(
                <span>
                  {unmatchedHeaders.map((header) => (
                    <Tag key={header} color="default" style={{ marginBottom: 4 }}>{header}</Tag>
                  ))}
                  请在下方表格中手动选择对应系统字段，或检查表格表头是否为多行、合并单元格或带示例值格式。
                </span>
              )}
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {(() => {
            const missing = filterDeprecatedFields(mappingResult.missingRequired);
            if (missing.length === 0) return null;
            return (
              <Alert
                message="缺少必填字段"
                description={
                  <span>
                    表格中未找到以下必填字段的对应列：
                    {missing.map((code) => {
                      const name = mappingResult.availableFields.find((f) => f.field_code === code)?.field_name || code;
                      return <Tag key={code} color="red" style={{ marginLeft: 4 }}>{name}</Tag>;
                    })}
                    ，请手动补充或确认。
                  </span>
                }
                type="warning" showIcon icon={<WarningOutlined />}
                style={{ marginBottom: 16 }}
              />
            );
          })()}

          {validationWarnings.length > 0 && (
            <Alert
              message="映射校验警告"
              description={validationWarnings.map((w, i) => <div key={i}>{w}</div>)}
              type="warning" showIcon closable
              onClose={() => setValidationWarnings([])}
              style={{ marginBottom: 16 }}
            />
          )}

          <Alert message={`共检测到 ${mappingResult.totalRows} 行数据，${mappingResult.mapping.length} 个表头列`}
            type="info" showIcon style={{ marginBottom: 16 }} />

          <Collapse
            items={[{
              key: 'preview',
              label: `数据预览（前 ${Math.min(mappingResult.previewRows.length, 5)} 行）`,
              children: (
                <Table
                  dataSource={mappingResult.previewRows.slice(0, 5).map((row, i) => ({
                    key: i,
                    ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v ?? '')])),
                  }))}
                  columns={Object.keys(mappingResult.previewRows[0] || {}).map((col) => ({
                    title: col, dataIndex: col, key: col, ellipsis: true,
                  }))}
                  pagination={false} size="small" bordered scroll={{ x: 'max-content' }}
                />
              ),
            }]}
            style={{ marginBottom: 16 }}
          />

          <Table
            columns={mappingColumns}
            dataSource={mappingData}
            pagination={false}
            size="small"
            bordered
            style={{ marginBottom: 16 }}
            scroll={{ y: 400 }}
          />

          <Space>
            <Button type="primary" onClick={handleValidatePrecheck}
              loading={confirming} icon={<CheckCircleOutlined />}>
              验证并导入
            </Button>
            <Button onClick={handleReset}>重新上传</Button>
          </Space>
        </>
      )}

      {step === 3 && importResult && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Progress type="circle" percent={progressPercent} status="active" />
          <Descriptions column={2} bordered size="small" style={{ marginTop: 16, maxWidth: 400, margin: '16px auto' }}>
            <Descriptions.Item label="总行数">{importResult.totalRows}</Descriptions.Item>
            <Descriptions.Item label="已处理">
              {importResult.processedRows ?? importResult.successRows + importResult.failRows}
            </Descriptions.Item>
            <Descriptions.Item label="成功">
              <Text type="success">{importResult.successRows}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="失败">
              <Text type="danger">{importResult.failRows}</Text>
            </Descriptions.Item>
          </Descriptions>
          <p style={{ marginTop: 12, color: '#999' }}>正在逐行校验并创建工单...</p>
          <Button size="small" onClick={handleReset} icon={<CloseCircleOutlined />} danger>
            取消
          </Button>
        </div>
      )}

      {step === 4 && importResult && (
        <>
          <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="任务编号">{importResult.id}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={displayStatus === 'completed' ? 'success' : displayStatus === 'partially_failed' ? 'warning' : 'error'}>
                {displayStatus === 'completed' ? '导入成功' : displayStatus === 'partially_failed' ? '部分失败' : '失败'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="总行数">{importResult.totalRows}</Descriptions.Item>
            <Descriptions.Item label="成功行数">
              <Text type="success" strong>{importResult.successRows}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="失败行数">
              <Text type="danger" strong>{importResult.failRows}</Text>
            </Descriptions.Item>
            {warningRows > 0 && (
              <Descriptions.Item label="警告行数">
                <Text type="warning" strong>{warningRows}</Text>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="完成率">
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <Progress
                  percent={completionPercent}
                  status={importResult.status === 'failed' ? 'exception' : importResult.status === 'processing' ? 'active' : (importResult.failRows > 0 ? 'exception' : 'success')}
                  size="small"
                />
                <Text type="secondary">已处理 {processedRows}/{importResult.totalRows} 行，完成率 {completionPercentText}</Text>
              </Space>
            </Descriptions.Item>
          </Descriptions>

          {(importResult.failRows > 0 || importResult.status === 'failed' || importResult.status === 'partially_failed') && primaryErrorMessage && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message={primaryErrorMessage}
              description={resultDetailMessages.length > 1 ? (
                <Space direction="vertical" size={4}>
                  {resultDetailMessages.slice(1, 5).map((item) => <div key={item}>{item}</div>)}
                </Space>
              ) : undefined}
            />
          )}

          {importWarnings.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="系统兼容与警告提示"
              description={(
                <Space direction="vertical" size={4}>
                  {importWarnings.map((item, index) => <div key={`warn-${index}`}>{item}</div>)}
                </Space>
              )}
            />
          )}

          {importWarningDetails.length > 0 && (
            <Card size="small" title={`警告明细（共 ${importWarningDetails.length} 条）`} style={{ marginBottom: 16 }}>
              <Table
                dataSource={displayedWarningDetails.map((e, i) => ({ key: `${e.row || 'row'}-${e.field || 'field'}-${e.code || 'code'}-${i}`, ...e }))}
                columns={[
                  { title: '行号', dataIndex: 'row', key: 'row', width: 80, render: (v: number | undefined) => v ? `第 ${v} 行` : '—' },
                  { title: '字段', dataIndex: 'field', key: 'field', width: 160, render: (v: string | undefined) => v || '整行' },
                  { title: '提示信息', dataIndex: 'message', key: 'message', render: (v: string) => v || '系统警告' },
                  { title: '默认值', dataIndex: 'normalizedValue', key: 'normalizedValue', width: 180, render: (v: unknown) => {
                    if (v === undefined || v === null || v === '') return <Text type="secondary">-</Text>;
                    return <Text>{String(v)}</Text>;
                  } },
                  { title: 'code', dataIndex: 'code', key: 'code', width: 140, render: (v: string | undefined) => v || '—' },
                ]}
                pagination={false}
                size="small"
                bordered
                scroll={{ x: 'max-content' }}
              />
            </Card>
          )}

          {importErrorDetails.length > 0 && (
            <Card
              size="small"
              title={`失败原因明细（共 ${importErrorDetails.length} 条，页面先展示 ${displayedImportErrors.length} 条）`}
              extra={importErrorDetails.length > 20 ? (
                <Button type="link" size="small" onClick={() => setShowAllImportErrors((prev) => !prev)}>
                  {showAllImportErrors ? '收起错误明细' : '展开全部错误'}
                </Button>
              ) : null}
              style={{ marginBottom: 16 }}
            >
              <Table
                dataSource={displayedImportErrors.map((e, i) => ({ key: `${e.row}-${e.field || 'field'}-${i}`, ...e }))}
                columns={[
                  { title: '行号', dataIndex: 'row', key: 'row', width: 80, render: (v: number) => v ? `第 ${v} 行` : '—' },
                  { title: '字段', dataIndex: 'field', key: 'field', width: 160, render: (v: string | undefined) => v || '整行' },
                  { title: '原因', dataIndex: 'message', key: 'message', render: (v: string, record: ValidationErrorItem) => (
                    <Space direction="vertical" size={2}>
                      <span>{v || getErrorCodeLabel(record.code)}</span>
                      {record.code && <Tag color={record.level === 'warning' ? 'gold' : 'orange'}>{getErrorCodeLabel(record.code)}</Tag>}
                      {record.existedOrderNo && (
                        <Tag color="blue" style={{ cursor: 'pointer' }} onClick={() => window.open(`/work-orders/${record.existedOrderNo}`, '_blank')}>
                          冲突工单：{record.existedOrderNo}
                        </Tag>
                      )}
                    </Space>
                  ) },
                  { title: '原始值', dataIndex: 'originalValue', key: 'originalValue', width: 180, render: (v: unknown) => {
                    if (v === undefined || v === null || v === '') return <Text type="secondary">未填写</Text>;
                    return <Text>{String(v)}</Text>;
                  } },
                  { title: '建议修正/系统提示', dataIndex: 'suggestion', key: 'suggestion', render: (v: string | undefined, record: ValidationErrorItem) => {
                    if (record.autoFixed) {
                      return <Text type="success">系统已自动兼容{record.autoFixedValue !== undefined ? `为“${String(record.autoFixedValue)}”` : ''}，请复核后重新导入。</Text>;
                    }
                    return v ? <Text>{v}</Text> : <Text type="secondary">请按原因修正该单元格后重新导入。</Text>;
                  } },
                ]}
                pagination={false}
                size="small"
                bordered
                scroll={{ x: 'max-content' }}
              />
              {importErrorDetails.length > 20 && !showAllImportErrors && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginTop: 12 }}
                  message={`错误较多，当前仅展示前 20 条；还有 ${importErrorDetails.length - 20} 条可点击“展开全部错误”查看。`}
                />
              )}
            </Card>
          )}

          <Space>
            {displayStatus === 'completed' && importResult.failRows === 0 && (
              <Alert message="导入成功！工单已进入派发流程。" type="success" showIcon style={{ flex: 1 }} />
            )}
            {importResult.failRows > 0 && (
              <Alert
                message={`${importResult.failRows} 行导入失败`}
                description="失败原因已在页面直接展示，请根据行号、字段、原始值和建议修正后重新导入；错误报告仅作为辅助下载。"
                type="warning" showIcon style={{ flex: 1 }}
                action={
                  <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadError}
                    disabled={!canDownloadErrorReport(importResult)}>
                    下载错行报告
                  </Button>
                }
              />
            )}
          </Space>
          <Space style={{ marginTop: 16 }}>
            <Button type="primary" onClick={handleReset} icon={<ReloadOutlined />}>继续导入</Button>
          </Space>
        </>
      )}

      <Modal
        title={`新建字段（来自表头：${newFieldModalHeader ?? ''}）`}
        open={newFieldModalHeader !== null}
        onOk={handleNewFieldOk}
        onCancel={handleNewFieldCancel}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form layout="vertical" form={newFieldForm}>
          <Form.Item
            name="fieldName"
            label="字段名称"
            rules={[{ required: true, message: '请输入字段名称' }, { max: 100, message: '不超过 100 字符' }]}
          >
            <Input placeholder="如：紧急联系人" />
          </Form.Item>
          <Form.Item
            name="fieldType"
            label="字段类型"
            rules={[{ required: true, message: '请选择字段类型' }]}
          >
            <Select options={FIELD_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="required" label="是否必填" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

export default ExcelUploader;
export type { ExcelUploaderProps };
