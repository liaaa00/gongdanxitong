import React from 'react';
import { Button, Result, Space, Typography, Collapse } from 'antd';
import { ReloadOutlined, HomeOutlined, BugOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** 出错的页面/模块名称，用于日志定位 */
  moduleName?: string;
  /** 自定义 fallback，不传则使用默认友好页面 */
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorCount: number;
  errorKey: number;
}

/**
 * 设备环境信息（只读快照），仅记录到 console，不上报隐私字段
 */
function getDeviceInfo(): Record<string, string> {
  try {
    return {
      userAgent: navigator.userAgent || '未知',
      platform: navigator.platform || '未知',
      language: navigator.language || '未知',
      screenSize: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
      viewportSize: `${window.innerWidth ?? 0}x${window.innerHeight ?? 0}`,
      url: window.location?.href || '未知',
      timestamp: new Date().toISOString(),
      referrer: document.referrer || '未知',
    };
  } catch {
    return { note: '收集设备信息失败' };
  }
}

/**
 * 上报错误信息接口 — 如果有后端错误收集接口，在此处替换
 */
function reportErrorToServer(data: {
  message: string;
  stack: string | undefined;
  moduleName: string | undefined;
  componentStack: string | undefined;
  deviceInfo: Record<string, string>;
}) {
  // 当前无上报接口，仅输出到 console 集中标记
  // 如需上报，在此处添加 fetch('/api/error-report', { method:'POST', body: JSON.stringify(data) })
  console.error(
    `%c[ErrorBoundary] %c${data.moduleName || '根组件'} %c${data.message}`,
    'color:red;font-weight:bold;',
    'color:#ff4d4f;',
    'color:#333;',
  );
  console.groupCollapsed(`[ErrorBoundary] 详情: ${data.moduleName || '根组件'}`);
  console.log('设备信息:', data.deviceInfo);
  console.log('错误堆栈:', data.stack);
  console.log('组件堆栈:', data.componentStack);
  console.groupEnd();
}

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    errorCount: 0,
    errorKey: 0,
  };

  // 防止同一位置反复崩溃（如 render 抛异常），最多允许 3 次
  private static readonly MAX_RETRY = 3;

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const deviceInfo = getDeviceInfo();

    this.setState((prev) => ({
      errorInfo,
      errorCount: prev.errorCount + 1,
    }));

    reportErrorToServer({
      message: error.message || '未知错误',
      stack: error.stack,
      moduleName: this.props.moduleName,
      componentStack: errorInfo.componentStack ?? undefined,
      deviceInfo,
    });
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      errorKey: prev.errorKey + 1,
    }));
  };

  handleGoHome = () => {
    try {
      window.location.href = '/';
    } catch {
      // 极端情况下 location 也挂了，至少重置状态
      this.handleRetry();
    }
  };

  render() {
    const { hasError, error, errorCount } = this.state;
    const { children, moduleName, fallback } = this.props;

    if (!hasError) {
      return <>{children}</>;
    }

    // 连续崩溃次数超过 MAX_RETRY，停止尝试展示 fallback，避免无限循环
    if (errorCount > ErrorBoundary.MAX_RETRY) {
      return (
        <div style={{ padding: '20vh 24px', textAlign: 'center' }}>
          <Result
            status="500"
            title="页面暂时无法恢复"
            subTitle={`"${moduleName || '页面'}" 连续崩溃已达 ${errorCount} 次，为避免浏览器卡死已暂停渲染。请刷新页面或联系管理员。`}
            extra={
              <Space>
                <Button type="primary" icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
                  刷新页面
                </Button>
                <Button icon={<HomeOutlined />} onClick={this.handleGoHome}>
                  返回首页
                </Button>
              </Space>
            }
          />
        </div>
      );
    }

    if (fallback) {
      return <div key={this.state.errorKey}>{fallback}</div>;
    }

    return (
      <div key={this.state.errorKey} style={{ padding: '15vh 24px', maxWidth: 720, margin: '0 auto' }}>
        <Result
          status="error"
          title={moduleName ? `"${moduleName}" 出现异常` : '页面出现异常'}
          subTitle="非常抱歉，该模块遇到了一个意外错误。您可以尝试重试，或返回首页。"
          extra={
            <Space>
              <Button type="primary" icon={<ReloadOutlined />} onClick={this.handleRetry}>
                重试
              </Button>
              <Button icon={<HomeOutlined />} onClick={this.handleGoHome}>
                返回首页
              </Button>
            </Space>
          }
        >
          <div style={{ marginTop: 16, textAlign: 'left', maxWidth: 600, margin: '16px auto 0' }}>
            <Collapse
              size="small"
              ghost
              items={[
                {
                  key: 'details',
                  label: (
                    <Space size={4}>
                      <BugOutlined style={{ color: '#999' }} />
                      <Text type="secondary" style={{ fontSize: 12 }}>错误详情（供开发排查）</Text>
                    </Space>
                  ),
                  children: (
                    <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                      <Paragraph copyable={{ text: error?.message || '未知错误' }}>
                        <Text type="danger"><strong>错误信息：</strong>{error?.message || '未知错误'}</Text>
                      </Paragraph>
                      {error?.stack && (
                        <Paragraph copyable={{ text: error.stack }}>
                          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 120, overflow: 'auto', color: '#999' }}>
                            {error.stack}
                          </pre>
                        </Paragraph>
                      )}
                      {import.meta.env.DEV && this.state.errorInfo?.componentStack && (
                        <details style={{ marginTop: 4 }}>
                          <summary style={{ cursor: 'pointer', color: '#999' }}>组件堆栈</summary>
                          <pre style={{ fontSize: 11, color: '#999', maxHeight: 150, overflow: 'auto' }}>
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </details>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </Result>
      </div>
    );
  }
}
