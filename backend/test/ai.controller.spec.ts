import { OrderType } from 'src/entities';
import { AiController } from 'src/modules/ai/ai.controller';
import { AiMappingService } from 'src/modules/ai/ai-mapping.service';
import { ImportFieldValidationService } from 'src/modules/imports/field-validation.service';

describe('AiController', () => {
  it('returns mapping suggestion for requested headers', async () => {
    const aiMappingService = {
      suggest: jest.fn(async () => ({
        suggestion: { 姓名: 'employee_name' },
        confidence: { 姓名: 0.98 },
        unmatched: ['备注'],
        missingRequired: ['customer_code'],
        modelUsed: 'fallback:fuzzy',
        localMatchedCount: 1,
        llmMatchedCount: 0,
        fallbackReason: 'no_api_key',
      })),
    } as unknown as AiMappingService;

    const fieldValidationService = {
      buildCandidateFields: jest.fn(async () => ([{ fieldCode: 'employee_name', fieldName: '姓名', fieldType: 'text', required: true }])),
    } as unknown as ImportFieldValidationService;

    const controller = new AiController(aiMappingService, fieldValidationService);
    const result = await controller.fieldMapping({ orderType: OrderType.ONBOARDING, headers: ['姓名', '备注'] } as never);

    expect(fieldValidationService.buildCandidateFields).toHaveBeenCalledWith(OrderType.ONBOARDING);
    expect(aiMappingService.suggest).toHaveBeenCalledWith(OrderType.ONBOARDING, ['姓名', '备注'], [{ fieldCode: 'employee_name', fieldName: '姓名', fieldType: 'text', required: true }]);
    expect(result).toMatchObject({
      suggestion: { 姓名: 'employee_name' },
      confidence: { 姓名: 0.98 },
      unmatched: ['备注'],
      missingRequired: ['customer_code'],
      modelUsed: 'fallback:fuzzy',
      localMatchedCount: 1,
      llmMatchedCount: 0,
      fallbackReason: 'no_api_key',
    });
  });
});
