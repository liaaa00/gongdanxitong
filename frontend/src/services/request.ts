import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse } from './types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// 超时上限 30 秒
const TIMEOUT_MS = 30_000;

function clampPageSizeValue(value: unknown): number {
  const n = Number(value ?? DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

function sanitizePaginationParams(params: unknown): unknown {
  if (!params) return params;
  const keys = ['pageSize', 'page_size', 'limit', 'perPage'];
  if (params instanceof URLSearchParams) {
    keys.forEach((key) => {
      if (params.has(key)) params.set(key, String(clampPageSizeValue(params.get(key))));
    });
    if (params.has('current') && !params.has('page')) {
      params.set('page', String(params.get('current')));
    }
    return params;
  }
  if (typeof params === 'object') {
    const next = { ...(params as Record<string, unknown>) };
    keys.forEach((key) => {
      if (key in next) next[key] = clampPageSizeValue(next[key]);
    });
    // ProTable sends `current`; backend reads `page`. Map current → page when page is missing.
    if (next.current !== undefined && (next.page === undefined || next.page === null || next.page === '')) {
      next.page = next.current;
    }
    return next;
  }
  return params;
}

const request = axios.create({
  baseURL: apiBaseUrl ? `${apiBaseUrl}/api` : '/api',
  timeout: TIMEOUT_MS,
});

request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.params = sanitizePaginationParams(config.params);
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  },
);

/** 获取友好的错误提示文本 */
function getFriendlyErrorMessage(error: AxiosError): string {
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return '请求超时，请检查网络后重试';
  }
  if (error.response) {
    const status = error.response.status;
    if (status >= 500) {
      return `服务器异常 (${status})，请稍后重试`;
    }
    if (status === 404) {
      const data = error.response.data as ApiResponse | undefined;
      return data?.message || '请求的资源不存在';
    }
    if (status === 403) {
      return '没有权限执行此操作';
    }
    if (status >= 400) {
      // 尝试读取后端返回的 message
      const data = error.response.data as ApiResponse | undefined;
      return data?.message || `请求失败 (${status})`;
    }
  }
  if (error.message === 'Network Error') {
    return '网络连接失败，请检查网络';
  }
  return error.message || '请求异常，请稍后重试';
}

/** 统一的 Toast 提示 — 延迟导入避免循环依赖 */
function showErrorToast(msg: string) {
  try {
    // 动态 import antd message，避免在 SSR 或无上下文时崩溃
    import('antd').then(({ message }) => {
      message.error(msg);
    }).catch(() => {
      console.error('[Request]', msg);
    });
  } catch {
    console.error('[Request]', msg);
  }
}

function isSilentError(config?: unknown): boolean {
  return Boolean((config as { silentError?: boolean } | undefined)?.silentError);
}

const onResponseFulfilled = (response: { data: ApiResponse; config?: unknown }) => {
  const res = response.data;
  if (res.code !== 0) {
    if (res.code === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      // 使用 navigate 可能不可用时回退到 location
      try {
        window.location.href = '/login';
      } catch {
        // 极端情况下忽略
      }
    }
    const errMsg = res.message || '请求失败';
    if (!isSilentError(response.config)) showErrorToast(errMsg);
    return Promise.reject(new Error(errMsg));
  }
  return res.data;
};

const onResponseRejected = (error: AxiosError) => {
  const friendlyMsg = getFriendlyErrorMessage(error);

  if (error.response?.status === 401) {
    // 登录等静默接口：401 仅表示「用户名或密码错误」，不应强制刷新跳转，
    // 否则页面 reload 会冲掉调用方的 message.error 提示。附加友好消息后交调用方处理。
    if (isSilentError(error.config)) {
      (error as AxiosError & { _friendlyMsg: string })._friendlyMsg = friendlyMsg;
      return Promise.reject(error);
    }
    // 其余接口的 401 视为会话过期：清除登录态并回到登录页。
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    try {
      window.location.href = '/login';
    } catch { /* ignore */ }
    return Promise.reject(error);
  }

  // 统一 Toast 提示，防止页面调用方忘记 catch 导致白屏；可选接口允许调用方静默降级。
  if (!isSilentError(error.config)) showErrorToast(friendlyMsg);

  // 将友好消息附加到 error 上，供调用方选择性使用
  (error as AxiosError & { _friendlyMsg: string })._friendlyMsg = friendlyMsg;

  return Promise.reject(error);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
request.interceptors.response.use(onResponseFulfilled as any, onResponseRejected);

export { TIMEOUT_MS, getFriendlyErrorMessage };
export default request;
