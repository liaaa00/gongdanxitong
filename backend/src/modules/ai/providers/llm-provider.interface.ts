import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom, timeout } from 'rxjs';
import { businessException } from 'src/common/exceptions/business-exception';
import { AiSettingsService } from 'src/modules/admin/ai-settings/ai-settings.service';

export interface LlmPrompt {
  system: string;
  user: string;
}

export interface LlmResult {
  raw: unknown;
  content: string;
}

export interface ResolvedAiConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface LlmProvider {
  readonly name: 'openai' | 'qwen' | 'deepseek';
  readonly timeoutMs: number;
  isAvailable(): Promise<boolean>;
  getModelId(): Promise<string>;
  call(prompt: LlmPrompt): Promise<LlmResult>;
}

@Injectable()
export abstract class OpenAiCompatibleProvider implements LlmProvider {
  abstract readonly name: 'openai' | 'qwen' | 'deepseek';

  constructor(
    protected readonly httpService: HttpService,
    protected readonly configService: ConfigService,
    @Optional() protected readonly aiSettingsService?: AiSettingsService,
  ) {}

  get timeoutMs(): number {
    return 30000;
  }

  async getModelId(): Promise<string> {
    const cfg = await this.resolveConfig();
    return cfg.model;
  }

  protected async resolveConfig(): Promise<ResolvedAiConfig> {
    const stored = await this.aiSettingsService?.getConfigInternal().catch(() => null);
    if (stored && stored.apiKey) {
      return {
        provider: stored.provider,
        apiKey: stored.apiKey,
        baseUrl: stored.baseUrl,
        model: stored.model,
      };
    }
    return {
      provider: this.configService.get<string>('ai.provider', { infer: true }) ?? 'openai',
      apiKey: this.configService.get<string>('ai.apiKey', { infer: true }) ?? '',
      baseUrl: this.configService.get<string>('ai.baseUrl', { infer: true }) ?? 'https://api.openai.com/v1',
      model: this.configService.get<string>('ai.model', { infer: true }) ?? 'gpt-4o-mini',
    };
  }

  async isAvailable(): Promise<boolean> {
    const cfg = await this.resolveConfig();
    return cfg.provider.toLowerCase() === this.name && cfg.apiKey.length > 0;
  }

  async call(prompt: LlmPrompt): Promise<LlmResult> {
    const cfg = await this.resolveConfig();
    if (cfg.provider.toLowerCase() !== this.name || cfg.apiKey.length === 0) {
      throw businessException(4500, HttpStatus.BAD_REQUEST, 'AI provider unavailable');
    }

    const response = await lastValueFrom(
      this.httpService
        .post(
          `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`,
          {
            model: cfg.model,
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            response_format: { type: 'json_object' },
            temperature: 0,
          },
          {
            headers: {
              Authorization: `Bearer ${cfg.apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        )
        .pipe(timeout({ first: this.timeoutMs })),
    );

    const raw = response.data as Record<string, unknown>;
    const choices = Array.isArray(raw.choices) ? raw.choices : [];
    const message = choices[0] as Record<string, unknown> | undefined;
    const content =
      message && typeof message === 'object' && 'message' in message
        ? ((message.message as Record<string, unknown> | undefined)?.content as string | undefined)
        : undefined;

    if (!content) {
      throw businessException(4501, HttpStatus.BAD_GATEWAY, 'AI response invalid');
    }

    return { raw, content };
  }
}
