import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosError } from 'axios';
import { lastValueFrom, timeout } from 'rxjs';
import { Repository } from 'typeorm';
import { SystemSetting } from 'src/entities';
import { decryptSecret, encryptSecret, maskSecret } from 'src/common/crypto/aes.util';
import { TestAiSettingsDto, UpdateAiSettingsDto } from './dto/update-ai-settings.dto';

const SETTING_KEY = 'ai.config';
const CACHE_TTL_MS = 30_000;

type AiProvider = 'openai' | 'qwen' | 'deepseek';
export type AiFallbackReason = '401' | '403' | '404' | 'timeout' | 'network' | 'other';

const PROVIDER_DEFAULTS: Record<AiProvider, { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
};

export interface AiConfigStored {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AiConfigPublic {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
  decryptOk: boolean;
  error?: string;
}

export interface AiSettingsTestResult {
  success: boolean;
  fallbackReason?: AiFallbackReason;
  detail?: string;
  model?: string;
}

interface StoredReadResult {
  value: AiConfigStored | null;
  decryptOk: boolean;
  error?: string;
}

@Injectable()
export class AiSettingsService {
  private readonly logger = new Logger(AiSettingsService.name);
  private cached: { result: StoredReadResult; expiresAt: number } | null = null;

  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingsRepo: Repository<SystemSetting>,
    private readonly httpService: HttpService,
  ) {}

  async getConfigPublic(): Promise<AiConfigPublic> {
    const read = await this.readStored();
    if (!read.decryptOk) {
      return {
        provider: 'openai',
        baseUrl: '',
        model: '',
        hasApiKey: false,
        apiKeyMasked: '',
        decryptOk: false,
        error: read.error ?? 'AI settings decrypt failed',
      };
    }

    const normalized = this.normalizeConfig(read.value ?? { provider: 'openai', apiKey: '', baseUrl: '', model: '' });
    return {
      provider: normalized.provider,
      baseUrl: normalized.baseUrl,
      model: normalized.model,
      hasApiKey: !!normalized.apiKey,
      apiKeyMasked: normalized.apiKey ? maskSecret(normalized.apiKey) : '',
      decryptOk: true,
    };
  }

  async getConfigInternal(): Promise<AiConfigStored | null> {
    const read = await this.readStored();
    return read.decryptOk && read.value ? this.normalizeConfig(read.value) : null;
  }

  async updateConfig(dto: UpdateAiSettingsDto): Promise<AiConfigPublic> {
    const existingRead = await this.readStored();
    if (!existingRead.decryptOk) {
      throw new BadRequestException('AI settings cannot be updated while existing encrypted config cannot be decrypted; please reset API key');
    }

    const existing = existingRead.value;
    const incomingApiKey = dto.apiKey ?? dto.api_key;
    const incomingBaseUrl = dto.baseUrl ?? dto.base_url;
    if (incomingBaseUrl !== undefined) {
      this.assertValidBaseUrl(incomingBaseUrl);
    }
    const next = this.normalizeConfig({
      provider: dto.provider ?? existing?.provider ?? 'openai',
      baseUrl: incomingBaseUrl ?? existing?.baseUrl ?? '',
      model: dto.model ?? existing?.model ?? '',
      apiKey: incomingApiKey && incomingApiKey.trim().length > 0 ? incomingApiKey.trim() : existing?.apiKey ?? '',
    });
    this.assertValidBaseUrl(next.baseUrl);

    const encryptedValue = encryptSecret(JSON.stringify(next));
    const row = await this.settingsRepo.findOne({ where: { key: SETTING_KEY } });
    if (row) {
      row.value = encryptedValue;
      row.isEncrypted = true;
      await this.settingsRepo.save(row);
    } else {
      const entity = this.settingsRepo.create({
        key: SETTING_KEY,
        value: encryptedValue,
        isEncrypted: true,
      });
      await this.settingsRepo.save(entity);
    }

    this.invalidateCache();
    return this.getConfigPublic();
  }

  async testConnection(dto: TestAiSettingsDto = {}): Promise<AiSettingsTestResult> {
    const stored = await this.getConfigInternal();
    const apiKey = (dto.apiKey ?? dto.api_key ?? stored?.apiKey ?? '').trim();
    const baseUrl = (dto.baseUrl ?? dto.base_url ?? stored?.baseUrl ?? '').trim();
    const model = (dto.model ?? stored?.model ?? '').trim();

    if (!apiKey) {
      return { success: false, fallbackReason: '401', detail: 'API key is missing', model: model || undefined };
    }
    if (!baseUrl) {
      return { success: false, fallbackReason: 'other', detail: 'Base URL is missing', model: model || undefined };
    }
    this.assertValidBaseUrl(baseUrl);

    try {
      await lastValueFrom(
        this.httpService
          .get(`${baseUrl.replace(/\/$/, '')}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          })
          .pipe(timeout({ first: 10_000 })),
      );
      return { success: true, model: model || undefined };
    } catch (error) {
      const fallbackReason = this.classifyConnectionError(error);
      this.logger.warn(`AI settings test connection failed: ${fallbackReason}; ${this.safeErrorMessage(error)}`);
      return {
        success: false,
        fallbackReason,
        detail: this.safeErrorMessage(error),
        model: model || undefined,
      };
    }
  }

  invalidateCache(): void {
    this.cached = null;
  }

  private assertValidBaseUrl(baseUrl: string): void {
    try {
      const trimmed = baseUrl.trim();
      if (!trimmed || trimmed !== baseUrl || /[^\x21-\x7E]/.test(trimmed)) {
        throw new Error('invalid_url_chars');
      }
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('unsupported_protocol');
      }
    } catch {
      throw new BadRequestException('AI Base URL must be a valid http/https URL');
    }
  }

  private normalizeConfig(config: AiConfigStored): AiConfigStored {
    const provider: AiProvider = ['openai', 'qwen', 'deepseek'].includes(config.provider)
      ? config.provider
      : 'openai';
    const defaults = PROVIDER_DEFAULTS[provider];
    return {
      provider,
      apiKey: config.apiKey?.trim() ?? '',
      baseUrl: config.baseUrl?.trim() || defaults.baseUrl,
      model: config.model?.trim() || defaults.model,
    };
  }

  private async readStored(): Promise<StoredReadResult> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) {
      return this.cached.result;
    }

    const result: StoredReadResult = { value: null, decryptOk: true };
    try {
      const row = await this.settingsRepo.findOne({ where: { key: SETTING_KEY } });
      if (row) {
        const plaintext = row.isEncrypted ? decryptSecret(row.value) : row.value;
        const parsed = JSON.parse(plaintext) as AiConfigStored;
        if (parsed && parsed.provider) {
          result.value = parsed;
        }
      }
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Failed to load AI config from system_settings: ${message}`);
      result.value = null;
      result.decryptOk = false;
      result.error = message;
    }

    this.cached = { result, expiresAt: now + CACHE_TTL_MS };
    return result;
  }

  private classifyConnectionError(error: unknown): AiFallbackReason {
    const maybe = error as AxiosError | { name?: string; code?: string; response?: { status?: number } };
    const status = maybe.response?.status;
    if (status === 401) return '401';
    if (status === 403) return '403';
    if (status === 404) return '404';
    if (maybe.name === 'TimeoutError' || maybe.code === 'ECONNABORTED' || maybe.code === 'ETIMEDOUT') return 'timeout';
    if (maybe.code === 'ENOTFOUND' || maybe.code === 'ECONNREFUSED' || maybe.code === 'ECONNRESET' || maybe.code === 'EAI_AGAIN') return 'network';
    return 'other';
  }

  private safeErrorMessage(error: unknown): string {
    const maybe = error as AxiosError<{ error?: { message?: string }; message?: string }>;
    const status = maybe.response?.status;
    const responseMessage = maybe.response?.data?.error?.message ?? maybe.response?.data?.message;
    if (status) return responseMessage ? `HTTP ${status}: ${responseMessage}` : `HTTP ${status}`;
    return error instanceof Error ? error.message : 'AI connection test failed';
  }
}
