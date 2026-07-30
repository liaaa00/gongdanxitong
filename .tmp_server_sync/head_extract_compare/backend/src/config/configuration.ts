export interface AppConfig {
  app: {
    nodeEnv: string;
    port: number;
    jwtSecret: string;
    jwtRefreshSecret: string;
    jwtExpiresIn: string;
    jwtRefreshExpiresIn: string;
  };
  db: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    schema: string;
    logging: boolean;
  };
  ai: {
    provider: string;
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  upload: {
    dir: string;
    maxExcelSizeMb: number;
    maxAttachmentSizeMb: number;
  };
  operationLog: {
    retentionDays: number;
  };
}

const pickFirst = (...values: Array<string | undefined>): string | undefined => (
  values.find((value) => value !== undefined && value.trim().length > 0)
);

const resolveAiProvider = (): string => (
  pickFirst(process.env.AI_PROVIDER, process.env.OPENAI_PROVIDER, process.env.LLM_PROVIDER) ?? 'openai'
);

const resolveAiApiKey = (provider: string): string => {
  const normalized = provider.toLowerCase();
  if (normalized === 'qwen') {
    return pickFirst(process.env.AI_API_KEY, process.env.QWEN_API_KEY, process.env.DASHSCOPE_API_KEY, process.env.OPENAI_API_KEY) ?? '';
  }
  if (normalized === 'deepseek') {
    return pickFirst(process.env.AI_API_KEY, process.env.DEEPSEEK_API_KEY, process.env.OPENAI_API_KEY) ?? '';
  }
  return pickFirst(process.env.AI_API_KEY, process.env.OPENAI_API_KEY) ?? '';
};

const resolveAiBaseUrl = (provider: string): string => {
  const normalized = provider.toLowerCase();
  if (normalized === 'qwen') {
    return pickFirst(process.env.AI_BASE_URL, process.env.QWEN_BASE_URL, process.env.OPENAI_BASE_URL) ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  }
  if (normalized === 'deepseek') {
    return pickFirst(process.env.AI_BASE_URL, process.env.DEEPSEEK_BASE_URL, process.env.OPENAI_BASE_URL) ?? 'https://api.deepseek.com';
  }
  return pickFirst(process.env.AI_BASE_URL, process.env.OPENAI_BASE_URL) ?? 'https://api.openai.com/v1';
};

const resolveAiModel = (provider: string): string => {
  const normalized = provider.toLowerCase();
  if (normalized === 'qwen') {
    return pickFirst(process.env.AI_MODEL, process.env.QWEN_MODEL, process.env.OPENAI_MODEL) ?? 'qwen-plus';
  }
  if (normalized === 'deepseek') {
    return pickFirst(process.env.AI_MODEL, process.env.DEEPSEEK_MODEL, process.env.OPENAI_MODEL) ?? 'deepseek-v4-flash';
  }
  return pickFirst(process.env.AI_MODEL, process.env.OPENAI_MODEL) ?? 'gpt-4o-mini';
};

const configuration = (): AppConfig => {
  const aiProvider = resolveAiProvider();
  return ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
    jwtSecret: process.env.JWT_SECRET ?? 'change-me-jwt-secret',
    jwtRefreshSecret:
      process.env.JWT_REFRESH_SECRET ?? 'change-me-jwt-refresh-secret',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '2h',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'ticket_system',
    schema: process.env.DB_SCHEMA ?? 'public',
    logging: (process.env.DB_LOGGING ?? 'false') === 'true',
  },
  ai: {
    provider: aiProvider,
    apiKey: resolveAiApiKey(aiProvider),
    baseUrl: resolveAiBaseUrl(aiProvider),
    model: resolveAiModel(aiProvider),
  },
  upload: {
    dir: process.env.UPLOAD_DIR ?? 'uploads',
    maxExcelSizeMb: Number(process.env.MAX_IMPORT_SIZE_MB ?? 10),
    maxAttachmentSizeMb: Number(process.env.MAX_ATTACHMENT_SIZE_MB ?? 20),
  },
  operationLog: {
    retentionDays: Number(process.env.OPERATION_LOG_RETENTION_DAYS ?? 365),
  },
  });
};

export default configuration;
