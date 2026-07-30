import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import { Alert, App, Button, Card, Segmented, Space } from 'antd';
import ExcelUploader from '@/components/ExcelUploader';
import type { FieldMappingResult, ImportJobResult, NewFieldDraft } from '@/components/ExcelUploader';
import {
  confirmOutOfProvinceImport,
  downloadOutOfProvinceImportErrorReport,
  getOutOfProvinceImportJob,
  OUT_OF_PROVINCE_ORDER_TYPE,
  previewOutOfProvinceImport,
  type OutOfProvinceOrderType,
} from '@/services/outOfProvince';
import type { ImportJob } from '@/services/workOrders';

function toUploadJob(job: ImportJob): ImportJobResult {
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
}

const OutOfProvinceImport: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [orderType, setOrderType] = useState<OutOfProvinceOrderType>(OUT_OF_PROVINCE_ORDER_TYPE.INCREASE);

  const handleConfirm = async (
    mapping: Record<string, string>,
    _rows?: Record<string, unknown>[],
    previewResult?: FieldMappingResult,
    newFields?: NewFieldDraft[],
  ): Promise<ImportJobResult> => toUploadJob(await confirmOutOfProvinceImport(
    mapping,
    previewResult?.fileId,
    orderType,
    newFields,
  ));

  return (
    <PageContainer header={{ title: '省外增减员导入' }}>
      <Card>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="省外导入与北仑数据独立"
            description="增员和减员需分开导入；Excel 每条记录会直接生成一张工单，并按参保省份派给对应专员。"
          />
          <Space>
            <span>导入类型：</span>
            <Segmented
              aria-label="省外导入类型"
              value={orderType}
              options={[
                { label: '省外增员', value: OUT_OF_PROVINCE_ORDER_TYPE.INCREASE },
                { label: '省外减员', value: OUT_OF_PROVINCE_ORDER_TYPE.DECREASE },
              ]}
              onChange={(value) => setOrderType(value as OutOfProvinceOrderType)}
            />
          </Space>
          <ExcelUploader
            key={orderType}
            onPreview={(file) => previewOutOfProvinceImport(file, orderType)}
            onConfirm={handleConfirm}
            onPollJob={async (jobId) => toUploadJob(await getOutOfProvinceImportJob(jobId))}
            onDownloadErrorReport={async (jobId) => {
              try {
                await downloadOutOfProvinceImportErrorReport(jobId);
              } catch {
                message.error('下载错误报告失败，请稍后重试');
              }
            }}
          />
          <Button onClick={() => navigate('/out-of-province')}>返回省外增减员列表</Button>
        </Space>
      </Card>
    </PageContainer>
  );
};

export default OutOfProvinceImport;
