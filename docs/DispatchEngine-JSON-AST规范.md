# DispatchEngine · JSON AST 规范

> 版本：v1.0（Phase 2 定稿，Phase 3 实施）
> 作用域：
> 1. **派发规则**（`dispatch_rules.trigger_conditions`）的条件表达
> 2. **字段条件必填**（`field_configs.conditional_required`）的条件表达
> 3. 前端 `<ConditionBuilder />` 组件的数据契约
> 设计原则：**最小表达式集 + 严格 Schema + 可追踪求值**。不引入完整的 JSONLogic / CEL，只允许本规范显式枚举的节点类型。

---

## 1. 设计要点

- **纯数据**：AST 是 JSON，存 JSONB 列，无需任何代码依赖。
- **类型自证**：每个节点必须带 `op`；叶子节点必须带 `field`、`value`（`exists` 除外）。
- **无副作用**：求值器只读上下文 `extraData`，不可 I/O、不可调用外部。
- **可追踪**：求值时每节点返回 `{ result, node, children? }`，供调试工具展示。
- **短路求值**：`AND` 见到 `false` 立即终止；`OR` 见到 `true` 立即终止。
- **空表达恒真**：`null`、`undefined`、`{}` 均视为恒真（用于"无条件派发"与"默认必填"）。

---

## 2. 节点类型

### 2.1 组合节点（逻辑）

| op | 含义 | 必备字段 | 语义 |
|----|------|----------|------|
| `AND` | 逻辑与 | `children: AstNode[]` | 全部 `true` 则真；空数组视为真 |
| `OR`  | 逻辑或 | `children: AstNode[]` | 任一 `true` 则真；空数组视为**假** |
| `NOT` | 逻辑非 | `child: AstNode`      | 对 `child` 结果取反 |

> 约束：`AND` / `OR` 的 `children` 至少 1 项（UI 可暂存空以便编辑，后端保存时拒绝空）。

### 2.2 比较节点（叶子）

| op | 语义 | 允许字段类型 | `value` 类型 |
|----|------|--------------|--------------|
| `EQ`       | 等于（严格相等，数值按数比较，日期归一化到 `yyyy-MM-dd`） | 全部 | 同字段类型 |
| `NEQ`      | 不等于 | 全部 | 同字段类型 |
| `IN`       | 值属于集合 | text / number / dropdown / multi_select | 数组 |
| `NOT_IN`   | 值不属于集合 | 同上 | 数组 |
| `CONTAINS` | 字符串包含（多值字段 → 数组包含子串/元素） | text / textarea / multi_select | string |
| `GT`       | 大于 | number / date | number \| ISODate |
| `LT`       | 小于 | number / date | number \| ISODate |
| `GTE`      | 大于等于 | 同 GT | 同 GT |
| `LTE`      | 小于等于 | 同 LT | 同 LT |
| `EXISTS`   | 字段存在且非空 | 全部 | 无（`value` 必须省略） |
| `REGEX`    | 正则匹配（JS 正则；仅 `i`、`m` 标志；禁用 `g`；字符串化） | text / textarea | `{ pattern: string; flags?: 'i' \| 'm' \| 'im' }` |

> **空值规则**：当 `extraData[field]` 为 `null | undefined | ''` 时：
> - `EXISTS` → `false`
> - `EQ`、`NEQ`、`IN`、`NOT_IN`、`CONTAINS`、`GT/LT/GTE/LTE`、`REGEX` → **返回 `false`**（不抛错）
> - 这样约束可以安全地对可空字段求值。

### 2.3 AST TypeScript 类型（供前后端共享）

```ts
export type AstNode =
  | AndNode
  | OrNode
  | NotNode
  | LeafNode;

export interface AndNode { op: 'AND'; children: AstNode[] }
export interface OrNode  { op: 'OR';  children: AstNode[] }
export interface NotNode { op: 'NOT'; child: AstNode }

export type LeafOp =
  | 'EQ' | 'NEQ' | 'IN' | 'NOT_IN' | 'CONTAINS'
  | 'GT' | 'LT' | 'GTE' | 'LTE'
  | 'EXISTS' | 'REGEX';

export interface LeafNode {
  op: LeafOp;
  field: string;                  // field_code (snake_case)
  value?: AstValue;               // EXISTS 省略；REGEX 用 RegexValue
}

export type AstScalar = string | number | boolean | null;
export type AstValue =
  | AstScalar
  | AstScalar[]
  | { pattern: string; flags?: 'i' | 'm' | 'im' };
```

---

## 3. JSON Schema（完整、可直接喂 ajv）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ticket-system.local/schemas/DispatchAst.json",
  "title": "DispatchAst",
  "oneOf": [
    { "type": "null" },
    { "$ref": "#/$defs/AstNode" }
  ],
  "$defs": {
    "AstNode": {
      "oneOf": [
        { "$ref": "#/$defs/AndNode" },
        { "$ref": "#/$defs/OrNode" },
        { "$ref": "#/$defs/NotNode" },
        { "$ref": "#/$defs/LeafNode" }
      ]
    },
    "AndNode": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "children"],
      "properties": {
        "op": { "const": "AND" },
        "children": {
          "type": "array",
          "minItems": 1,
          "maxItems": 32,
          "items": { "$ref": "#/$defs/AstNode" }
        }
      }
    },
    "OrNode": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "children"],
      "properties": {
        "op": { "const": "OR" },
        "children": {
          "type": "array",
          "minItems": 1,
          "maxItems": 32,
          "items": { "$ref": "#/$defs/AstNode" }
        }
      }
    },
    "NotNode": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "child"],
      "properties": {
        "op": { "const": "NOT" },
        "child": { "$ref": "#/$defs/AstNode" }
      }
    },
    "LeafNode": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "field"],
      "properties": {
        "op": {
          "enum": ["EQ", "NEQ", "IN", "NOT_IN", "CONTAINS",
                   "GT", "LT", "GTE", "LTE", "EXISTS", "REGEX"]
        },
        "field": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_]{1,63}$"
        },
        "value": { "$ref": "#/$defs/AstValue" }
      },
      "allOf": [
        {
          "if": { "properties": { "op": { "const": "EXISTS" } } },
          "then": { "not": { "required": ["value"] } }
        },
        {
          "if": { "properties": { "op": { "enum": ["EQ","NEQ","CONTAINS"] } } },
          "then": {
            "required": ["value"],
            "properties": {
              "value": {
                "oneOf": [
                  { "type": "string" },
                  { "type": "number" },
                  { "type": "boolean" },
                  { "type": "null" }
                ]
              }
            }
          }
        },
        {
          "if": { "properties": { "op": { "enum": ["GT","LT","GTE","LTE"] } } },
          "then": {
            "required": ["value"],
            "properties": {
              "value": {
                "oneOf": [
                  { "type": "number" },
                  { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}(T.*)?$" }
                ]
              }
            }
          }
        },
        {
          "if": { "properties": { "op": { "enum": ["IN","NOT_IN"] } } },
          "then": {
            "required": ["value"],
            "properties": {
              "value": {
                "type": "array",
                "minItems": 1,
                "maxItems": 128,
                "items": {
                  "oneOf": [
                    { "type": "string" },
                    { "type": "number" },
                    { "type": "boolean" }
                  ]
                }
              }
            }
          }
        },
        {
          "if": { "properties": { "op": { "const": "REGEX" } } },
          "then": {
            "required": ["value"],
            "properties": {
              "value": {
                "type": "object",
                "required": ["pattern"],
                "additionalProperties": false,
                "properties": {
                  "pattern": { "type": "string", "minLength": 1, "maxLength": 512 },
                  "flags":   { "enum": ["", "i", "m", "im"] }
                }
              }
            }
          }
        }
      ]
    },
    "AstValue": {
      "oneOf": [
        { "type": "string" },
        { "type": "number" },
        { "type": "boolean" },
        { "type": "null" },
        { "type": "array", "items": { "type": ["string","number","boolean"] } },
        {
          "type": "object",
          "required": ["pattern"],
          "properties": {
            "pattern": { "type": "string" },
            "flags":   { "type": "string" }
          }
        }
      ]
    }
  }
}
```

> 保存时：后端先用 ajv 校验此 Schema；再做**语义校验**（§4），两层都通过才落库。

---

## 4. 语义校验（Schema 之外）

语义校验由 `DispatchRuleValidator.validate(ast, ctx)` 承担：

1. **字段存在性**：`field` 必须在 `field_configs` 中启用。
2. **类型兼容**：`op` 与字段类型匹配表（§2.2 的"允许字段类型"列）。不匹配 → 错误码 `3003`。
3. **枚举值合法**（dropdown / multi_select）：`value`（或 `value[]`）必须在 `dropdown_options.value` 中。
4. **日期/数值**：`GT/LT/GTE/LTE` 的 `value` 可解析为 number 或 ISO 日期。
5. **正则合法性**：`new RegExp(pattern, flags)` 可构造，不含不允许的标志。
6. **嵌套深度**：最多 10 层（防呆）；叶子总数 ≤ 256。
7. **禁用字段**：被软删除（`is_active=false`）的字段不得出现在新规则中（但历史规则保留以免死锁）。

校验失败时返回结构：
```ts
{ code: 3003, message: '...', details: { path: '$.children[0].value', reason: '...' } }
```

---

## 5. 求值语义（精确描述）

### 5.1 上下文
```ts
interface EvalContext {
  extraData: Record<string, unknown>;   // 工单字段值
  fieldTypes?: Record<string, FieldType>; // 可选，提供则参与类型强制
  now?: Date;                           // 可选，用于相对日期；本期未使用
}
```

### 5.2 值归一化
- 字符串两端空白 `trim()`。
- dropdown / multi_select 的 `value` 以**值**（非显示文案）比较。
- 日期：
  - 输入 `'2026-05-11'` 或 ISO 带时区 → 归一化到 `YYYY-MM-DD`（UTC 截断）。
  - `GT/LT/GTE/LTE` 按字符串字典序比较 `YYYY-MM-DD` 等价于日期顺序。
- 数值：字符串数字（`"6000"`）在比较/数值操作下按 `Number()` 强转；失败视为 `null`。
- `boolean`：只接受 `true/false`；字符串 `"true"/"false"/"是"/"否"` **不隐式转换**（必须用 `EQ` 到具体字符串值）。

### 5.3 求值规则（伪代码，见 §6 完整版）

- `AND(children)`：`children` 为空 → `true`；否则短路 AND。
- `OR(children)`：`children` 为空 → `false`；否则短路 OR。
- `NOT(child)`：`!eval(child)`。
- `EXISTS(field)`：`isPresent(extraData[field])`。
- `EQ / NEQ`：`normalized(extraData[field]) === value` / `!==`。空值返回 `false`。
- `IN / NOT_IN`：值集合成员检查。空值返回 `false`。
- `CONTAINS`：字符串 `includes`；数组 `some(el => el.includes(value))`。空值返回 `false`。
- `GT / LT / GTE / LTE`：两侧强制到 number 或 ISODate；任一不可比较返回 `false`。
- `REGEX`：`new RegExp(pattern, flags).test(String(extraData[field]))`；执行时间 > 100ms 强制中断返回 `false`（后端可设保护伞）。

### 5.4 求值跟踪
每次求值返回：
```ts
interface AstEvalTrace {
  op: string;
  result: boolean;
  shortCircuited?: boolean;
  field?: string;
  op_reason?: string;     // 空值命中 / 类型不兼容 等
  children?: AstEvalTrace[]; // AND/OR 的逐子追踪；NOT 只有一条
}
```
调试工具会把这棵树可视化，节点色：绿=true，红=false，灰=短路未求值。

---

## 6. 评估器伪代码

```ts
// src/modules/work-orders/dispatch/condition-evaluator.ts（参考实现）

export interface ConditionEvaluator {
  evaluate(ast: AstNode | null, ctx: EvalContext): { result: boolean; trace: AstEvalTrace };
}

class ConditionEvaluatorImpl implements ConditionEvaluator {
  evaluate(ast, ctx) {
    if (ast == null || Object.keys(ast).length === 0) {
      return { result: true, trace: { op: 'NOOP', result: true } };
    }
    return this.walk(ast, ctx);
  }

  private walk(node: AstNode, ctx: EvalContext): { result: boolean; trace: AstEvalTrace } {
    switch (node.op) {
      case 'AND': return this.evalAnd(node, ctx);
      case 'OR':  return this.evalOr(node, ctx);
      case 'NOT': return this.evalNot(node, ctx);
      default:    return this.evalLeaf(node as LeafNode, ctx);
    }
  }

  private evalAnd(node: AndNode, ctx) {
    if (node.children.length === 0) return { result: true, trace: { op: 'AND', result: true, children: [] } };
    const traces: AstEvalTrace[] = [];
    for (const child of node.children) {
      const r = this.walk(child, ctx);
      traces.push(r.trace);
      if (!r.result) {
        // 填充剩余为 shortCircuited
        for (const rest of node.children.slice(traces.length)) {
          traces.push({ op: rest.op, result: false, shortCircuited: true });
        }
        return { result: false, trace: { op: 'AND', result: false, children: traces, shortCircuited: true } };
      }
    }
    return { result: true, trace: { op: 'AND', result: true, children: traces } };
  }

  private evalOr(node: OrNode, ctx) {
    if (node.children.length === 0) return { result: false, trace: { op: 'OR', result: false, children: [] } };
    const traces: AstEvalTrace[] = [];
    for (const child of node.children) {
      const r = this.walk(child, ctx);
      traces.push(r.trace);
      if (r.result) {
        for (const rest of node.children.slice(traces.length)) {
          traces.push({ op: rest.op, result: false, shortCircuited: true });
        }
        return { result: true, trace: { op: 'OR', result: true, children: traces, shortCircuited: true } };
      }
    }
    return { result: false, trace: { op: 'OR', result: false, children: traces } };
  }

  private evalNot(node: NotNode, ctx) {
    const inner = this.walk(node.child, ctx);
    return { result: !inner.result, trace: { op: 'NOT', result: !inner.result, children: [inner.trace] } };
  }

  private evalLeaf(leaf: LeafNode, ctx: EvalContext) {
    const raw = ctx.extraData[leaf.field];
    const present = raw !== undefined && raw !== null && raw !== '';
    switch (leaf.op) {
      case 'EXISTS':
        return tr(leaf, present);
      case 'EQ':
      case 'NEQ': {
        if (!present) return tr(leaf, false, 'empty');
        const ok = normalize(raw) === normalize(leaf.value);
        return tr(leaf, leaf.op === 'EQ' ? ok : !ok);
      }
      case 'IN':
      case 'NOT_IN': {
        if (!present) return tr(leaf, false, 'empty');
        const arr = (leaf.value as AstScalar[]).map(normalize);
        const v = normalize(raw);
        const ok = arr.includes(v);
        return tr(leaf, leaf.op === 'IN' ? ok : !ok);
      }
      case 'CONTAINS': {
        if (!present) return tr(leaf, false, 'empty');
        const needle = String(leaf.value);
        const ok = Array.isArray(raw)
          ? raw.some(x => String(x).includes(needle))
          : String(raw).includes(needle);
        return tr(leaf, ok);
      }
      case 'GT':
      case 'LT':
      case 'GTE':
      case 'LTE': {
        if (!present) return tr(leaf, false, 'empty');
        const [a, b] = coerceComparable(raw, leaf.value);
        if (a === null || b === null) return tr(leaf, false, 'incomparable');
        const r = leaf.op === 'GT' ? a > b
               : leaf.op === 'LT' ? a < b
               : leaf.op === 'GTE' ? a >= b
               : a <= b;
        return tr(leaf, r);
      }
      case 'REGEX': {
        if (!present) return tr(leaf, false, 'empty');
        const { pattern, flags } = leaf.value as { pattern: string; flags?: string };
        try {
          const re = new RegExp(pattern, flags ?? '');
          return tr(leaf, re.test(String(raw)));
        } catch {
          return tr(leaf, false, 'invalid_regex');
        }
      }
    }
  }
}

function tr(leaf: LeafNode, result: boolean, reason?: string): { result: boolean; trace: AstEvalTrace } {
  return {
    result,
    trace: { op: leaf.op, field: leaf.field, result, op_reason: reason },
  };
}

function normalize(v: unknown) {
  if (typeof v === 'string') return v.trim();
  return v;
}

function coerceComparable(a: unknown, b: unknown): [number|string|null, number|string|null] {
  // 如两侧都像数，转 number；如都像日期，转 'YYYY-MM-DD'；否则 null
  const toNum = (x: unknown) => {
    if (typeof x === 'number') return isFinite(x) ? x : null;
    if (typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x)) return Number(x);
    return null;
  };
  const toDate = (x: unknown) => {
    if (typeof x !== 'string') return null;
    if (!/^\d{4}-\d{2}-\d{2}/.test(x)) return null;
    return x.slice(0, 10);
  };
  const na = toNum(a), nb = toNum(b);
  if (na !== null && nb !== null) return [na, nb];
  const da = toDate(a), db = toDate(b);
  if (da !== null && db !== null) return [da, db];
  return [null, null];
}
```

后端实现必须配单测：10+ 个示例（见 §7）全部通过。

---

## 7. 示例（至少 10 个，由易到难）

### 7.1 入职联系派发（单条件）
```json
{
  "op": "EQ",
  "field": "need_onboarding_contact",
  "value": "是"
}
```

### 7.2 合同派发（AND 组合）
```json
{
  "op": "AND",
  "children": [
    { "op": "EQ", "field": "need_company_contract", "value": "是" },
    { "op": "EQ", "field": "employee_type",        "value": "全日制" }
  ]
}
```

### 7.3 社保派发（OR 组合：全日制或非全日制都参保）
```json
{
  "op": "OR",
  "children": [
    { "op": "EQ", "field": "employee_type", "value": "全日制" },
    { "op": "EQ", "field": "employee_type", "value": "非全日制" }
  ]
}
```

### 7.4 嵌套组合（AND(OR(a,b), c)）
> "全日制或非全日制" **且** "需要企服发薪"
```json
{
  "op": "AND",
  "children": [
    {
      "op": "OR",
      "children": [
        { "op": "EQ", "field": "employee_type", "value": "全日制" },
        { "op": "EQ", "field": "employee_type", "value": "非全日制" }
      ]
    },
    { "op": "EQ", "field": "need_company_payroll", "value": "是" }
  ]
}
```

### 7.5 NOT（排除劳务/实习/退休）
```json
{
  "op": "NOT",
  "child": {
    "op": "IN",
    "field": "employee_type",
    "value": ["劳务", "实习", "退休"]
  }
}
```

### 7.6 数值比较（高薪员工走特别流程）
```json
{
  "op": "GT",
  "field": "base_salary",
  "value": 20000
}
```

### 7.7 IN 集合（特定参保地走特殊社保流程）
```json
{
  "op": "IN",
  "field": "social_location",
  "value": ["宁波", "杭州", "温州"]
}
```

### 7.8 REGEX（身份证归属省份 33 开头 = 浙江籍）
```json
{
  "op": "REGEX",
  "field": "id_card_no",
  "value": { "pattern": "^33\\d{16}[0-9Xx]$" }
}
```

### 7.9 EXISTS（仅当上传了附件标记才派发）
```json
{
  "op": "EXISTS",
  "field": "onboarding_doc_attachment"
}
```

### 7.10 复杂嵌套（AND(OR(EQ,EQ), NOT(IN), GTE)）
> "外包类型是全风险或风险后置"且"不是劳务/实习/退休"且"入职日期 ≥ 2026-01-01"
```json
{
  "op": "AND",
  "children": [
    {
      "op": "OR",
      "children": [
        { "op": "EQ", "field": "outsource_type", "value": "全风险" },
        { "op": "EQ", "field": "outsource_type", "value": "风险后置" }
      ]
    },
    {
      "op": "NOT",
      "child": {
        "op": "IN",
        "field": "employee_type",
        "value": ["劳务", "实习", "退休"]
      }
    },
    { "op": "GTE", "field": "contract_start_date", "value": "2026-01-01" }
  ]
}
```

### 7.11 CONTAINS（备注里含"紧急"字样走加急）
```json
{
  "op": "CONTAINS",
  "field": "special_remark",
  "value": "紧急"
}
```

### 7.12 空条件（恒真 —— 如入职→数据录入总是派）
```json
null
```
或
```json
{}
```
> 两者等价，都视为"恒真"。保存时推荐使用 `null`，减少 JSON 冗余。

---

## 8. 字段条件必填（复用）

`field_configs.conditional_required` 直接使用同一 AST 语义。示例：

- `contract_subject` 仅当 `need_company_contract=是` 时必填：
```json
{ "op": "EQ", "field": "need_company_contract", "value": "是" }
```
- `payroll_location` 仅当 `need_company_payroll=是` 时必填：
```json
{ "op": "EQ", "field": "need_company_payroll", "value": "是" }
```

后端在工单"提交"校验中：
```
required = fc.defaultRequired || evaluate(fc.conditionalRequired, ctx)
```

---

## 9. 在派发引擎中的使用

```ts
// src/modules/work-orders/dispatch/dispatch-engine.ts（参考实现）

class DispatchEngineImpl implements DispatchEngine {
  constructor(
    private readonly cond: ConditionEvaluator,
    private readonly picker: HandlerPicker,
  ) {}

  evaluate(ctx: DispatchContext): DispatchResult {
    const hits: Array<{ rule: DispatchRule; trace: AstEvalTrace }> = [];
    for (const rule of ctx.rules) {
      const { result, trace } = this.cond.evaluate(rule.triggerConditions ?? null, {
        extraData: ctx.workOrder.extraData,
      });
      if (result) hits.push({ rule, trace });
    }

    // 模块去重：同 target_module 保留 priority 最小（即最高优先级）
    const byModule = new Map<string, { rule: DispatchRule; trace: AstEvalTrace }>();
    for (const hit of hits) {
      const existing = byModule.get(hit.rule.targetModule);
      if (!existing || hit.rule.priority < existing.rule.priority) {
        byModule.set(hit.rule.targetModule, hit);
      }
    }

    // 为每模块挑 handler
    const children = [];
    for (const [moduleCode, { rule }] of byModule) {
      const handlerId = this.picker.pick(rule.dispatchStrategy, moduleCode, ctx.moduleHandlers);
      children.push({
        moduleCode,
        handlerId,
        visibleFields: ctx.visibleFieldsByModule[moduleCode] ?? [],
        reason: rule.ruleName,
      });
    }
    return { childrenToCreate: children, hits };  // hits 可用于审计 & 调试
  }
}
```

### 9.1 与"模拟调试"接口的绑定
`POST /api/admin/dispatch-rules/simulate` 的响应里，每条 `hits[].trace` 即上文 `AstEvalTrace`，前端调试工具直接展示；`deduped` 通过对比 `byModule` 的入选情况标记。

---

## 10. 版本化与兼容

- **不引入版本号字段**：AST 结构靠 JSON Schema `$id` + Git 版本控制。
- **Schema 演进**：新增 `op` → 向后兼容（旧规则不受影响）；移除或改语义 → 需要迁移脚本把旧 AST 翻译成新结构，同时旧字段保留一个版本周期。
- **存储**：
  - `dispatch_rules.trigger_conditions` 类型 `jsonb`，`null` 合法。
  - `field_configs.conditional_required` 同。
  - 建议对常用字段（`field`）建 GIN 表达式索引：
    ```sql
    CREATE INDEX idx_dr_cond_fields ON dispatch_rules USING GIN ((trigger_conditions) jsonb_path_ops);
    ```
    便于"影响面排查"类查询（如"哪些规则引用了 need_onboarding_contact"）。

---

## 11. 安全

- **正则 ReDoS**：拒绝明显指数型正则（后端保守策略：`(.+)+`、`(a|a)+` 等模式直接拒绝；执行超过 100ms 强制熔断）。
- **字段白名单**：条件只允许引用 `field_configs.field_code`；不允许引用系统字段（如 `createdAt`）—— 防止越权访问。
- **输入审计**：任何改动 `dispatch_rules` / `field_configs.conditional_required` 必须进 `operation_logs`，记录 `before/after` 的 AST。

---

## 12. 测试清单（后端必做）

- 单元测试覆盖 §7 的 12 个示例，每个示例搭配 2~3 组上下文（命中 / 不命中 / 边界空值）。
- 额外测试：
  - 空 AST (`null`, `{}`)。
  - `AND` / `OR` 空 `children`（保存被拒 + 求值兜底）。
  - 嵌套 11 层（Schema 拒绝）。
  - 正则 ReDoS 保护生效。
  - dropdown 枚举值外的 `value`（保存被拒）。
  - 字段停用后新规则拒绝引用；历史规则求值不崩溃（返回 `false`）。
- e2e：管理后台保存规则 → 提交工单触发派发 → 子工单命中数与预期一致。

---

## 13. 文档同步纪律
- 本文件由架构师维护；任何新增 `op` / 调整语义必须在此处先更新，并广播 `[架构变更]`。
- 前端 `<ConditionBuilder />` 的实现只能基于本文件的类型和 Schema；不得自行扩展。
- 后端 `ConditionEvaluator` 的单测必须覆盖本文件 §7 的所有示例；增加示例需同步更新测试。
