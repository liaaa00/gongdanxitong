import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { App, Button, Empty, Modal, Space, Table, Tag, Typography, Upload } from 'antd';
import { DownloadOutlined, EyeOutlined, InboxOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import {
  CERTIFICATE_STATUS_FILTER_META,
  IN_SERVICE_BUSINESS_TYPE_OPTIONS,
  IN_SERVICE_HANDLE_CHANNEL_META,
  IN_SERVICE_ORDER_KINDS,
  IN_SERVICE_ORDER_KIND_META,
  IN_SERVICE_STATUS_META,
  PROVINCES_27,
  getInServiceCategoryPath,
  getInServiceStatusMeta,
  type InServiceBusinessType,
  type InServiceOrderKind,
  type InServiceOrderStatus,
} from '@/constants/inService';
import {
  createBatchRenewalOrders,
  getInServiceOrders,
  type InServiceOrder,
  type InServiceOrderListQuery,
  type InServiceOrderPayload,
} from '@/services/inServiceOrders';
import { getCustomers, type CustomerItem } from '@/services/customers';
import { getDepartments, type DepartmentItem } from '@/services/departments';
import { ROLE, canonicalRoleCodes } from '@/constants/roles';
import { useUserStore } from '@/stores/userStore';

interface TableParams extends Record<string, unknown> {
  current?: number;
  pageSize?: number;
  keyword?: string;
  province?: string;
  status?: string;
  businessType?: string;
  createdAt?: [string, string];
}

interface InServiceOrderListProps {
  orderKind?: InServiceOrderKind;
  createPath?: string;
  businessScope?: 'beilun' | 'out_of_province';
}

export interface BatchRenewalPreviewRow {
  rowNumber: number;
  customerName: string;
  departmentName: string;
  employeeName: string;
  idCardNo: string;
  contractTermType: string;
  contractStartDate: string;
  contractEndDate: string;
  baseSalary: number | null;
  error: string | null;
  payload: InServiceOrderPayload | null;
}

const BATCH_RENEWAL_HEADERS = [
  '客户名称',
  '发起部门',
  '姓名',
  '证件号码',
  '合同期限形式',
  '合同开始日期',
  '合同结束日期',
  '基本工资',
];

function getExcelCell(row: Record<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && row[alias] !== '') return row[alias];
  }
  return '';
}

function toCellText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

function toExcelDate(value: unknown): string {
  if (value instanceof Date) return dayjs(value).format('YYYY-MM-DD');
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return '';
    return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = toCellText(value);
  if (!text) return '';
  const parsed = dayjs(text);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '';
}

function matchesValue(value: string, candidates: Array<string | undefined>): boolean {
  return candidates.some((candidate) => candidate?.trim() === value);
}

export function flattenDepartments(departments: DepartmentItem[]): DepartmentItem[] {
  return departments.flatMap((department) => [
    department,
    ...flattenDepartments(department.children ?? []),
  ]);
}

export function buildBatchRenewalRows(
  rawRows: Array<Record<string, unknown>>,
  customers: CustomerItem[],
  departments: DepartmentItem[],
): BatchRenewalPreviewRow[] {
  return rawRows
    .filter((row) => Object.values(row).some((value) => toCellText(value)))
    .map((row, index) => {
      const customerName = toCellText(getExcelCell(row, ['客户名称', '客户全称', '客户编码']));
      const departmentName = toCellText(getExcelCell(row, ['发起部门', '部门名称', '部门编码']));
      const employeeName = toCellText(getExcelCell(row, ['姓名', '员工姓名']));
      const idCardNo = toCellText(getExcelCell(row, ['证件号码', '证件号', '身份证号']));
      const contractTermType = toCellText(getExcelCell(row, ['合同期限形式', '合同期限类型']));
      const startSource = getExcelCell(row, ['合同开始日期', '合同起始日期']);
      const endSource = getExcelCell(row, ['合同结束日期']);
      const contractStartDate = toExcelDate(startSource);
      const contractEndDate = toExcelDate(endSource);
      const salaryText = toCellText(getExcelCell(row, ['基本工资', '续签基本工资'])).replace(/[,，￥¥\s]/g, '');
      const baseSalary = salaryText && Number.isFinite(Number(salaryText)) ? Number(salaryText) : null;
      const customerMatches = customers.filter((item) => matchesValue(customerName, [
        item.id,
        item.customer_name,
        item.customer_code,
        item.customerName,
        item.customerCode,
      ]));
      const departmentMatches = departments.filter((item) => matchesValue(departmentName, [
        item.id,
        item.name,
        item.code,
      ]));
      const errors: string[] = [];

      if (!customerName) errors.push('客户名称不能为空');
      else if (customerMatches.length === 0) errors.push('客户不存在');
      else if (customerMatches.length > 1) errors.push('客户名称不唯一，请使用客户编码');
      if (!departmentName) errors.push('发起部门不能为空');
      else if (departmentMatches.length === 0) errors.push('部门不存在');
      else if (departmentMatches.length > 1) errors.push('部门名称不唯一，请使用部门编码');
      if (!employeeName) errors.push('姓名不能为空');
      if (!idCardNo) errors.push('证件号码不能为空');
      if (!['固定期限', '无固定期限'].includes(contractTermType)) errors.push('合同期限形式无效');
      if (!toCellText(startSource)) errors.push('合同开始日期不能为空');
      else if (!contractStartDate) errors.push('合同开始日期无效');
      if (contractTermType === '固定期限' && !toCellText(endSource)) errors.push('固定期限必须填写合同结束日期');
      else if (toCellText(endSource) && !contractEndDate) errors.push('合同结束日期无效');
      if (baseSalary === null || baseSalary <= 0) errors.push('基本工资必须大于0');

      const payload = errors.length === 0 ? {
        customerId: customerMatches[0].id,
        departmentId: departmentMatches[0].id,
        employeeName,
        idCardNo,
        extraData: {
          signing_method: '续签',
          contract_term_type: contractTermType,
          contract_start_date: contractStartDate,
          contract_end_date: contractEndDate || null,
          base_salary: baseSalary,
        },
      } satisfies InServiceOrderPayload : null;

      return {
        rowNumber: index + 2,
        customerName,
        departmentName,
        employeeName,
        idCardNo,
        contractTermType,
        contractStartDate,
        contractEndDate,
        baseSalary,
        error: errors.length > 0 ? errors.join('；') : null,
        payload,
      };
    });
}

function downloadBatchRenewalTemplate(): void {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([BATCH_RENEWAL_HEADERS]);
  worksheet['!cols'] = [
    { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 22 },
    { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, '批量续签');
  XLSX.writeFile(workbook, '劳动合同批量续签导入模板.xlsx');
}

export function getInServiceStatusValueEnum(orderKind: InServiceOrderKind) {
  const source = orderKind === IN_SERVICE_ORDER_KINDS.CERTIFICATE
    ? CERTIFICATE_STATUS_FILTER_META
    : IN_SERVICE_STATUS_META;
  return Object.fromEntries(
    Object.entries(source).map(([value, item]) => [value, { text: item.label }]),
  );
}
const provinceValueEnum = Object.fromEntries(PROVINCES_27.map((value) => [value, { text: value }]));
const businessTypeValueEnum = Object.fromEntries(
  IN_SERVICE_BUSINESS_TYPE_OPTIONS.map((item) => [item.value, { text: item.label }]),
);

export function buildInServiceListQuery(
  params: TableParams,
  orderKind?: InServiceOrderKind,
  businessScope?: 'beilun' | 'out_of_province',
): InServiceOrderListQuery {
  const [createdFrom, createdTo] = params.createdAt || [];
  return {
    page: Number(params.current || 1),
    pageSize: Number(params.pageSize || 20),
    orderKind,
    businessScope,
    keyword: params.keyword ? String(params.keyword) : undefined,
    province: params.province as InServiceOrderListQuery['province'],
    status: params.status as InServiceOrderStatus | undefined,
    businessType: params.businessType as InServiceBusinessType | undefined,
    createdFrom: createdFrom ? dayjs(createdFrom).startOf('day').toISOString() : undefined,
    createdTo: createdTo ? dayjs(createdTo).endOf('day').toISOString() : undefined,
  };
}

export default function InServiceOrderList({
  orderKind = IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS,
  createPath = '/in-service/new',
  businessScope,
}: InServiceOrderListProps) {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchRows, setBatchRows] = useState<BatchRenewalPreviewRow[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const user = useUserStore((state) => state.user);
  const roleCodes = canonicalRoleCodes(user?.roles);
  const meta = IN_SERVICE_ORDER_KIND_META[orderKind];
  const isSingleBusiness = orderKind === IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS;
  const statusValueEnum = useMemo(() => getInServiceStatusValueEnum(orderKind), [orderKind]);
  const canCreate = roleCodes.some((role) => [
    ROLE.ADMIN,
    ROLE.BUSINESS_GROUP_LEADER,
    ROLE.BUSINESS_GROUP_MEMBER,
  ].includes(role as typeof ROLE.ADMIN));

  const parseBatchRenewalFile = async (file: File) => {
    setBatchLoading(true);
    setBatchRows([]);
    try {
      const [customerResult, departments] = await Promise.all([
        getCustomers({ page: 1, pageSize: 1000 }),
        getDepartments(),
      ]);
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) throw new Error('Excel 中没有可读取的工作表');
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
      const rows = buildBatchRenewalRows(rawRows, customerResult.list, flattenDepartments(departments));
      if (rows.length === 0) throw new Error('Excel 中没有续签资料');
      if (rows.length > 100) throw new Error('单次最多导入 100 条续签资料');
      setBatchRows(rows);
      if (rows.some((row) => row.error)) message.warning('部分行校验未通过，请修正 Excel 后重新上传');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Excel 解析失败');
    } finally {
      setBatchLoading(false);
    }
  };

  const createButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(createPath)}>
      {meta.createTitle}
    </Button>
  );
  const batchButton = orderKind === IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL ? (
    <Button icon={<UploadOutlined />} onClick={() => { setBatchRows([]); setBatchOpen(true); }}>
      批量发起续签
    </Button>
  ) : null;

  const columns = useMemo<ProColumns<InServiceOrder>[]>(() => {
    const result: ProColumns<InServiceOrder>[] = [
      {
        title: '关键词',
        dataIndex: 'keyword',
        hideInTable: true,
        fieldProps: { placeholder: '工单号、姓名、证件号、客户或发起人' },
      },
      {
        title: '工单编号',
        dataIndex: 'orderNo',
        width: 190,
        copyable: true,
        hideInSearch: true,
        fixed: 'left',
      },
    ];
    if (!isSingleBusiness) {
      result.push({
        title: '员工',
        dataIndex: 'employeeName',
        width: 150,
        hideInSearch: true,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{record.employeeName || '-'}</Typography.Text>
            <Typography.Text type="secondary">{record.idCardNo || '-'}</Typography.Text>
          </Space>
        ),
      });
    }
    result.push(
      {
        title: '客户全称',
        dataIndex: 'customerName',
        width: 190,
        hideInSearch: true,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{record.customerName || record.customerId}</Typography.Text>
            {record.customerCode ? <Typography.Text type="secondary">{record.customerCode}</Typography.Text> : null}
          </Space>
        ),
      },
    );
    if (isSingleBusiness) {
      result.push(
        {
          title: '办理事由',
          dataIndex: 'businessReason',
          width: 190,
          hideInSearch: true,
          ellipsis: true,
        },
        {
          title: '业务分类',
          dataIndex: 'businessType',
          width: 240,
          valueEnum: businessTypeValueEnum,
          render: (_, record) => getInServiceCategoryPath(record.businessType, record.processType, record.requirementType),
        },
      );
    }
    result.push(
      {
        title: businessScope === 'out_of_province' ? '参保地' : '办理地',
        dataIndex: 'province',
        width: 160,
        valueEnum: provinceValueEnum,
        render: (_, record) => [record.province, record.city, record.district].filter(Boolean).join(' / ') || '-',
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 170,
        valueEnum: statusValueEnum,
        render: (_, record) => {
          const item = getInServiceStatusMeta(record.orderKind, record.status) || { label: record.status, color: 'default' };
          return <Tag color={item.color}>{item.label}</Tag>;
        },
      },
      {
        title: '办理渠道',
        dataIndex: 'handleChannel',
        width: 110,
        hideInSearch: true,
        render: (_, record) => {
          if (!['processing', 'completed', 'failed'].includes(record.status)) return '-';
          const item = IN_SERVICE_HANDLE_CHANNEL_META[record.handleChannel];
          return <Tag color={item.color}>{item.label}</Tag>;
        },
      },
      {
        title: '配置负责人',
        dataIndex: 'handlerName',
        width: 130,
        hideInSearch: true,
        render: (_, record) => record.handlerName || record.handlerId || '待配置',
      },
      {
        title: '发起人',
        dataIndex: 'createdByName',
        width: 120,
        hideInSearch: true,
        render: (_, record) => record.createdByName || record.createdBy,
      },
      {
        title: '创建时间',
        dataIndex: 'createdAt',
        width: 165,
        valueType: 'dateRange',
        render: (_, record) => dayjs(record.createdAt).format('YYYY-MM-DD HH:mm'),
      },
      {
        title: '操作',
        key: 'actions',
        width: 96,
        hideInSearch: true,
        fixed: 'right',
        render: (_, record) => (
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate('/in-service/' + record.id)}>
            详情
          </Button>
        ),
      },
    );
    return result;
  }, [businessScope, isSingleBusiness, navigate, orderKind, statusValueEnum]);

  return (
    <PageContainer header={{ title: meta.listTitle }}>
      <ProTable<InServiceOrder, TableParams>
        actionRef={actionRef}
        rowKey="id"
        headerTitle={meta.label + '工单'}
        columns={columns}
        request={async (params) => {
          const result = await getInServiceOrders(buildInServiceListQuery(params, orderKind, businessScope));
          return { data: result.items, total: result.total, success: true };
        }}
        search={{ labelWidth: 'auto', defaultCollapsed: false }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        scroll={{ x: isSingleBusiness ? 1900 : 1500 }}
        options={{ reload: true, density: true, setting: true }}
        locale={{
          emptyText: (
            <Empty description={'暂无' + meta.label + '工单'}>
              {canCreate ? createButton : null}
            </Empty>
          ),
        }}
        toolBarRender={() => canCreate ? [
          <span key="new">{createButton}</span>,
          batchButton ? <span key="batch">{batchButton}</span> : null,
        ].filter(Boolean) as React.ReactNode[] : []}
      />
      {batchButton ? (
        <Modal
          title="批量发起续签"
          open={batchOpen}
          width={1000}
          confirmLoading={batchLoading}
          okText={batchRows.length > 0 ? `发起 ${batchRows.length} 条续签` : '发起续签'}
          okButtonProps={{ disabled: batchRows.length === 0 || batchRows.some((row) => Boolean(row.error)) }}
          onCancel={() => setBatchOpen(false)}
          onOk={async () => {
            const payloads = batchRows
              .map((row) => row.payload)
              .filter((payload): payload is InServiceOrderPayload => Boolean(payload));
            if (payloads.length !== batchRows.length) return;
            setBatchLoading(true);
            try {
              await createBatchRenewalOrders(payloads);
              message.success(`已发起 ${payloads.length} 条续签`);
              setBatchOpen(false);
              setBatchRows([]);
              actionRef.current?.reload();
            } catch (error) {
              message.error(error instanceof Error ? error.message : '批量续签失败');
            } finally {
              setBatchLoading(false);
            }
          }}
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Button icon={<DownloadOutlined />} onClick={downloadBatchRenewalTemplate}>
              下载 Excel 模板
            </Button>
            <Upload.Dragger
              accept=".xlsx,.xls"
              disabled={batchLoading}
              showUploadList={false}
              beforeUpload={(file) => {
                void parseBatchRenewalFile(file);
                return Upload.LIST_IGNORE;
              }}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">点击或拖拽 Excel 文件</p>
            </Upload.Dragger>
            {batchRows.length > 0 ? (
              <Table<BatchRenewalPreviewRow>
                size="small"
                rowKey="rowNumber"
                pagination={false}
                scroll={{ x: 1050, y: 320 }}
                dataSource={batchRows}
                columns={[
                  { title: '行', dataIndex: 'rowNumber', width: 60, fixed: 'left' },
                  { title: '客户', dataIndex: 'customerName', width: 170 },
                  { title: '部门', dataIndex: 'departmentName', width: 130 },
                  { title: '姓名', dataIndex: 'employeeName', width: 100 },
                  { title: '证件号码', dataIndex: 'idCardNo', width: 180 },
                  { title: '期限形式', dataIndex: 'contractTermType', width: 110 },
                  { title: '开始日期', dataIndex: 'contractStartDate', width: 110 },
                  { title: '结束日期', dataIndex: 'contractEndDate', width: 110, render: (value: string) => value || '-' },
                  { title: '基本工资', dataIndex: 'baseSalary', width: 100, render: (value: number | null) => value ?? '-' },
                  {
                    title: '校验',
                    dataIndex: 'error',
                    width: 260,
                    fixed: 'right',
                    render: (value: string | null) => value
                      ? <Typography.Text type="danger">{value}</Typography.Text>
                      : <Tag color="success">通过</Tag>,
                  },
                ]}
              />
            ) : null}
          </Space>
        </Modal>
      ) : null}
    </PageContainer>
  );
}
