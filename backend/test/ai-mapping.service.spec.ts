import { AiMappingService } from 'src/modules/ai/ai-mapping.service';
import { DeepSeekProvider } from 'src/modules/ai/providers/deepseek.provider';
import { LlmPrompt, LlmResult } from 'src/modules/ai/providers/llm-provider.interface';
import { OpenAiProvider } from 'src/modules/ai/providers/openai.provider';
import { QwenProvider } from 'src/modules/ai/providers/qwen.provider';
import { CandidateField } from 'src/modules/imports/types';

function providerStub(input: {
  available: boolean;
  content?: string;
  name?: 'openai' | 'qwen' | 'deepseek';
  error?: unknown;
}): OpenAiProvider {
  return {
    name: input.name ?? 'openai',
    modelId: 'mock-model',
    timeoutMs: 30000,
    isAvailable: jest.fn(async () => input.available),
    call: jest.fn(async (_prompt: LlmPrompt): Promise<LlmResult> => {
      if (input.error) throw input.error;
      return { raw: {}, content: input.content ?? '{}' };
    }),
  } as unknown as OpenAiProvider;
}

const fields: CandidateField[] = [
  { fieldCode: 'employee_name', fieldName: '姓名', fieldType: 'text', required: true },
  { fieldCode: 'mobile', fieldName: '移动电话', fieldType: 'text', required: false },
  { fieldCode: 'id_card_no', fieldName: '身份证号', fieldType: 'text', required: true },
  { fieldCode: 'base_salary', fieldName: '基本工资', fieldType: 'number', required: true },
  { fieldCode: 'need_onboarding_contact', fieldName: '是否需要入职联系', fieldType: 'dropdown', required: true },
  { fieldCode: 'customer_code', fieldName: '客户代码', fieldType: 'text', required: true },
  { fieldCode: 'work_city', fieldName: '工作城市', fieldType: 'text', required: true },
  { fieldCode: 'fund_base', fieldName: '公积金基数', fieldType: 'number', required: true },
  { fieldCode: 'contract_term_type', fieldName: '合同期限形式', fieldType: 'text', required: false },
  { fieldCode: 'contract_start_date', fieldName: '合同开始日期', fieldType: 'date', required: true },
  { fieldCode: 'contract_end_date', fieldName: '合同终止日期', fieldType: 'date', required: true },
  { fieldCode: 'need_company_contract', fieldName: '是否企服发起劳动合同', fieldType: 'dropdown', required: true },
  { fieldCode: 'payroll_location', fieldName: '发薪地', fieldType: 'text', required: false },
  { fieldCode: 'social_base', fieldName: '社保基数', fieldType: 'number', required: false },
];

describe('AiMappingService', () => {
  const originalForceLlm = process.env.AI_FORCE_LLM;

  afterEach(() => {
    if (originalForceLlm === undefined) {
      delete process.env.AI_FORCE_LLM;
    } else {
      process.env.AI_FORCE_LLM = originalForceLlm;
    }
  });

  it('matches golden aliases locally first and calls LLM only for remaining headers', async () => {
    const headers = ['姓名', '手机号', 'Id Card', '基本薪资(元)', '是否需要集约', '客户编码', '派遣地', '公积金基数', '合同起', '合同止'];
    const content = JSON.stringify({
      suggestion: {
        是否需要集约: 'need_onboarding_contact',
      },
      confidence: { 是否需要集约: 0.95 },
      unmatched: [],
    });
    const openai = providerStub({ available: true, content });
    const service = new AiMappingService(
      openai,
      providerStub({ available: false, name: 'qwen' }) as unknown as QwenProvider,
      providerStub({ available: false, name: 'deepseek' }) as unknown as DeepSeekProvider,
    );

    const result = await service.suggest('onboarding', headers, fields);
    const prompt = (openai.call as jest.Mock).mock.calls[0][0] as LlmPrompt;
    const promptUser = JSON.parse(prompt.user) as { headers: string[]; candidateFields: CandidateField[] };

    expect(Object.keys(result.suggestion)).toHaveLength(10);
    expect(result.suggestion['Id Card']).toBe('id_card_no');
    expect(result.suggestion['是否需要集约']).toBe('need_onboarding_contact');
    expect(result.unmatched).toEqual([]);
    expect(result.modelUsed).toBe('openai:mock-model local:9 + llm:1');
    expect(result.localMatchedCount).toBe(9);
    expect(result.llmMatchedCount).toBe(1);
    expect(promptUser.headers).toEqual(['是否需要集约']);
    expect(promptUser.candidateFields.map((field) => field.fieldCode)).toContain('need_onboarding_contact');
    expect(promptUser.candidateFields.map((field) => field.fieldCode)).not.toContain('employee_name');
  });

  it('returns local-only without checking providers when high-confidence local mapping covers all headers', async () => {
    const openai = providerStub({ available: false });
    const service = new AiMappingService(
      openai,
      providerStub({ available: false, name: 'qwen' }) as unknown as QwenProvider,
      providerStub({ available: false, name: 'deepseek' }) as unknown as DeepSeekProvider,
    );

    const result = await service.suggest('onboarding', ['employee_name', 'mobile'], fields);

    expect(result.modelUsed).toBe('local-only');
    expect(result.suggestion.employee_name).toBe('employee_name');
    expect(result.localMatchedCount).toBe(2);
    expect(result.llmMatchedCount).toBe(0);
    expect(openai.isAvailable).not.toHaveBeenCalled();
    expect(openai.call).not.toHaveBeenCalled();
  });

  it('classifies provider HTTP errors as concrete fallback reasons when AI_FORCE_LLM is enabled', async () => {
    process.env.AI_FORCE_LLM = 'true';
    const service = new AiMappingService(
      providerStub({ available: true, error: { response: { status: 403 } } }),
      providerStub({ available: false, name: 'qwen' }) as unknown as QwenProvider,
      providerStub({ available: false, name: 'deepseek' }) as unknown as DeepSeekProvider,
    );

    const result = await service.suggest('onboarding', ['employee_name'], fields);

    expect(result.modelUsed).toBe('fallback:fuzzy local:1 + llm:0');
    expect(result.fallbackReason).toBe('403');
    expect(result.localMatchedCount).toBe(1);
    expect(result.llmMatchedCount).toBe(0);
  });

  it('maps business aliases locally without external AI when confidence is high enough', async () => {
    const openai = providerStub({ available: false });
    const service = new AiMappingService(
      openai,
      providerStub({ available: false, name: 'qwen' }) as unknown as QwenProvider,
      providerStub({ available: false, name: 'deepseek' }) as unknown as DeepSeekProvider,
    );

    const headers = [
      '员工姓名',
      '联系电话',
      '身份证号码',
      '入职材料是否需要集约收集',
      '是否签订劳动合同',
      '发薪城市',
      '社保缴费基数',
      '合同期限形式/固定期限',
    ];
    const result = await service.suggest('onboarding', headers, fields);

    expect(result.modelUsed).toBe('local-only');
    expect(result.suggestion['员工姓名']).toBe('employee_name');
    expect(result.suggestion['联系电话']).toBe('mobile');
    expect(result.suggestion['身份证号码']).toBe('id_card_no');
    expect(result.suggestion['入职材料是否需要集约收集']).toBe('need_onboarding_contact');
    expect(result.suggestion['是否签订劳动合同']).toBe('need_company_contract');
    expect(result.suggestion['发薪城市']).toBe('payroll_location');
    expect(result.suggestion['社保缴费基数']).toBe('social_base');
    expect(result.suggestion['合同期限形式/固定期限']).toBe('contract_term_type');
    expect(result.unmatched).toEqual([]);
    expect(result.localMatchedCount).toBe(8);
    expect(result.llmMatchedCount).toBe(0);
    expect(openai.call).not.toHaveBeenCalled();
  });
});
