import { PageContainer } from '@ant-design/pro-components';
import { Alert } from 'antd';
import { useSearchParams } from 'react-router-dom';
import PortalIntakeWorkbench from '@/pages/CustomerConfig/PortalIntakeWorkbench';

/** 业务员日常使用的门户增减员审核工单入口。审核抽屉由统一工作台管理。 */
export default function PortalIntakeReviewPage() {
  const [searchParams] = useSearchParams();
  const initialCustomerId = searchParams.get('customerId') ?? undefined;

  return <PageContainer title="门户审核工单" subTitle="审核门户提交的增员、减员资料后，沿用现有工单规则派发">
    <Alert type="info" showIcon message="门户提交先审核、后派发" description="列表按当前账号绑定的客户范围显示。审核通过后进入现有工单办理链路；退回时必须填写原因和待补字段。" style={{ marginBottom: 16 }} />
    <PortalIntakeWorkbench initialCustomerId={initialCustomerId} />
  </PageContainer>;
}
