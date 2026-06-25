import request from './request';

export type AIProvider = 'openai' | 'qwen' | 'deepseek';

export interface AISettingsPublic {
  provider: AIProvider;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
  /** 后端解密历史配置是否成功；false 表示 AI_SECRET_KEY 变更等导致旧配置不可用 */
  decryptOk?: boolean;
}

export interface AISettingsUpdate {
  provider: AIProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface AISettingsTestResult {
  success: boolean;
  model?: string;
  modelUsed?: string;
  fallbackReason?: '401' | '403' | '404' | 'timeout' | 'network' | 'other' | string;
  message?: string;
  detail?: string;
}

export async function getAISettings(): Promise<AISettingsPublic> {
  return request.get('/admin/ai-settings');
}

export async function saveAISettings(payload: AISettingsUpdate): Promise<AISettingsPublic> {
  return request.put('/admin/ai-settings', payload);
}

export async function testAISettings(): Promise<AISettingsTestResult> {
  return request.post('/admin/ai-settings/test');
}

// 明确命名给页面和评审脚本识别：AI 配置测试连接
export const testConnection = testAISettings;
