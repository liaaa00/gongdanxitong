import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import { Alert, Button, Card, Space } from 'antd';

const OutOfProvinceForm: React.FC = () => {
  const navigate = useNavigate();
  return (
    <PageContainer header={{ title: '新建省外工单' }}>
      <Card>
        <Space direction="vertical" size={16}>
          <Alert
            type="warning"
            showIcon
            message="省外表单暂缓"
            description="TODO：业务侧未提供菜鸟模板/浙江自签字段清单，不能用入职/离职模板顶替，需业务提供字段清单。"
          />
          <Button onClick={() => navigate('/out-of-province')}>返回省外增减员列表</Button>
        </Space>
      </Card>
    </PageContainer>
  );
};

export default OutOfProvinceForm;
