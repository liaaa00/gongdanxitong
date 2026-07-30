import React from 'react';
import ReactDOM from 'react-dom/client';
import { message } from 'antd';
import App from './App';
import './styles/global.less';
import './utils/diagnoseAuth';

// ───────── 全局未捕获异常拦截 ─────────
// 目标：即使底层抛错也不白屏；错误信息统一记录 console

function setupGlobalErrorHandlers() {
  // 1. 捕获同步 throw / 运行时错误
  const prevOnError = window.onerror;
  window.onerror = (msg, source, lineno, colno, error) => {
    console.error(
      '%c[GlobalError] window.onerror %c捕获到未处理错误',
      'color:red;font-weight:bold;',
      'color:#ff4d4f;',
    );
    console.groupCollapsed('[GlobalError] 详情');
    console.log('消息:', msg);
    console.log('位置:', `${source}:${lineno}:${colno}`);
    if (error?.stack) console.log('堆栈:', error.stack);
    console.groupEnd();

    // 若有 Toast 能力则提示（动态 import，避免循环依赖）
    try {
      // 使用 antd 静态 message（不依赖 App 实例上下文）
      import('antd').then(({ message: msgApi }) => {
        msgApi.error('系统出现意外错误，请刷新页面后重试');
      }).catch(() => {});
    } catch { /* ignore */ }

    // 仍调用原始 handler（如果有）
    if (prevOnError) {
      return prevOnError.call(window, msg, source, lineno, colno, error);
    }
    return false; // 防止默认浏览器报错弹窗
  };

  // 2. 捕获 unhandled promise rejection
  const prevUnhandledRejection = window.onunhandledrejection;
  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    console.error(
      '%c[GlobalError] unhandledrejection %c未处理的 Promise 异常',
      'color:red;font-weight:bold;',
      'color:#ff4d4f;',
    );
    console.groupCollapsed('[GlobalError] Promise 异常详情');
    console.log('原因:', event.reason);
    if (event.reason instanceof Error) {
      console.log('堆栈:', event.reason.stack);
    }
    console.groupEnd();

    try {
      import('antd').then(({ message: msgApi }) => {
        msgApi.error('操作异常，请稍后重试');
      }).catch(() => {});
    } catch { /* ignore */ }

    // 阻止默认控制台报错（不阻止的话浏览器可能还是会标红）
    event.preventDefault();

    if (prevUnhandledRejection) {
      prevUnhandledRejection.call(window, event);
    }
  };

  // 3. 可选：捕获 React 渲染之外的 ErrorEvent
  window.addEventListener('error', (event) => {
    // 仅处理资源加载失败等（JS 错误已被 onerror 覆盖）
    if (event.target && (event.target as HTMLElement).tagName) {
      console.warn(
        '%c[GlobalError] %c资源加载失败:',
        'color:orange;font-weight:bold;',
        'color:#faad14;',
        (event.target as HTMLElement).tagName,
        (event.target as HTMLSourceElement).src || (event.target as HTMLLinkElement).href || '',
      );
    }
  }, true);
}

setupGlobalErrorHandlers();

async function enableMocking() {
  if (!import.meta.env.DEV) {
    return;
  }
  if (import.meta.env.VITE_USE_MSW !== 'true') {
    return;
  }

  const { worker } = await import('./mocks/browser');
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  });
}

void enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
