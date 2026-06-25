import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AiSettingsService } from 'src/modules/admin/ai-settings/ai-settings.service';
import { OpenAiCompatibleProvider } from './llm-provider.interface';

@Injectable()
export class QwenProvider extends OpenAiCompatibleProvider {
  readonly name = 'qwen' as const;

  constructor(httpService: HttpService, configService: ConfigService, aiSettingsService: AiSettingsService) {
    super(httpService, configService, aiSettingsService);
  }
}
