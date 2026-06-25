import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import { ProConfigProvider, zhCNIntl } from '@ant-design/pro-components';
import zhCN from 'antd/locale/zh_CN';
import AppRoutes from './routes';
import ErrorBoundary from '@/components/ErrorBoundary';

const getPopupContainerFromTrigger = (triggerNode?: HTMLElement) =>
  (triggerNode?.parentElement as HTMLElement) || document.body;

const App: React.FC = () => {
  return (
    <ErrorBoundary moduleName="应用根组件">
      <ConfigProvider
        locale={zhCN}
        getPopupContainer={getPopupContainerFromTrigger}
      >
        <ProConfigProvider intl={zhCNIntl}>
          <AntApp>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </AntApp>
        </ProConfigProvider>
      </ConfigProvider>
    </ErrorBoundary>
  );
};

export default App;
