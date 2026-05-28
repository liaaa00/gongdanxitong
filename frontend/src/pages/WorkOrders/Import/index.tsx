import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import { Card, Alert, Button, Space, App } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import ExcelUploader from '@/components/ExcelUploader';
import type { FieldMappingResult, ImportJobResult, NewFieldDraft } from '@/components/ExcelUploader';
import { previewImport, confirmImport, getImportJob, downloadImportErrorReport, downloadCurrentImportTemplate } from '@/services/workOrders';

const WorkOrdersImport: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();

  const handleDownloadTemplate = async () => {
    try {
      const result = await downloadCurrentImportTemplate('onboarding');
      message.success(`已按当前字段配置生成模板（${result.fieldCount} 个字段）`);
    } catch (error) {
      if ((error as Error)?.message === 'NO_FIELDS') {
        message.warning('当前没有可用字段配置，无法生成导入模板');
        return;
      }
      message.error('下载模板失败，请稍后重试或联系管理员检查字段配置');
    }
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
              <span>上传后系统会按规则拆为数据录入、社保公积金办理、入职联系、劳动合同签订等子工单。</span>
              <span>模板按当前字段配置生成；管理员调整字段后，请重新下载最新模板。</span>
            </Space>
          )}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>下载当前字段模板</Button>
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
