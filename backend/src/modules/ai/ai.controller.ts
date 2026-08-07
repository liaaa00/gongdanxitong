import { Body, Controller, Post, Query } from '@nestjs/common';
import { BusinessPermission } from 'src/common/decorators/business-permission.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { BusinessScope } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
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
  @BusinessPermission('work_order.import')
  async fieldMapping(@Body() payload: FieldMappingDto, @CurrentUser() user?: JwtUserPayload, @Query('businessScope') requestedScope?: BusinessScope) {
    const businessScope = requestedScope ?? user?.businessScope ?? BusinessScope.BEILUN;
    const candidateFields = await this.importFieldValidationService.buildCandidateFields(payload.orderType);
    const suggestion = await this.aiMappingService.suggest(payload.orderType, payload.headers, candidateFields, businessScope);
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
