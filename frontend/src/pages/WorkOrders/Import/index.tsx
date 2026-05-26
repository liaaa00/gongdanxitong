import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import { Card, Alert, Button, Space, App } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import ExcelUploader from '@/components/ExcelUploader';
import type { FieldMappingResult, ImportJobResult, NewFieldDraft } from '@/components/ExcelUploader';
import { previewImport, confirmImport, getImportJob, downloadImportErrorReport } from '@/services/workOrders';

const ONBOARDING_TEMPLATE_HEADERS = [
  '客户名称', '客户代码', '外包类型', '岗位', '姓名', '身份证号码（护照）', '性别', '出生日期', '年龄', '户籍性质',
  '民族', '移动电话', '电子邮件', '现住地址', '户籍地址', '邮编', '合同期限形式', '合同期限', '合同开始日期', '合同终止日期',
  '试用期开始日期', '试用期（月）', '试用期结束日期', '工作城市', '工时制', '工作制周期', '工资形式', '基本工资', '其他工资', '试用期工资',
  '发薪周期', '发薪日期', '参保地', '起始月', '社保基数', '公积金基数', '公积金比例', '开户银行信息', '银行借记卡帐号', '备注',
  '业务模式', '人员类型', '是否企服发起劳动合同', '劳动合同主体', '劳动合同模板（标准模板 / 特殊模板）', '劳动合同签署是否需要催办员工', '劳动合同签订反馈',
  '入职材料是否需要集约收集', '入职联系反馈', '是否企服发薪', '发薪地', '特殊备注', '数据录入反馈',
];

const ONBOARDING_TEMPLATE_EXAMPLE = [
  '阿里巴巴', 'CH2688', '风险后置', '行政岗', '李田', '430921198702020118', '男', '1987-02-02', '39', '非农业',
  '汉族', '13277668899', '13421231@qq.com', '浙江省杭州市西湖区杭大路嘉华中心805', '浙江省杭州市西湖区杭大路嘉华中心805', '518000', '固定期限', '2年', '2026-04-01', '2028-04-01',
  '2026-04-01', '3个月', '2026-07-01', '杭州', '标准工时制', '1年', '按月', 8000, 1000, 7000,
  '当月', '15号', '杭州', '4月', 8000, 8000, '5%+5%', '工商银行杭州西湖区支行', '3560999913682123', '',
  '北仑自营', '全日制', '是', '外服（浙江）企业服务有限公司', '标准模板', '是', '',
  '是', '', '是', '北仑杭州分发薪', '', '',
];

const WorkOrdersImport: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();

  const handleDownloadTemplate = () => {
    const worksheet = XLSX.utils.aoa_to_sheet([ONBOARDING_TEMPLATE_HEADERS, ONBOARDING_TEMPLATE_EXAMPLE]);
    worksheet['!cols'] = ONBOARDING_TEMPLATE_HEADERS.map((header) => ({ wch: Math.max(12, Math.min(24, header.length + 4)) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '浙江企服增员信息表');
    XLSX.writeFile(workbook, '浙江企服增员信息表-入职导入模板.xlsx');
  };

  const handleDownloadErrorReport = (jobId: string) => {
    downloadImportErrorReport(jobId);
  };

  const handlePreview = async (file: File): Promise<FieldMappingResult> => {
    return await previewImport(file);
  };

  const handleConfirm = async (
    mapping: Record<string, string>,
    rows?: Record<string, unknown>[],
    previewResult?: FieldMappingResult,
    newFields?: NewFieldDraft[],
  ): Promise<ImportJobResult> => {
    const job = await confirmImport(mapping, rows, previewResult?.fileId, newFields);
    return {
      id: job.id,
      totalRows: job.total_rows,
      successRows: job.success_rows,
      failRows: job.fail_rows,
      warningRows: job.warning_rows,
      status: job.status,
      errorReportUrl: job.error_report_url,
      validationErrors: job.validation_errors,
      topErrors: job.top_errors,
      warningDetails: job.warning_details,
      warnings: job.warnings,
      processedRows: job.processed_rows,
      errorMessage: job.error_message,
      detailMessages: job.detail_messages,
      partial: job.partial,
    };
  };

  const handlePollJob = async (jobId: string): Promise<ImportJobResult> => {
    const job = await getImportJob(jobId);
    return {
      id: job.id,
      totalRows: job.total_rows,
      successRows: job.success_rows,
      failRows: job.fail_rows,
      warningRows: job.warning_rows,
      processedRows: job.processed_rows,
      status: job.status,
      errorReportUrl: job.error_report_url,
      validationErrors: job.validation_errors,
      topErrors: job.top_errors,
      warningDetails: job.warning_details,
      warnings: job.warnings,
      errorMessage: job.error_message,
      detailMessages: job.detail_messages,
      partial: job.partial,
    };
  };

  return (
    <PageContainer header={{ title: '批量导入工单' }}>
      <Card>
        <Alert
          message="导入前请确认"
          description={(
            <Space direction="vertical" size={4}>
              <span>只允许导入你名下客户的入职工单。</span>
              <span>身份证 + 入职月份不可重复，重复行会在错行报告中标出。</span>
              <span>上传后系统会按规则拆为 4 个子工单：数据录入、社保公积金办理、入职联系、劳动合同签订。</span>
            </Space>
          )}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>下载入职模板</Button>
        </Space>
        <ExcelUploader
          onPreview={handlePreview}
          onConfirm={handleConfirm}
          onPollJob={handlePollJob}
          onDownloadErrorReport={handleDownloadErrorReport}
        />
        <Space style={{ marginTop: 16 }}>
          <Button onClick={() => navigate('/work-orders')}>返回工单列表</Button>
        </Space>
      </Card>
    </PageContainer>
  );
};

export default WorkOrdersImport;
