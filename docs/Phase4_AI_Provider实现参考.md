# Phase 4 AI Provider 实现参考

> 版本：v1.0（2026-05-11）
> 面向：Phase 4 后端返工同事（第二轮）
> 作者：architect
> 关联：`docs/Phase4AI导入服务分层设计.md` §3、`docs/Phase4导入与回流设计.md` §2、`docs/Phase4AI映射样本库.md`、`docs/Phase4后端返工指导.md`。
>
> **本文定位**：把 AI Provider 从"设计描述"落到"可直接复制到 `backend/src/modules/ai/` 的 TypeScript 文件"。**每个代码块都标注文件路径**，backend 同学只需 `cp` 过去按 `// TODO` 填依赖即可。

---

## 目录
- [1. 模块骨架与依赖](#1-模块骨架与依赖)
- [2. 类型定义 `llm-provider.interface.ts`](#2-类型定义-llm-providerinterfacets)
- [3. 基类 `base-openai-compat.provider.ts`](#3-基类-base-openai-compatproviderts)
- [4. OpenAIProvider](#4-openaiprovider)
- [5. QwenProvider（阿里百炼，OpenAI 兼容）](#5-qwenprovider阿里百炼openai-兼容)
- [6. DeepSeekProvider](#6-deepseekprovider)
- [7. MockLlmProvider（单测用）](#7-mockllmprovider单测用)
- [8. FuzzyMatchProvider（fallback）](#8-fuzzymatchproviderfallback)
- [9. ProviderFactory 与依赖注入](#9-providerfactory-与依赖注入)
- [10. AiMappingService（LRU + 失败冷却 + fallback 编排）](#10-aimappingservicelru--失败冷却--fallback-编排)
- [11. `prompts/system.md` 与 Few-shot](#11-promptssystemmd-与-few-shot)
- [12. 单测骨架（golden snapshot）](#12-单测骨架golden-snapshot)
- [13. 交付自检清单（backend）](#13-交付自检清单backend)

---

## 1. 模块骨架与依赖

```
backend/src/modules/ai/
├── ai.module.ts
├── controllers/
│   └── field-mapping.controller.ts
├── services/
│   ├── ai-mapping.service.ts
│   └── provider.factory.ts
├── providers/
│   ├── llm-provider.interface.ts
│   ├── base-openai-compat.provider.ts
│   ├── openai.provider.ts
│   ├── qwen.provider.ts
│   ├── deepseek.provider.ts
│   ├── mock.provider.ts
│   └── fuzzy-match.provider.ts
├── dto/
│   ├── field-mapping.dto.ts
│   └── mapping-suggestion.dto.ts
├── prompts/
│   ├── system.md
│   └── few-shot.ts
└── cache/
    └── mapping-lru.cache.ts
```

**依赖（`package.json` 新增）**：

```jsonc
{
  "dependencies": {
    "openai": "^4.52.0",           // 官方 SDK v4，兼容 OpenAI / Qwen / DeepSeek
    "lru-cache": "^10.2.0",
    "object-hash": "^3.0.0",
    "fast-levenshtein": "^3.0.0"   // fuzzy fallback
  },
  "devDependencies": {
    "@types/fast-levenshtein": "^0.0.4",
    "@types/object-hash": "^3.0.6"
  }
}
```

---

## 2. 类型定义 `llm-provider.interface.ts`

> **文件**：`backend/src/modules/ai/providers/llm-provider.interface.ts`

```ts
export interface FieldCandidate {
  fieldCode: string;
  fieldName: string;
  fieldType: 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'dropdown';
  required: boolean;
  aliases?: string[];
}

export interface MappingSuggestionItem {
  headerIndex: number;
  header: string;
  fieldCode: string | null;
  confidence: number;
  reason?: string;
  alt?: Array<{ fieldCode: string; confidence: number }>;
}

export interface MappingSuggestion {
  items: MappingSuggestionItem[];
  unmatchedHeaders: string[];
  missingRequired: string[];
  modelUsed: string;
  promptHash: string;
  fallbackReason?:
    | 'no_api_key'
    | 'timeout'
    | 'rate_limit'
    | 'schema_invalid'
    | 'provider_error'
    | 'cache_miss_degraded';
  raw?: unknown;
}

export interface LlmProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
}

export abstract class LlmProvider {
  abstract readonly name: 'openai' | 'qwen' | 'deepseek' | 'mock' | 'fuzzy';
  abstract readonly modelId: string;

  abstract mapColumns(
    headers: string[],
    candidates: FieldCandidate[],
    orderType: string,
  ): Promise<MappingSuggestion>;

  abstract isAvailable(): Promise<boolean>;
}
```

---

## 3. 基类 `base-openai-compat.provider.ts`

> **文件**：`backend/src/modules/ai/providers/base-openai-compat.provider.ts`
>
> OpenAI / Qwen / DeepSeek 都走 OpenAI Chat Completions 兼容格式，提炼公共类。

```ts
import OpenAI from 'openai';
import { Logger } from '@nestjs/common';
import objectHash from 'object-hash';
import {
  FieldCandidate,
  LlmProvider,
  LlmProviderConfig,
  MappingSuggestion,
  MappingSuggestionItem,
} from './llm-provider.interface';
import { buildFewShot, SYSTEM_PROMPT } from '../prompts/few-shot';

interface RawLlmResponse {
  suggestion: Record<string, string>;
  confidence: Record<string, number>;
  unmatched: string[];
  missing_required: string[];
}

export abstract class BaseOpenAiCompatProvider extends LlmProvider {
  protected readonly logger = new Logger(this.constructor.name);
  protected readonly client: OpenAI;

  abstract readonly name: 'openai' | 'qwen' | 'deepseek';
  abstract readonly modelId: string;

  constructor(protected readonly config: LlmProviderConfig) {
    super();
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
      maxRetries: 0,
    });
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      await this.client.models.list();
      return true;
    } catch (err) {
      this.logger.warn(
        `[${this.name}] isAvailable=false: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async mapColumns(
    headers: string[],
    candidates: FieldCandidate[],
    orderType: string,
  ): Promise<MappingSuggestion> {
    const promptHash = objectHash({
      provider: this.name,
      orderType,
      headers: [...headers].sort(),
      fields: candidates.map((c) => c.fieldCode).sort(),
    });

    const messages = this.buildMessages(headers, candidates, orderType);
    const resp = await this.client.chat.completions.create({
      model: this.modelId,
      messages,
      temperature: 0.1,
      max_tokens: this.config.maxTokens,
      response_format: { type: 'json_object' },
    });

    const content = resp.choices[0]?.message?.content ?? '';
    const parsed = this.parseJson(content);
    return this.toSuggestion(parsed, headers, candidates, promptHash, resp);
  }

  protected buildMessages(
    headers: string[],
    candidates: FieldCandidate[],
    orderType: string,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      ...buildFewShot(headers),
      {
        role: 'user',
        content: [
          `<订单类型>: ${orderType}`,
          '',
          '<候选字段>（JSON）:',
          JSON.stringify(
            candidates.map((c) => ({
              fieldCode: c.fieldCode,
              fieldName: c.fieldName,
              fieldType: c.fieldType,
              required: c.required,
            })),
          ),
          '',
          '<Excel 表头>（JSON 数组）:',
          JSON.stringify(headers),
          '',
          '请输出如下结构的 JSON（严格，不要 markdown 包装）：',
          '{"suggestion":{},"confidence":{},"unmatched":[],"missing_required":[]}',
        ].join('\n'),
      },
    ];
  }

  protected parseJson(content: string): RawLlmResponse {
    let text = content.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '');
    }
    let obj: unknown;
    try {
      obj = JSON.parse(text);
    } catch (err) {
      throw new Error(`LLM 返回非 JSON：${(err as Error).message}`);
    }
    if (
      !obj ||
      typeof obj !== 'object' ||
      !('suggestion' in obj) ||
      !('confidence' in obj)
    ) {
      throw new Error('LLM 返回 JSON 结构不合法');
    }
    return obj as RawLlmResponse;
  }

  protected toSuggestion(
    raw: RawLlmResponse,
    headers: string[],
    candidates: FieldCandidate[],
    promptHash: string,
    rawResp: unknown,
  ): MappingSuggestion {
    const validFieldSet = new Set(candidates.map((c) => c.fieldCode));
    const items: MappingSuggestionItem[] = [];
    const unmatched: string[] = Array.from(new Set(raw.unmatched ?? []));

    headers.forEach((header, idx) => {
      const field = raw.suggestion?.[header];
      const conf = Number(raw.confidence?.[header] ?? 0);

      if (!field || !validFieldSet.has(field)) {
        if (!unmatched.includes(header)) unmatched.push(header);
        items.push({ headerIndex: idx, header, fieldCode: null, confidence: 0 });
        return;
      }

      if (conf < 0.5) {
        if (!unmatched.includes(header)) unmatched.push(header);
        items.push({
          headerIndex: idx,
          header,
          fieldCode: null,
          confidence: conf,
          reason: 'confidence_below_threshold',
          alt: [{ fieldCode: field, confidence: conf }],
        });
        return;
      }

      items.push({
        headerIndex: idx,
        header,
        fieldCode: field,
        confidence: conf,
        reason: 'llm_match',
      });
    });

    const mappedCodes = new Set(
      items.filter((i) => i.fieldCode).map((i) => i.fieldCode as string),
    );
    const missingRequired = candidates
      .filter((c) => c.required && !mappedCodes.has(c.fieldCode))
      .map((c) => c.fieldCode);

    return {
      items,
      unmatchedHeaders: unmatched,
      missingRequired,
      modelUsed: `${this.name}:${this.modelId}`,
      promptHash,
      raw: rawResp,
    };
  }
}
```

---

## 4. OpenAIProvider

> **文件**：`backend/src/modules/ai/providers/openai.provider.ts`

```ts
import { Injectable } from '@nestjs/common';
import { BaseOpenAiCompatProvider } from './base-openai-compat.provider';
import { LlmProviderConfig } from './llm-provider.interface';

@Injectable()
export class OpenAIProvider extends BaseOpenAiCompatProvider {
  readonly name = 'openai' as const;
  readonly modelId: string;

  constructor(config: LlmProviderConfig) {
    super(config);
    this.modelId = config.model || 'gpt-4o-mini';
  }
}
```

`.env` 变量：

```
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

---

## 5. QwenProvider（阿里百炼，OpenAI 兼容）

> **文件**：`backend/src/modules/ai/providers/qwen.provider.ts`
>
> 百炼兼容 OpenAI 格式入口：`https://dashscope.aliyuncs.com/compatible-mode/v1`

```ts
import { Injectable } from '@nestjs/common';
import { BaseOpenAiCompatProvider } from './base-openai-compat.provider';
import { LlmProviderConfig } from './llm-provider.interface';

@Injectable()
export class QwenProvider extends BaseOpenAiCompatProvider {
  readonly name = 'qwen' as const;
  readonly modelId: string;

  constructor(config: LlmProviderConfig) {
    super({
      ...config,
      baseUrl:
        config.baseUrl ||
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
    this.modelId = config.model || 'qwen-turbo';
  }
}
```

`.env`：

```
QWEN_API_KEY=sk-...
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-turbo
```

---

## 6. DeepSeekProvider

> **文件**：`backend/src/modules/ai/providers/deepseek.provider.ts`

```ts
import { Injectable } from '@nestjs/common';
import { BaseOpenAiCompatProvider } from './base-openai-compat.provider';
import { LlmProviderConfig } from './llm-provider.interface';

@Injectable()
export class DeepSeekProvider extends BaseOpenAiCompatProvider {
  readonly name = 'deepseek' as const;
  readonly modelId: string;

  constructor(config: LlmProviderConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://api.deepseek.com/v1',
    });
    this.modelId = config.model || 'deepseek-chat';
  }
}
```

`.env`：

```
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

---

## 7. MockLlmProvider（单测用）

> **文件**：`backend/src/modules/ai/providers/mock.provider.ts`
>
> 根据 `docs/Phase4AI映射样本库.md` 10 组 golden 样本直接返回预烘焙结果，Jest 单测拿来做 snapshot 对比。

```ts
import { Injectable } from '@nestjs/common';
import objectHash from 'object-hash';
import {
  FieldCandidate,
  LlmProvider,
  MappingSuggestion,
  MappingSuggestionItem,
} from './llm-provider.interface';

type GoldenMap = Record<string, string>;

const GOLDEN_SAMPLES: Array<{
  headers: string[];
  mapping: GoldenMap;
  confidence: Record<string, number>;
  unmatched: string[];
}> = [
  {
    headers: ['客户名称', '员工姓名', '身份证号', '手机号', '岗位', '基本工资'],
    mapping: {
      客户名称: 'customer_name',
      员工姓名: 'employee_name',
      身份证号: 'id_card_no',
      手机号: 'mobile',
      岗位: 'position',
      基本工资: 'base_salary',
    },
    confidence: {
      客户名称: 0.99,
      员工姓名: 0.95,
      身份证号: 0.99,
      手机号: 0.93,
      岗位: 0.98,
      基本工资: 0.98,
    },
    unmatched: [],
  },
];

@Injectable()
export class MockLlmProvider extends LlmProvider {
  readonly name = 'mock' as const;
  readonly modelId = 'mock-golden-v1';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async mapColumns(
    headers: string[],
    candidates: FieldCandidate[],
    orderType: string,
  ): Promise<MappingSuggestion> {
    const sample = GOLDEN_SAMPLES.find(
      (s) =>
        s.headers.length === headers.length &&
        s.headers.every((h, i) => h === headers[i]),
    );

    const items: MappingSuggestionItem[] = headers.map((h, idx) => {
      const fc = sample?.mapping[h] ?? null;
      const conf = sample?.confidence[h] ?? 0;
      return {
        headerIndex: idx,
        header: h,
        fieldCode: fc,
        confidence: conf,
        reason: fc ? 'mock_match' : 'mock_unmatched',
      };
    });

    const mappedCodes = new Set(
      items.filter((i) => i.fieldCode).map((i) => i.fieldCode as string),
    );
    const missingRequired = candidates
      .filter((c) => c.required && !mappedCodes.has(c.fieldCode))
      .map((c) => c.fieldCode);

    const unmatched =
      sample?.unmatched ??
      headers.filter((h) => !items.find((i) => i.header === h && i.fieldCode));

    return {
      items,
      unmatchedHeaders: unmatched,
      missingRequired,
      modelUsed: `mock:${this.modelId}`,
      promptHash: objectHash({ orderType, headers }),
    };
  }
}
```

---

## 8. FuzzyMatchProvider（fallback）

> **文件**：`backend/src/modules/ai/providers/fuzzy-match.provider.ts`
>
> 没 API key / 所有 provider 冷却时使用。`confidence` 上限 `0.3`，以便前端知道"这是降级建议需要人工确认"。

```ts
import { Injectable, Logger } from '@nestjs/common';
import levenshtein from 'fast-levenshtein';
import objectHash from 'object-hash';
import {
  FieldCandidate,
  LlmProvider,
  MappingSuggestion,
  MappingSuggestionItem,
} from './llm-provider.interface';

const STOP_WORDS = ['的', '之', '是', '否', '(', ')', '（', '）', ' '];

function normalize(s: string): string {
  let r = s.toLowerCase();
  for (const w of STOP_WORDS) r = r.split(w).join('');
  return r.trim();
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

function diceCoefficient(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

function similarity(header: string, field: FieldCandidate): number {
  const h = normalize(header);
  const names = [field.fieldName, ...(field.aliases ?? [])].map(normalize);
  let best = 0;
  for (const n of names) {
    const dice = diceCoefficient(h, n);
    const lev = 1 - levenshtein.get(h, n) / Math.max(h.length, n.length, 1);
    best = Math.max(best, 0.6 * dice + 0.4 * lev);
  }
  return best;
}

@Injectable()
export class FuzzyMatchProvider extends LlmProvider {
  readonly name = 'fuzzy' as const;
  readonly modelId = 'fuzzy-dice-lev-v1';
  private readonly logger = new Logger(FuzzyMatchProvider.name);

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async mapColumns(
    headers: string[],
    candidates: FieldCandidate[],
    orderType: string,
  ): Promise<MappingSuggestion> {
    const items: MappingSuggestionItem[] = [];
    const unmatched: string[] = [];
    const usedFieldCode = new Set<string>();

    const headerScores = headers.map((header, idx) => {
      const scored = candidates
        .map((c) => ({
          field: c,
          score: similarity(header, c),
        }))
        .sort((a, b) => b.score - a.score);
      return { header, idx, scored };
    });

    headerScores
      .sort((a, b) => (b.scored[0]?.score ?? 0) - (a.scored[0]?.score ?? 0))
      .forEach(({ header, idx, scored }) => {
        const best = scored.find((s) => !usedFieldCode.has(s.field.fieldCode));
        if (!best || best.score < 0.5) {
          unmatched.push(header);
          items.push({
            headerIndex: idx,
            header,
            fieldCode: null,
            confidence: 0,
            reason: 'fuzzy_no_match',
          });
          return;
        }
        usedFieldCode.add(best.field.fieldCode);
        const cappedConf = Math.min(best.score, 0.3);
        items.push({
          headerIndex: idx,
          header,
          fieldCode: best.field.fieldCode,
          confidence: cappedConf,
          reason: 'fuzzy_match',
          alt: scored
            .slice(1, 3)
            .map((s) => ({
              fieldCode: s.field.fieldCode,
              confidence: Math.min(s.score, 0.3),
            })),
        });
      });

    items.sort((a, b) => a.headerIndex - b.headerIndex);
    const mappedCodes = new Set(
      items.filter((i) => i.fieldCode).map((i) => i.fieldCode as string),
    );
    const missingRequired = candidates
      .filter((c) => c.required && !mappedCodes.has(c.fieldCode))
      .map((c) => c.fieldCode);

    return {
      items,
      unmatchedHeaders: unmatched,
      missingRequired,
      modelUsed: `fuzzy:${this.modelId}`,
      promptHash: objectHash({ orderType, headers }),
      fallbackReason: 'cache_miss_degraded',
    };
  }
}
```

---

## 9. ProviderFactory 与依赖注入

> **文件**：`backend/src/modules/ai/services/provider.factory.ts`

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from '../providers/llm-provider.interface';
import { OpenAIProvider } from '../providers/openai.provider';
import { QwenProvider } from '../providers/qwen.provider';
import { DeepSeekProvider } from '../providers/deepseek.provider';
import { FuzzyMatchProvider } from '../providers/fuzzy-match.provider';
import { MockLlmProvider } from '../providers/mock.provider';

@Injectable()
export class ProviderFactory {
  private readonly logger = new Logger(ProviderFactory.name);

  constructor(
    private readonly config: ConfigService,
    private readonly fuzzy: FuzzyMatchProvider,
    private readonly mock: MockLlmProvider,
  ) {}

  getOrdered(): LlmProvider[] {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return [this.mock, this.fuzzy];
    }

    const order = (this.config.get<string>('AI_PROVIDER_ORDER') ?? 'openai,qwen,deepseek')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const list: LlmProvider[] = [];
    const timeoutMs = Number(this.config.get('AI_MAPPING_TIMEOUT_MS') ?? 10_000);
    const maxTokens = Number(this.config.get('AI_MAX_TOKENS') ?? 2048);

    for (const name of order) {
      try {
        if (name === 'openai' && this.config.get('OPENAI_API_KEY')) {
          list.push(new OpenAIProvider({
            apiKey: this.config.get<string>('OPENAI_API_KEY')!,
            baseUrl: this.config.get<string>('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1',
            model: this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
            timeoutMs,
            maxTokens,
          }));
        } else if (name === 'qwen' && this.config.get('QWEN_API_KEY')) {
          list.push(new QwenProvider({
            apiKey: this.config.get<string>('QWEN_API_KEY')!,
            baseUrl: this.config.get<string>('QWEN_BASE_URL')
              ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            model: this.config.get<string>('QWEN_MODEL') ?? 'qwen-turbo',
            timeoutMs,
            maxTokens,
          }));
        } else if (name === 'deepseek' && this.config.get('DEEPSEEK_API_KEY')) {
          list.push(new DeepSeekProvider({
            apiKey: this.config.get<string>('DEEPSEEK_API_KEY')!,
            baseUrl: this.config.get<string>('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com/v1',
            model: this.config.get<string>('DEEPSEEK_MODEL') ?? 'deepseek-chat',
            timeoutMs,
            maxTokens,
          }));
        }
      } catch (err) {
        this.logger.warn(`provider ${name} 构造失败：${(err as Error).message}`);
      }
    }

    list.push(this.fuzzy);
    return list;
  }
}
```

---

## 10. AiMappingService（LRU + 失败冷却 + fallback 编排）

> **文件**：`backend/src/modules/ai/services/ai-mapping.service.ts`

```ts
import { Injectable, Logger } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import objectHash from 'object-hash';
import {
  FieldCandidate,
  LlmProvider,
  MappingSuggestion,
} from '../providers/llm-provider.interface';
import { ProviderFactory } from './provider.factory';

interface CoolDownEntry {
  failCount: number;
  coolUntil: number;
}

@Injectable()
export class AiMappingService {
  private readonly logger = new Logger(AiMappingService.name);
  private readonly cache = new LRUCache<string, MappingSuggestion>({
    max: 1000,
    ttl: 60 * 60 * 1000, // 1h
  });
  private readonly cooldown = new Map<string, CoolDownEntry>();
  private readonly COOL_MS = 30_000;
  private readonly FAIL_THRESHOLD = 3;

  constructor(private readonly factory: ProviderFactory) {}

  async suggest(
    orderType: string,
    headers: string[],
    candidates: FieldCandidate[],
  ): Promise<MappingSuggestion> {
    if (headers.length > 100) {
      throw new Error('4400 headers_too_many');
    }

    const cacheKey = objectHash({
      orderType,
      headers: [...headers].sort(),
      fields: candidates.map((c) => c.fieldCode).sort(),
    });
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug(`cache hit key=${cacheKey.slice(0, 8)}`);
      return cached;
    }

    const providers = this.factory.getOrdered();
    let lastErr: unknown;
    for (const p of providers) {
      if (this.isInCooldown(p.name)) continue;
      try {
        const result = await p.mapColumns(headers, candidates, orderType);
        this.cache.set(cacheKey, result);
        this.clearCooldown(p.name);
        return result;
      } catch (err) {
        lastErr = err;
        this.markFailure(p.name);
        this.logger.warn(
          `[provider=${p.name}] failed: ${(err as Error).message}`,
        );
      }
    }

    throw new Error(
      `4500 ai_all_providers_failed: ${(lastErr as Error)?.message}`,
    );
  }

  private isInCooldown(name: string): boolean {
    const entry = this.cooldown.get(name);
    if (!entry) return false;
    if (Date.now() >= entry.coolUntil) {
      this.cooldown.delete(name);
      return false;
    }
    return entry.failCount >= this.FAIL_THRESHOLD;
  }

  private markFailure(name: string) {
    const entry = this.cooldown.get(name) ?? { failCount: 0, coolUntil: 0 };
    entry.failCount += 1;
    if (entry.failCount >= this.FAIL_THRESHOLD) {
      entry.coolUntil = Date.now() + this.COOL_MS;
    }
    this.cooldown.set(name, entry);
  }

  private clearCooldown(name: string) {
    this.cooldown.delete(name);
  }
}
```

---

## 11. `prompts/system.md` 与 Few-shot

> **文件**：`backend/src/modules/ai/prompts/system.md`

```markdown
你是一个字段映射助手，任务是把用户 Excel 表头对齐到系统字段。

硬要求：
1. 仅允许映射到 <候选字段> 列表中给出的 field_code；不得虚构。
2. 输出严格 JSON，不含解释、markdown、注释。
3. 对于无法判断的列，放入 unmatched；不要猜。
4. confidence 是 0~1 浮点，反映匹配把握程度。
5. 同一 field_code 只能被一个原表头映射；其它候选列放 unmatched。

识别要点：
- 中英文混写：以语义为准，如 "Id Card" → 身份证号。
- 括号里的单位必须忽略：如 "基本薪资(元)" 对齐 "基本工资"。
- 分组前缀（"基本信息/"、"合同信息/"）用作语义锚点消歧。
- 全空格 / 换行 / 全角空格视作同一词。
- "是/否"类列优先匹配 boolean 或 dropdown 字段。
```

> **文件**：`backend/src/modules/ai/prompts/few-shot.ts`

```ts
import fs from 'node:fs';
import path from 'node:path';
import type OpenAI from 'openai';

export const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, 'system.md'),
  'utf-8',
);

const SHOT_SIMPLE = {
  user: '<订单类型>: onboarding\n<Excel 表头>（JSON 数组）:\n["客户名称","员工姓名","身份证号","手机号","岗位","基本工资"]',
  assistant: JSON.stringify({
    suggestion: {
      客户名称: 'customer_name',
      员工姓名: 'employee_name',
      身份证号: 'id_card_no',
      手机号: 'mobile',
      岗位: 'position',
      基本工资: 'base_salary',
    },
    confidence: {
      客户名称: 0.99,
      员工姓名: 0.95,
      身份证号: 0.99,
      手机号: 0.93,
      岗位: 0.98,
      基本工资: 0.98,
    },
    unmatched: [],
    missing_required: [],
  }),
};

const SHOT_UNIT = {
  user: '<订单类型>: onboarding\n<Excel 表头>（JSON 数组）:\n["Id Card","基本薪资(元)","试用期(月)","是否需要集约"]',
  assistant: JSON.stringify({
    suggestion: {
      'Id Card': 'id_card_no',
      '基本薪资(元)': 'base_salary',
      '试用期(月)': 'probation_months',
      是否需要集约: 'need_onboarding_contact',
    },
    confidence: {
      'Id Card': 0.95,
      '基本薪资(元)': 0.92,
      '试用期(月)': 0.93,
      是否需要集约: 0.9,
    },
    unmatched: [],
    missing_required: [],
  }),
};

const SHOT_GROUPED = {
  user: '<订单类型>: onboarding\n<Excel 表头>（JSON 数组）:\n["基本信息/姓名","基本信息/性别","合同信息/合同开始日期"]',
  assistant: JSON.stringify({
    suggestion: {
      '基本信息/姓名': 'employee_name',
      '基本信息/性别': 'gender',
      '合同信息/合同开始日期': 'contract_start_date',
    },
    confidence: {
      '基本信息/姓名': 0.97,
      '基本信息/性别': 0.97,
      '合同信息/合同开始日期': 0.96,
    },
    unmatched: [],
    missing_required: [],
  }),
};

export function buildFewShot(
  headers: string[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const shots = [SHOT_SIMPLE, SHOT_UNIT];
  if (headers.some((h) => h.includes('/'))) shots.push(SHOT_GROUPED);

  const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  for (const s of shots) {
    msgs.push({ role: 'user', content: s.user });
    msgs.push({ role: 'assistant', content: s.assistant });
  }
  return msgs;
}
```

---

## 12. 单测骨架（golden snapshot）

> **文件**：`backend/src/modules/ai/services/ai-mapping.service.spec.ts`

```ts
import { Test } from '@nestjs/testing';
import { AiMappingService } from './ai-mapping.service';
import { ProviderFactory } from './provider.factory';
import { MockLlmProvider } from '../providers/mock.provider';
import { FuzzyMatchProvider } from '../providers/fuzzy-match.provider';

describe('AiMappingService', () => {
  let svc: AiMappingService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        AiMappingService,
        ProviderFactory,
        MockLlmProvider,
        FuzzyMatchProvider,
        { provide: 'ConfigService', useValue: { get: () => 'test' } },
      ],
    }).compile();
    svc = mod.get(AiMappingService);
  });

  it('golden sample: 6 列标准对齐', async () => {
    const headers = ['客户名称', '员工姓名', '身份证号', '手机号', '岗位', '基本工资'];
    const candidates = [
      { fieldCode: 'customer_name', fieldName: '客户名称', fieldType: 'text', required: true },
      { fieldCode: 'employee_name', fieldName: '姓名', fieldType: 'text', required: true },
      { fieldCode: 'id_card_no', fieldName: '身份证号', fieldType: 'text', required: true },
      { fieldCode: 'mobile', fieldName: '移动电话', fieldType: 'text', required: false },
      { fieldCode: 'position', fieldName: '岗位', fieldType: 'text', required: true },
      { fieldCode: 'base_salary', fieldName: '基本工资', fieldType: 'number', required: true },
    ] as const;

    const result = await svc.suggest('onboarding', headers, candidates as any);
    expect(result.items.find((i) => i.header === '身份证号')?.fieldCode).toBe('id_card_no');
    expect(result.missingRequired).toEqual([]);
  });

  it('fallback to fuzzy when LLM unavailable', async () => {
    const headers = ['姓', '手机'];
    const candidates = [
      { fieldCode: 'employee_name', fieldName: '姓名', fieldType: 'text', required: true },
      { fieldCode: 'mobile', fieldName: '手机号', fieldType: 'text', required: false },
    ];
    const result = await svc.suggest('onboarding', headers, candidates as any);
    expect(result.modelUsed.startsWith('fuzzy')).toBe(true);
    expect(result.items.every((i) => i.confidence <= 0.3)).toBe(true);
  });
});
```

---

## 13. 交付自检清单（backend）

- [ ] `backend/src/modules/ai/` 下 13 个文件全部创建；
- [ ] `pnpm add openai lru-cache object-hash fast-levenshtein` 成功；
- [ ] `.env.example` 增加 `AI_PROVIDER_ORDER` / 三家 API_KEY / BASE_URL / MODEL；
- [ ] `AppModule.imports` 加入 `AiModule`；
- [ ] `curl -X POST http://localhost:3000/api/ai/field-mapping -d '{"orderType":"onboarding","headers":[...]}'` 返回 `{items,unmatchedHeaders,missingRequired,modelUsed}`；
- [ ] 断掉网络 / 清空 API KEY，同接口仍返回 `modelUsed=fuzzy:...`；
- [ ] Jest 覆盖：OpenAIProvider.parseJson 错误路径、FuzzyMatchProvider 冲突优先级、AiMappingService 冷却与 fallback、Mock 热身 ≥ 10 用例。

---

## 变更日志

- v1.0（2026-05-11）：初版，提供 8 个 TypeScript 源文件 + 2 个 prompt 资源 + 1 份单测骨架，合计 **11 个可直接 `cp` 的单元**。