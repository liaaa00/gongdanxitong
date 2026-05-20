import { Body, Controller, Post } from '@nestjs/common';
import { WORK_ORDER_CREATOR_ROLES } from 'src/common/auth/role-permissions';
import { Roles } from 'src/common/decorators/roles.decorator';
import { FieldMappingDto } from './dto/field-mapping.dto';
import { AiMappingService } from './ai-mapping.service';
import { ImportFieldValidationService } from 'src/modules/imports/field-validation.service';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiMappingService: AiMappingService,
    private readonly importFieldValidationService: ImportFieldValidationService,
  ) {}

  @Post('field-mapping')
  @Roles(...WORK_ORDER_CREATOR_ROLES)
  async fieldMapping(@Body() payload: FieldMappingDto) {
    const candidateFields = await this.importFieldValidationService.buildCandidateFields(payload.orderType);
    const suggestion = await this.aiMappingService.suggest(payload.orderType, payload.headers, candidateFields);
    const items = payload.headers.map((header, index) => ({
      headerIndex: index,
      header,
      fieldCode: suggestion.suggestion[header] ?? null,
      confidence: suggestion.confidence[header] ?? 0,
      reason: suggestion.suggestion[header] ? 'fuzzy' : 'unmatched',
    }));

    return {
      items,
      unmatchedHeaders: suggestion.unmatched,
      suggestion: suggestion.suggestion,
      confidence: suggestion.confidence,
      unmatched: suggestion.unmatched,
      missingRequired: suggestion.missingRequired,
      modelUsed: suggestion.modelUsed,
      localMatchedCount: suggestion.localMatchedCount,
      llmMatchedCount: suggestion.llmMatchedCount,
      cached: false,
      fallbackReason: suggestion.fallbackReason ?? null,
    };
  }
}
