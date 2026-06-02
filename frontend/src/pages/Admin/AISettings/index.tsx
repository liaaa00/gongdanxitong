import { useEffect, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Form, Input, Button, Space, Card, Alert, App, Typography, Select, Skeleton } from 'antd';
import { SaveOutlined, ReloadOutlined, ApiOutlined, ClearOutlined } from '@ant-design/icons';
import {
  getAISettings,
  saveAISettings,
  testConnection,
  type AIProvider,
  type AISettingsPublic,
  type AISettingsUpdate,
  type AISettingsTestResult,
} from '@/services/aiMapping';

const PROVIDER_OPTIONS: Array<{ label: string; value: AIProvider }> = [
  { label: '默认智能服务', value: 'openai' },
  { label: '通义千问服务', value: 'qwen' },
  { label: '深度求索服务', value: 'deepseek' },
];

const PROVIDER_DEFAULTS: Record<AIProvider, { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
};

const fallbackReasonText: Record<string, string> = {
  '401': '认证失败：接口密钥无效或已过期',
  '403': '权限不足：当前 Key 无权访问该模型',
  '404': '接口或模型不存在：请检查接口地址与模型名称',
  timeout: '连接超时：请检查网络或服务状态',
  network: '网络错误：无法连接到智能服务',
  other: '未知错误：请查看后端返回详情',
};

const normalizeSettings = (cfg: Partial<AISettingsPublic> | null | undefined): AISettingsPublic => ({
  provider: (cfg?.provider || 'openai') as AIProvider,
  baseUrl: cfg?.baseUrl || PROVIDER_DEFAULTS.openai.baseUrl,
  model: cfg?.model || PROVIDER_DEFAULTS.openai.model,
  hasApiKey: Boolean(cfg?.hasApiKey),
  apiKeyMasked: cfg?.apiKeyMasked || '',
  decryptOk: cfg?.decryptOk ?? true,
});

const validateHttpUrl = (_: unknown, value?: string) => {
  const text = String(value || '').trim();
  if (!text) return Promise.reject(new Error('请填写接口地址'));
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return Promise.reject(new Error('接口地址必须以 http:// 或 https:// 开头'));
    }
    if (!url.hostname) {
      return Promise.reject(new Error('请输入完整的接口地址'));
    }
    return Promise.resolve();
  } catch {
    return Promise.reject(new Error('接口地址格式不正确，请检查地址是否符合规范'));
  }
};

const AdminAISettings: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm<AISettingsUpdate>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [forceApiKey, setForceApiKey] = useState(false);
  const [current, setCurrent] = useState<AISettingsPublic | null>(null);
  const [testResult, setTestResult] = useState<AISettingsTestResult | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const cfg = normalizeSettings(await getAISettings());
      setCurrent(cfg);
      setForceApiKey(cfg.decryptOk === false);
      setTestResult(null);
      form.setFieldsValue({
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        apiKey: '',
      });
    } catch {
      message.error('智能配置加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleResetBrokenConfig = () => {
    const provider = current?.provider || 'openai';
    form.setFieldsValue({
      provider,
      baseUrl: PROVIDER_DEFAULTS[provider].baseUrl,
      model: PROVIDER_DEFAULTS[provider].model,
      apiKey: '',
    });
    setForceApiKey(true);
    setTestResult(null);
    message.info('已清空表单，请重新输入接口密钥并保存');
  };

  const handleProviderChange = (provider: AIProvider) => {
    const defaults = PROVIDER_DEFAULTS[provider];
    const currentValues = form.getFieldsValue();
    form.setFieldsValue({
      provider,
      baseUrl: currentValues.baseUrl || defaults.baseUrl,
      model: currentValues.model || defaults.model,
    });
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const apiKey = values.apiKey?.trim();
    if ((!current?.hasApiKey || forceApiKey || current?.decryptOk === false) && !apiKey) {
      form.setFields([{ name: 'apiKey', errors: ['当前必须重新填写接口密钥，否则智能配置不可用'] }]);
      return;
    }

    const payload: AISettingsUpdate = {
      provider: values.provider,
      baseUrl: values.baseUrl?.trim(),
      model: values.model?.trim(),
    };
    if (apiKey) payload.apiKey = apiKey;

    setSaving(true);
    try {
      const updated = normalizeSettings(await saveAISettings(payload));
      setCurrent(updated);
      setForceApiKey(false);
      setTestResult(null);
      form.setFieldsValue({
        provider: updated.provider,
        baseUrl: updated.baseUrl,
        model: updated.model,
        apiKey: '',
      });
      message.success('智能配置已保存，导入表格将使用最新配置');
    } catch {
      message.error('智能配置保存失败，请检查表单和后端接口');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection();
      setTestResult(result);
      if (result.success) {
        message.success(`连接成功${result.model || result.modelUsed ? `（返回模型：${result.model || result.modelUsed}）` : ''}`);
      } else {
        const reason = result.fallbackReason || 'other';
        message.error(fallbackReasonText[reason] || reason);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '测试连接失败';
      const result = { success: false, fallbackReason: 'network', message: msg };
      setTestResult(result);
      message.error(msg);
    } finally {
      setTesting(false);
    }
  };

  const apiKeyRequired = !current?.hasApiKey || forceApiKey || current?.decryptOk === false;

  return (
    <PageContainer title="智能字段映射配置">
      <Card>
        {current?.decryptOk === false && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="智能服务密钥解密失败，请重新保存配置"
            description={
              <Space direction="vertical" size={8}>
                <Typography.Text>检测到历史加密配置无法解析（可能是 智能服务加密密钥变更），请重新输入接口密钥并保存。</Typography.Text>
                <Button danger icon={<ClearOutlined />} onClick={handleResetBrokenConfig}>一键重置并重新填写</Button>
              </Space>
            }
          />
        )}
        <Alert
          type={current?.hasApiKey && current?.decryptOk !== false ? 'success' : 'warning'}
          showIcon
          style={{ marginBottom: 16 }}
          message={current?.hasApiKey && current?.decryptOk !== false ? '已配置外部智能服务密钥' : '尚未配置可用接口密钥'}
          description={
            <Typography.Paragraph style={{ margin: 0 }}>
              导入表格预览时会先使用本地字段字典匹配，未命中的表头交由智能模型推断。接口密钥由后端加密保存，前端只展示脱敏占位；留空接口密钥表示沿用已保存的密钥。
            </Typography.Paragraph>
          }
        />
        {testResult && (
          <Alert
            type={testResult.success ? 'success' : 'error'}
            showIcon
            style={{ marginBottom: 16 }}
            message={testResult.success ? `连接成功${testResult.model || testResult.modelUsed ? `（返回模型：${testResult.model || testResult.modelUsed}）` : ''}` : `连接失败：${fallbackReasonText[testResult.fallbackReason || 'other'] || testResult.fallbackReason || 'other'}`}
            description={testResult.detail || testResult.message || undefined}
          />
        )}
        {loading ? (
          <Skeleton active />
        ) : (
          <Form layout="vertical" form={form} requiredMark="optional">
            <Form.Item name="provider" label="提供商" rules={[{ required: true, message: '请选择提供商' }]}>
              <Select options={PROVIDER_OPTIONS} style={{ maxWidth: 320 }} onChange={handleProviderChange} />
            </Form.Item>
            <Form.Item
              name="baseUrl"
              label="接口地址"
              normalize={(value) => typeof value === 'string' ? value.trim() : value}
              rules={[{ validator: validateHttpUrl }]}
              tooltip="请填写外部智能服务接口地址，例如默认智能服务、深度求索服务或通义千问服务的接口地址"
            >
              <Input placeholder="请输入完整接口地址，例如：https://api.openai.com/v1 或 https://api.deepseek.com" />
            </Form.Item>
            <Form.Item
              name="model"
              label="模型"
              normalize={(value) => typeof value === 'string' ? value.trim() : value}
              rules={[{ required: true, message: '请填写模型名称' }]}
            >
              <Input placeholder="请输入模型名称，可填写实际模型标识" />
            </Form.Item>
            <Form.Item
              name="apiKey"
              label="接口密钥"
              tooltip={apiKeyRequired ? '当前必须填写接口密钥' : '留空表示沿用已保存的密钥'}
              rules={[{
                validator: (_, value) => {
                  if (!apiKeyRequired || String(value || '').trim()) return Promise.resolve();
                  return Promise.reject(new Error('请重新填写接口密钥'));
                },
              }]}
            >
              <Input.Password
                placeholder={apiKeyRequired ? '请输入接口密钥' : `${current?.apiKeyMasked || '已保存'}（留空沿用）`}
                autoComplete="off"
              />
            </Form.Item>
            <Space wrap>
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
                保存配置
              </Button>
              <Button icon={<ApiOutlined />} loading={testing} onClick={handleTestConnection} disabled={saving || current?.decryptOk === false}>
                测试连接
              </Button>
              <Button icon={<ReloadOutlined />} onClick={load} disabled={saving || testing}>
                重新加载
              </Button>
            </Space>
          </Form>
        )}
      </Card>
    </PageContainer>
  );
};

export default AdminAISettings;
