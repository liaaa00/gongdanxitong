import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import { Card, Button, Space, App } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import ExcelUploader from '@/components/ExcelUploader';
import type { FieldMappingResult, ImportJobResult, NewFieldDraft } from '@/components/ExcelUploader';
import { previewImport, confirmImport, getImportJob, downloadImportErrorReport, downloadCurrentImportTemplate } from '@/services/workOrders';

const ORDER_TYPE_LABEL: Record<string, string> = {
  onboarding: '入职',
  resignation: '离职',
};

const WorkOrdersImport: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();

  const orderType = useMemo(() => {
    const value = new URLSearchParams(location.search).get('orderType');
    return value === 'resignation' ? 'resignation' : 'onboarding';
  }, [location.search]);
  const moduleLabel = ORDER_TYPE_LABEL[orderType];

  const handleDownloadTemplate = async () => {
    try {
      const result = await downloadCurrentImportTemplate(orderType);
      message.success(`已按当前字段配置生成${moduleLabel}模板（${result.fieldCount} 个字段）`);
    } catch (error) {
      if ((error as Error)?.message === 'NO_FIELDS') {
        message.warning(`当前没有可用${moduleLabel}字段配置，无法生成导入模板`);
        return;
      }
      message.error('下载模板失败，请稍后重试或联系管理员检查字段配置');
    }
  };

  const handleDownloadErrorReport = (jobId: string) => {
    downloadImportErrorReport(jobId);
  };

  const handlePreview = async (file: File): Promise<FieldMappingResult> => {
    return await previewImport(file, orderType);
  };

  const handleConfirm = async (
    mapping: Record<string, string>,
    rows?: Record<string, unknown>[],
    previewResult?: FieldMappingResult,
    newFields?: NewFieldDraft[],
  ): Promise<ImportJobResult> => {
    const job = await confirmImport(mapping, rows, previewResult?.fileId, newFields, orderType);
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
    <PageContainer header={{ title: `${moduleLabel}导入` }}>
      <Card>
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
          <Button onClick={() => navigate(`/work-orders?orderType=${orderType}`)}>返回{moduleLabel}主工单列表</Button>
        </Space>
      </Card>
    </PageContainer>
  );
};

export default WorkOrdersImport;
