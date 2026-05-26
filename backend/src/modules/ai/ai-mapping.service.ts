import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { CandidateField, MappingSuggestion } from 'src/modules/imports/types';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { LlmProvider } from './providers/llm-provider.interface';
import { OpenAiProvider } from './providers/openai.provider';
import { QwenProvider } from './providers/qwen.provider';

interface CacheItem {
  expiresAt: number;
  value: MappingSuggestion;
}

const FIELD_ALIASES: Record<string, string[]> = {
  customer_name: ['客户', '客户名称', '客户全称', '公司名称', '用工客户', '客户单位', '商社名称'],
  customer_code: ['客户代码', '客户编码', '客户编号', '客户ID', '客户id', '商社代码', '商社编码'],
  outsource_type: ['外包类型', '服务类型', '业务类型', '外包模式'],
  position: ['岗位', '职位', '职务', '岗位名称', '任职岗位'],
  employee_name: ['姓名', '员工姓名', '雇员姓名', '人员姓名', '入职人员', '候选人姓名'],
  id_card_no: ['身份证号', '身份证号码', '证件号码', '证件号', '身份证号护照', '身份证/护照', '护照号', '护照号码'],
  gender: ['性别'],
  birth_date: ['出生日期', '生日', '出生年月'],
  age: ['年龄'],
  household_type: ['户籍性质', '户口性质', '户籍类型'],
  ethnicity: ['民族'],
  mobile: ['移动电话', '手机号', '手机号码', '手机', '联系电话', '联系手机', '电话', '员工电话', '个人电话'],
  email: ['电子邮件', '邮箱', '电子邮箱', '邮件地址', 'email'],
  current_address: ['现住地址', '现居住地址', '居住地址', '通信地址', '联系地址'],
  household_address: ['户籍地址', '户口地址', '户籍所在地'],
  postal_code: ['邮编', '邮政编码'],
  contract_term_type: ['合同期限形式', '合同类型', '劳动合同期限形式', '期限形式', '合同期限'],
  contract_term: ['合同期限', '劳动合同期限', '合同年限'],
  contract_start_date: ['合同开始日期', '合同起始日期', '合同开始', '合同起', '劳动合同开始日期', '入职日期', '入职时间'],
  contract_end_date: ['合同终止日期', '合同结束日期', '合同结束', '合同止', '劳动合同结束日期'],
  probation_start_date: ['试用期开始日期', '试用开始日期', '试用期开始'],
  probation_months: ['试用期(月)', '试用期月', '试用期(月)', '试用期月份', '试用期月数', '试用期'],
  probation_end_date: ['试用期结束日期', '试用结束日期', '试用期结束'],
  work_city: ['工作城市', '工作地', '工作地点', '派遣地', '办公城市'],
  work_hour_system: ['工时制', '工时制度', '工作时间制度'],
  work_cycle: ['工作制周期', '工作周期', '班制周期'],
  salary_form: ['工资形式', '薪资形式', '薪酬形式'],
  base_salary: ['基本工资', '基本薪资', '月基本工资', '基本薪酬'],
  other_salary: ['其他工资', '其他薪资', '补贴', '津贴'],
  probation_salary: ['试用期工资', '试用工资', '试用期薪资'],
  payroll_cycle: ['发薪周期', '薪资周期', '工资周期'],
  payroll_date: ['发薪日期', '发薪日', '工资发放日', '工资日期'],
  payroll_location: ['发薪地', '发薪城市', '工资发放地', '薪资发放地'],
  pay_location: ['发薪地', '发薪城市', '工资发放地', '薪资发放地'],
  social_location: ['参保地', '社保地', '社保缴纳地', '社保城市', '社保公积金缴纳地'],
  start_month: ['起始月', '起缴月', '社保起缴月', '社保起始月', '缴纳起始月', '参保起始月'],
  social_base: ['社保基数', '社会保险基数', '社保缴费基数'],
  fund_base: ['公积金基数', '住房公积金基数', '公积金缴费基数'],
  fund_ratio: ['公积金比例', '住房公积金比例', '公积金缴纳比例'],
  bank_name: ['开户银行信息', '开户银行', '银行名称', '开户行', '开户行名称'],
  bank_account: ['银行借记卡账号', '银行账号', '银行卡号', '银行卡账号', '工资卡号'],
  remark: ['备注', '说明', '普通备注'],
  business_mode: ['业务模式', '用工模式', '合作模式'],
  employee_type: ['人员类型', '员工类型', '用工类型'],
  need_company_contract: ['是否企服发起劳动合同', '是否签订劳动合同', '是否需要劳动合同', '是否发起劳动合同', '是否公司发起劳动合同', '是否企服发起合同'],
  contract_subject: ['劳动合同主体', '合同主体', '签约主体'],
  contract_template: ['劳动合同模板', '合同模板', '合同版本'],
  need_contract_urge: ['劳动合同签署是否需要催办员工', '合同签署是否需要催办', '是否需要催签合同', '是否催办合同', '是否需催办劳动合同签署', '是否需要催办劳动合同签署', '劳动合同催办', '劳动合同签署催办'],
  contract_feedback: ['劳动合同签订反馈', '合同签订反馈', '合同反馈'],
  need_onboarding_contact: ['入职材料是否需要集约收集', '是否需要入职联系', '是否收集入职材料', '是否需要收集入职材料', '是否集约收集', '入职材料收集'],
  onboarding_feedback: ['入职联系反馈', '联系反馈', '入职材料反馈'],
  need_company_payroll: ['是否企服发薪', '是否公司发薪', '是否代发薪', '是否发薪'],
  special_remark: ['特殊备注', '特别备注', '特殊说明'],
  data_entry_feedback: ['数据录入反馈', '录入反馈', '数据反馈'],
};

@Injectable()
export class AiMappingService {
  private readonly logger = new Logger(AiMappingService.name);
  private readonly cache = new Map<string, CacheItem>();
  private readonly cacheTtlMs = 24 * 60 * 60 * 1000;
  private readonly cacheMax = 1000;

  constructor(
    private readonly openAiProvider: OpenAiProvider,
    private readonly qwenProvider: QwenProvider,
    private readonly deepSeekProvider: DeepSeekProvider,
  ) {}

  async suggest(
    orderType: string,
    headers: string[],
    candidateFields: CandidateField[],
  ): Promise<MappingSuggestion> {
    const forceLlm = this.isForceLlm();
    const promptHash = this.hash({
      version: 'local-first-v1',
      orderType,
      headers,
      fields: candidateFields.map((field) => field.fieldCode),
      forceLlm,
    });
    const cached = this.readCache(promptHash);
    if (cached) {
      return cached;
    }

    const localResult = forceLlm
      ? this.emptyLocalMatch(headers)
      : this.localMatch(headers, candidateFields, 0.85);

    if (!forceLlm && localResult.unmatched.length === 0) {
      const localOnly = this.toLocalOnlySuggestion(localResult, candidateFields, promptHash);
      this.writeCache(promptHash, localOnly);
      return localOnly;
    }

    const usedLocalFieldCodes = new Set(Object.values(localResult.suggestion));
    const llmHeaders = forceLlm ? headers : localResult.unmatched;
    const llmCandidateFields = forceLlm
      ? candidateFields
      : candidateFields.filter((field) => !usedLocalFieldCodes.has(field.fieldCode));
    const prompt = this.buildPrompt(orderType, llmHeaders, llmCandidateFields);

    for (const provider of this.providers()) {
      if (!(await provider.isAvailable())) {
        this.logger.debug(`LLM provider ${provider.name} unavailable (missing API key or disabled), skipping`);
        continue;
      }
      try {
        const result = await provider.call(prompt);
        const normalized = await this.normalizeLlmResult(result.content, result.raw, llmCandidateFields, promptHash, provider);
        normalized.suggestion = this.remapFieldNamesToHeaders(normalized.suggestion, llmHeaders, llmCandidateFields);
        const merged = this.mergeLlmResult(localResult, normalized, headers, candidateFields, promptHash);
        this.writeCache(promptHash, merged);
        return merged;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        const modelId = await this.readProviderModelId(provider);
        this.logger.error(
          `LLM provider ${provider.name} (${modelId}) failed: ${message}; falling back to local Jaccard+Levenshtein fuzzy match for unmatched headers only`,
          stack,
        );
        const fallback = this.fallbackFuzzy(llmHeaders, llmCandidateFields, promptHash, this.classifyFallbackReason(error));
        const merged = this.mergeFallbackResult(localResult, fallback, headers, candidateFields, promptHash);
        this.writeCache(promptHash, merged);
        return merged;
      }
    }

    this.logger.warn(
      'No LLM provider available (missing API key or all providers disabled); using local Jaccard+Levenshtein fuzzy match for unmatched headers only',
    );
    const fallback = this.fallbackFuzzy(llmHeaders, llmCandidateFields, promptHash, 'no_api_key');
    const merged = this.mergeFallbackResult(localResult, fallback, headers, candidateFields, promptHash);
    this.writeCache(promptHash, merged);
    return merged;
  }

  fallbackFuzzy(
    headers: string[],
    candidateFields: CandidateField[],
    promptHash = this.hash({ headers, candidateFields }),
    reason: MappingSuggestion['fallbackReason'] = 'no_api_key',
  ): MappingSuggestion {
    const local = this.localMatch(headers, candidateFields, 0.6);
    const localMatchedCount = Object.keys(local.suggestion).length;

    return {
      suggestion: local.suggestion,
      confidence: local.confidence,
      unmatched: local.unmatched,
      missingRequired: this.findMissingRequired(candidateFields, local.suggestion),
      modelUsed: 'fallback:fuzzy',
      promptHash,
      localMatchedCount,
      llmMatchedCount: 0,
      fallbackReason: reason,
    };
  }

  private localMatch(headers: string[], candidateFields: CandidateField[], threshold: number) {
    const suggestion: Record<string, string> = {};
    const confidence: Record<string, number> = {};
    const unmatched: string[] = [];
    const usedFields = new Set<string>();

    for (const header of headers) {
      const ranked = candidateFields
        .map((field) => ({ field, score: this.score(header, field) }))
        .sort((left, right) => right.score - left.score);
      const best = ranked.find((item) => !usedFields.has(item.field.fieldCode));
      if (!best || best.score < threshold) {
        unmatched.push(header);
        continue;
      }
      suggestion[header] = best.field.fieldCode;
      confidence[header] = Number(best.score.toFixed(3));
      usedFields.add(best.field.fieldCode);
    }

    return { suggestion, confidence, unmatched };
  }

  private emptyLocalMatch(headers: string[]) {
    return { suggestion: {}, confidence: {}, unmatched: [...headers] };
  }

  private toLocalOnlySuggestion(
    localResult: ReturnType<AiMappingService['localMatch']>,
    candidateFields: CandidateField[],
    promptHash: string,
  ): MappingSuggestion {
    const localMatchedCount = Object.keys(localResult.suggestion).length;
    return {
      suggestion: localResult.suggestion,
      confidence: localResult.confidence,
      unmatched: localResult.unmatched,
      missingRequired: this.findMissingRequired(candidateFields, localResult.suggestion),
      modelUsed: 'local-only',
      promptHash,
      localMatchedCount,
      llmMatchedCount: 0,
    };
  }

  private mergeLlmResult(
    localResult: ReturnType<AiMappingService['localMatch']>,
    llmResult: MappingSuggestion,
    headers: string[],
    candidateFields: CandidateField[],
    promptHash: string,
  ): MappingSuggestion {
    const suggestion = { ...localResult.suggestion };
    const confidence = { ...localResult.confidence };
    let llmMatchedCount = 0;
    const usedFields = new Set(Object.values(suggestion));

    for (const [header, fieldCode] of Object.entries(llmResult.suggestion)) {
      if (!headers.includes(header) || usedFields.has(fieldCode)) {
        continue;
      }
      suggestion[header] = fieldCode;
      confidence[header] = llmResult.confidence[header] ?? 0.5;
      usedFields.add(fieldCode);
      llmMatchedCount += 1;
    }

    const localMatchedCount = Object.keys(localResult.suggestion).length;
    return {
      suggestion,
      confidence,
      unmatched: headers.filter((header) => !suggestion[header]),
      missingRequired: this.findMissingRequired(candidateFields, suggestion),
      modelUsed: `${llmResult.modelUsed} local:${localMatchedCount} + llm:${llmMatchedCount}`,
      promptHash,
      localMatchedCount,
      llmMatchedCount,
      raw: llmResult.raw,
    };
  }

  private mergeFallbackResult(
    localResult: ReturnType<AiMappingService['localMatch']>,
    fallback: MappingSuggestion,
    headers: string[],
    candidateFields: CandidateField[],
    promptHash: string,
  ): MappingSuggestion {
    const suggestion = { ...localResult.suggestion };
    const confidence = { ...localResult.confidence };
    const usedFields = new Set(Object.values(suggestion));

    for (const [header, fieldCode] of Object.entries(fallback.suggestion)) {
      if (!headers.includes(header) || usedFields.has(fieldCode)) {
        continue;
      }
      suggestion[header] = fieldCode;
      confidence[header] = fallback.confidence[header] ?? 0.5;
      usedFields.add(fieldCode);
    }

    const localMatchedCount = Object.keys(suggestion).length;
    return {
      suggestion,
      confidence,
      unmatched: headers.filter((header) => !suggestion[header]),
      missingRequired: this.findMissingRequired(candidateFields, suggestion),
      modelUsed: `fallback:fuzzy local:${localMatchedCount} + llm:0`,
      promptHash,
      localMatchedCount,
      llmMatchedCount: 0,
      fallbackReason: fallback.fallbackReason,
    };
  }

  private providers(): LlmProvider[] {
    return [this.openAiProvider, this.qwenProvider, this.deepSeekProvider];
  }

  private buildPrompt(orderType: string, headers: string[], candidateFields: CandidateField[]) {
    return {
      system: [
        '你是字段映射助手，只能输出严格 JSON。',
        '只允许映射到候选字段中的 fieldCode；无法判断的列必须放入 unmatched。',
        '输出结构必须为 {"suggestion":{},"confidence":{},"unmatched":[]}。',
      ].join('\n'),
      user: JSON.stringify({ orderType, candidateFields, headers }),
    };
  }

  private async normalizeLlmResult(
    content: string,
    raw: unknown,
    candidateFields: CandidateField[],
    promptHash: string,
    provider: LlmProvider,
  ): Promise<MappingSuggestion> {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const rawSuggestion = this.readRecord(parsed.suggestion);
    const rawConfidence = this.readRecord(parsed.confidence);
    const candidateSet = new Set(candidateFields.map((field) => field.fieldCode));
    const suggestion: Record<string, string> = {};
    const confidence: Record<string, number> = {};
    const unmatched = new Set<string>(this.readStringArray(parsed.unmatched));
    const fieldOwner = new Map<string, string>();

    for (const [header, fieldCodeValue] of Object.entries(rawSuggestion)) {
      if (typeof fieldCodeValue !== 'string' || !candidateSet.has(fieldCodeValue)) {
        unmatched.add(header);
        continue;
      }
      const nextScore = this.toScore(rawConfidence[header]);
      const existingHeader = fieldOwner.get(fieldCodeValue);
      if (existingHeader) {
        const existingScore = confidence[existingHeader] ?? 0;
        if (nextScore <= existingScore) {
          unmatched.add(header);
          continue;
        }
        delete suggestion[existingHeader];
        delete confidence[existingHeader];
        unmatched.add(existingHeader);
      }
      suggestion[header] = fieldCodeValue;
      confidence[header] = nextScore;
      fieldOwner.set(fieldCodeValue, header);
      unmatched.delete(header);
    }

    return {
      suggestion,
      confidence,
      unmatched: Array.from(unmatched),
      missingRequired: this.findMissingRequired(candidateFields, suggestion),
      modelUsed: `${provider.name}:${await this.readProviderModelId(provider)}`,
      promptHash,
      localMatchedCount: 0,
      llmMatchedCount: Object.keys(suggestion).length,
      raw: this.readRecord(raw),
    };
  }

  /**
   * LLM may return a fieldName as the key instead of the original Excel header.
   * Remap such keys back to the matching header so downstream mapping can look up row values.
   */
  private remapFieldNamesToHeaders(
    suggestion: Record<string, string>,
    headers: string[],
    candidateFields: CandidateField[],
  ): Record<string, string> {
    const headerSet = new Set(headers);
    if (Object.keys(suggestion).every((key) => headerSet.has(key))) {
      return suggestion;
    }

    const fieldNameToCode = new Map(candidateFields.map((f) => [f.fieldName, f.fieldCode]));
    const result: Record<string, string> = {};
    const usedHeaders = new Set<string>();

    for (const [key, code] of Object.entries(suggestion)) {
      if (headerSet.has(key)) {
        result[key] = code;
        usedHeaders.add(key);
        continue;
      }
      // Key is likely a fieldName — find an unused header whose fieldCode matches
      const resolved = headers.find(
        (h) => !usedHeaders.has(h) && fieldNameToCode.get(key) === code,
      );
      if (resolved) {
        result[resolved] = code;
        usedHeaders.add(resolved);
      } else {
        // Keep as-is if we cannot safely remap
        result[key] = code;
      }
    }
    return result;
  }

  private score(header: string, field: CandidateField): number {
    const sources = this.headerCandidates(header);
    const targets = this.fieldCandidates(field);
    let best = 0;

    for (const source of sources) {
      for (const target of targets) {
        if (source === target) {
          return 1;
        }
        if (source.includes(target) || target.includes(source)) {
          const containScore = Math.min(source.length, target.length) / Math.max(source.length, target.length);
          best = Math.max(best, Math.min(0.95, 0.72 + containScore * 0.23));
        }
        best = Math.max(best, this.weightedSimilarity(source, target));
      }
    }

    return best;
  }

  private weightedSimilarity(left: string, right: string): number {
    if (left.length === 0 || right.length === 0) {
      return 0;
    }
    const jaccard = this.jaccard(this.bigrams(left), this.bigrams(right));
    const edit = 1 - this.levenshtein(left, right) / Math.max(left.length, right.length);
    return 0.6 * jaccard + 0.4 * edit;
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/[\s\-_()/【】\[\]{}:：，,。\.；;、*"'“”‘’]/g, '')
      .replace(/的|之|是否/g, '')
      .trim();
  }

  private headerCandidates(header: string): string[] {
    const raw = String(header ?? '').trim();
    const parts = new Set<string>([raw]);
    raw.split(/[\/\\|｜:：\n\r]+/g)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => parts.add(item));
    raw.replace(/（/g, '(').replace(/）/g, ')').replace(/\([^)]*\)/g, '')
      .split(/[\/\\|｜:：\n\r]+/g)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => parts.add(item));

    return Array.from(parts)
      .map((item) => this.normalize(item))
      .filter((item) => item.length > 0);
  }

  private fieldCandidates(field: CandidateField): string[] {
    const values = new Set<string>([
      field.fieldName,
      field.fieldCode,
      ...field.fieldCode.split('_'),
      ...(FIELD_ALIASES[field.fieldCode] ?? []),
    ]);

    return Array.from(values)
      .flatMap((item) => this.headerCandidates(item))
      .filter((item, index, array) => item.length > 0 && array.indexOf(item) === index);
  }

  private bigrams(value: string): Set<string> {
    if (value.length <= 1) {
      return new Set([value]);
    }
    const result = new Set<string>();
    for (let index = 0; index < value.length - 1; index += 1) {
      result.add(value.slice(index, index + 2));
    }
    return result;
  }

  private jaccard(left: Set<string>, right: Set<string>): number {
    const union = new Set([...left, ...right]);
    if (union.size === 0) {
      return 0;
    }
    let intersection = 0;
    for (const item of left) {
      if (right.has(item)) {
        intersection += 1;
      }
    }
    return intersection / union.size;
  }

  private levenshtein(left: string, right: string): number {
    const dp: number[][] = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
    for (let i = 0; i <= left.length; i += 1) dp[i][0] = i;
    for (let j = 0; j <= right.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= left.length; i += 1) {
      for (let j = 1; j <= right.length; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[left.length][right.length];
  }

  private findMissingRequired(candidateFields: CandidateField[], suggestion: Record<string, string>): string[] {
    const mapped = new Set(Object.values(suggestion));
    return candidateFields.filter((field) => field.required && !mapped.has(field.fieldCode)).map((field) => field.fieldCode);
  }

  private classifyFallbackReason(error: unknown): MappingSuggestion['fallbackReason'] {
    const maybe = error as { name?: string; code?: string; status?: number; response?: { status?: number }; getStatus?: () => number };
    const status = maybe.response?.status ?? maybe.status ?? (typeof maybe.getStatus === 'function' ? maybe.getStatus() : undefined);
    if (status === 401) return '401';
    if (status === 403) return '403';
    if (status === 404) return '404';
    if (maybe.name === 'TimeoutError' || maybe.code === 'ECONNABORTED' || maybe.code === 'ETIMEDOUT') return 'timeout';
    if (maybe.code === 'ENOTFOUND' || maybe.code === 'ECONNREFUSED' || maybe.code === 'ECONNRESET' || maybe.code === 'EAI_AGAIN') return 'network';
    return 'other';
  }

  private isForceLlm(): boolean {
    return String(process.env.AI_FORCE_LLM ?? '').toLowerCase() === 'true';
  }

  private readCache(key: string): MappingSuggestion | null {
    const item = this.cache.get(key);
    if (!item || item.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  private writeCache(key: string, value: MappingSuggestion): void {
    if (this.cache.size >= this.cacheMax) {
      const firstKey = this.cache.keys().next().value as string | undefined;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private async readProviderModelId(provider: LlmProvider): Promise<string> {
    if (typeof provider.getModelId === 'function') {
      return provider.getModelId().catch(() => '');
    }
    const modelId = (provider as unknown as { modelId?: unknown }).modelId;
    return typeof modelId === 'string' ? modelId : '';
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private toScore(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
  }
}
