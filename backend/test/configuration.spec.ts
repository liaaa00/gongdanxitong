import configuration from 'src/config/configuration';

describe('configuration ai env aliases', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AI_PROVIDER;
    delete process.env.AI_API_KEY;
    delete process.env.AI_BASE_URL;
    delete process.env.AI_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_MODEL;
    delete process.env.QWEN_API_KEY;
    delete process.env.QWEN_BASE_URL;
    delete process.env.QWEN_MODEL;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_BASE_URL;
    delete process.env.DEEPSEEK_MODEL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses OPENAI_* aliases when AI_* variables are not set', () => {
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENAI_BASE_URL = 'https://openai-compatible.example/v1';
    process.env.OPENAI_MODEL = 'gpt-test';

    const config = configuration();

    expect(config.ai.provider).toBe('openai');
    expect(config.ai.apiKey).toBe('openai-key');
    expect(config.ai.baseUrl).toBe('https://openai-compatible.example/v1');
    expect(config.ai.model).toBe('gpt-test');
  });

  it('keeps AI_* variables higher priority than provider-specific aliases', () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_API_KEY = 'ai-key';
    process.env.AI_BASE_URL = 'https://ai.example/v1';
    process.env.AI_MODEL = 'ai-model';
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENAI_BASE_URL = 'https://openai.example/v1';
    process.env.OPENAI_MODEL = 'openai-model';

    const config = configuration();

    expect(config.ai.apiKey).toBe('ai-key');
    expect(config.ai.baseUrl).toBe('https://ai.example/v1');
    expect(config.ai.model).toBe('ai-model');
  });

  it('uses provider-specific aliases for qwen', () => {
    process.env.AI_PROVIDER = 'qwen';
    process.env.QWEN_API_KEY = 'qwen-key';
    process.env.QWEN_BASE_URL = 'https://qwen.example/v1';
    process.env.QWEN_MODEL = 'qwen-test';

    const config = configuration();

    expect(config.ai.provider).toBe('qwen');
    expect(config.ai.apiKey).toBe('qwen-key');
    expect(config.ai.baseUrl).toBe('https://qwen.example/v1');
    expect(config.ai.model).toBe('qwen-test');
  });
});
