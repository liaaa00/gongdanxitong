import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FieldConfig } from 'src/entities';
import { AiSettingsModule } from 'src/modules/admin/ai-settings/ai-settings.module';
import { DispatchEngineModule } from 'src/modules/dispatch-engine/dispatch-engine.module';
import { ImportFieldValidationService } from 'src/modules/imports/field-validation.service';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { QwenProvider } from './providers/qwen.provider';
import { AiController } from './ai.controller';
import { AiMappingService } from './ai-mapping.service';

@Module({
  imports: [HttpModule, DispatchEngineModule, TypeOrmModule.forFeature([FieldConfig]), AiSettingsModule],
  controllers: [AiController],
  providers: [AiMappingService, OpenAiProvider, QwenProvider, DeepSeekProvider, ImportFieldValidationService],
  exports: [AiMappingService],
})
export class AiModule {}
