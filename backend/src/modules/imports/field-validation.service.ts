import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CandidateField, MappingItemInput, RowValidationResult, RowValidationWarning } from './types';
import { AstNode } from 'src/modules/dispatch-engine/dispatch-engine.types';
import { AstEvaluator } from 'src/modules/dispatch-engine/ast-evaluator';
import { FieldConfig, FieldType, OrderType } from 'src/entities';

interface RowValidationError {
  fieldCode: string;
  reason: 'required' | 'regex' | 'enum' | 'conditional' | 'relation' | 'type_convert' | 'field_disabled';
  message: string;
}

interface RawValueLookup {
  found: boolean;
  value?: unknown;
  actualHeader?: string;
}

interface ValueNormalizeResult {
  value: unknown;
  warning?: RowValidationWarning;
}

const SOFT_REQUIRED_SAFE_DEFAULTS: Record<string, string> = {};

const HEADER_ALIASES: Record<string, string[]> = {
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
  contract_term_type: ['合同期限形式', '合同类型', '劳动合同期限形式', '期限形式'],
  contract_term: ['合同期限', '劳动合同期限', '合同年限'],
  contract_start_date: ['合同开始日期', '合同起始日期', '合同开始', '合同起', '劳动合同开始日期', '入职日期', '入职时间'],
  contract_end_date: ['合同终止日期', '合同结束日期', '合同结束', '合同止', '劳动合同结束日期'],
  probation_start_date: ['试用期开始日期', '试用开始日期', '试用期开始'],
  probation_months: ['试用期(月)', '试用期月份', '试用期月数', '试用期'],
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
  contract_template: ['劳动合同模板', '合同模板', '合同版本', '标准模板', '特殊模板'],
  need_contract_urge: ['劳动合同签署是否需要催办员工', '合同签署是否需要催办', '是否需要催签合同', '是否催办合同', '是否需催办劳动合同签署', '是否需要催办劳动合同签署', '劳动合同催办', '劳动合同签署催办'],
  contract_feedback: ['劳动合同签订反馈', '合同签订反馈', '合同反馈'],
  need_onboarding_contact: ['入职材料是否需要集约收集', '是否需要入职联系', '是否收集入职材料', '是否需要收集入职材料', '是否集约收集', '入职材料收集'],
  onboarding_feedback: ['入职联系反馈', '联系反馈', '入职材料反馈'],
  need_company_payroll: ['是否企服发薪', '是否公司发薪', '是否代发薪', '是否发薪'],
  social_urge: ['社保公积金未办是否需要催办', '社保公积金是否催办', '社保是否催办', '公积金是否催办'],
  special_remark: ['特殊备注', '特别备注', '特殊说明'],
  data_entry_feedback: ['数据录入反馈', '录入反馈', '数据反馈'],
};

@Injectable()
export class ImportFieldValidationService {
  constructor(
    @InjectRepository(FieldConfig)
    private readonly fieldConfigRepository: Repository<FieldConfig>,
    private readonly astEvaluator: AstEvaluator,
  ) {}

  async getActiveFields(orderType: OrderType): Promise<FieldConfig[]> {
    return this.fieldConfigRepository
      .createQueryBuilder('field')
      .where('field.is_active = true')
      .andWhere(
        '(field.order_type IS NULL OR field.order_type = :orderType OR field.business_context @> :ctx)',
        { orderType, ctx: JSON.stringify([orderType]) },
      )
      .orderBy('field.display_order', 'ASC')
      .getMany();
  }

  async buildCandidateFields(orderType: OrderType): Promise<CandidateField[]> {
    const fields = await this.getActiveFields(orderType);
    return fields.map((field) => ({
      fieldCode: field.fieldCode,
      fieldName: field.fieldName,
      fieldType: field.fieldType,
      required: field.isRequired || field.defaultRequired,
    }));
  }

  async validateRow(input: {
    rowNo: number;
    raw: Record<string, unknown>;
    mapping: MappingItemInput[];
    defaults?: Record<string, unknown>;
    fields: FieldConfig[];
  }): Promise<RowValidationResult> {
    const mapped = this.mapRow(input.raw, input.mapping, input.fields, input.defaults ?? {});
    const normalized = mapped.normalized;
    const warnings = mapped.warnings;
    const errors: RowValidationError[] = [];

    for (const field of input.fields) {
      const value = normalized[field.fieldCode];
      const required = await this.isRequired(field, normalized);
      if (required && !this.hasValue(value)) {
        const safeDefault = SOFT_REQUIRED_SAFE_DEFAULTS[field.fieldCode];
        if (safeDefault !== undefined) {
          normalized[field.fieldCode] = safeDefault;
          warnings.push({
            fieldCode: field.fieldCode,
            message: `${field.fieldName}未填，已使用默认值「${safeDefault}」`,
            code: 'safe_default',
            normalizedValue: safeDefault,
          });
        } else {
          // 所有必填字段（含条件必填）未维护时，该行导入失败
          errors.push({ fieldCode: field.fieldCode, reason: 'required', message: `${field.fieldName}为必填项，请在导入表格中补充后重新导入` });
        }
        continue;
      }
      if (!this.hasValue(value)) {
        continue;
      }
      if (field.validationRegex) {
        const regex = new RegExp(field.validationRegex);
        if (!regex.test(String(value))) {
          errors.push({ fieldCode: field.fieldCode, reason: 'regex', message: field.validationMsg ?? `${field.fieldName}格式错误` });
        }
      }
    }

    return { ok: errors.length === 0, rowNo: input.rowNo, errors, warnings, normalized, raw: input.raw };
  }

  private mapRow(
    raw: Record<string, unknown>,
    mapping: MappingItemInput[],
    fields: FieldConfig[],
    defaults: Record<string, unknown>,
  ): { normalized: Record<string, unknown>; warnings: RowValidationWarning[] } {
    const fieldMap = new Map(fields.map((field) => [field.fieldCode, field]));
    const result: Record<string, unknown> = { ...defaults };
    const warnings: RowValidationWarning[] = [];

    for (const item of mapping) {
      const field = fieldMap.get(item.fieldCode);
      if (!field) {
        continue;
      }
      const rawLookup = this.lookupRawValue(raw, item.header, field);
      const fallbackValue = item.defaultValue ?? defaults[item.fieldCode];
      const sourceValue = rawLookup.found ? rawLookup.value : fallbackValue;
      const normalizedValue = this.normalizeFieldValue(sourceValue, field);
      result[item.fieldCode] = normalizedValue.value;
      if (normalizedValue.warning) {
        warnings.push(normalizedValue.warning);
      }
      if (rawLookup.found && rawLookup.actualHeader && rawLookup.actualHeader !== item.header) {
        warnings.push({
          fieldCode: field.fieldCode,
          code: 'header_alias',
          message: `表头“${item.header}”已按别名匹配实际列“${rawLookup.actualHeader}”`,
          originalValue: item.header,
          normalizedValue: rawLookup.actualHeader,
        });
      }
    }

    for (const [fieldCode, value] of Object.entries(defaults)) {
      const field = fieldMap.get(fieldCode);
      if (result[fieldCode] === undefined && field) {
        const normalizedValue = this.normalizeFieldValue(value, field);
        result[fieldCode] = normalizedValue.value;
        if (normalizedValue.warning) {
          warnings.push(normalizedValue.warning);
        }
      }
    }

    this.applySafeDefaults(result, fields, warnings);
    return { normalized: result, warnings };
  }

  private lookupRawValue(raw: Record<string, unknown>, expectedHeader: string, field: FieldConfig): RawValueLookup {
    if (Object.prototype.hasOwnProperty.call(raw, expectedHeader)) {
      return { found: true, value: raw[expectedHeader], actualHeader: expectedHeader };
    }

    const expectedKeys = this.headerMatchKeys(expectedHeader, field, true);
    for (const [actualHeader, value] of Object.entries(raw)) {
      const actualKeys = this.headerMatchKeys(actualHeader, field, false);
      if (this.hasIntersection(expectedKeys, actualKeys)) {
        return { found: true, value, actualHeader };
      }
    }

    return { found: false };
  }

  private normalizeFieldValue(value: unknown, field: FieldConfig): ValueNormalizeResult {
    return { value: this.normalizeValue(value, field.fieldType) };
  }

  private normalizeEnumAlias(field: FieldConfig, value: unknown, options: string[]): unknown {
    if (typeof value !== 'string') {
      return value;
    }
    if (options.includes(value)) {
      return value;
    }

    const normalized = this.normalizeEnumText(value);
    const optionByKey = new Map(options.map((option) => [this.normalizeEnumText(option), option]));
    const exact = optionByKey.get(normalized);
    if (exact) {
      return exact;
    }

    if (field.fieldCode === 'household_type') {
      if (['城镇户口', '城镇', '城市户口', '居民户口', '非农户口', '非农业户口', '非农', '非农业'].map((item) => this.normalizeEnumText(item)).includes(normalized)) {
        return options.includes('非农业') ? '非农业' : value;
      }
      if (['农村户口', '农村', '农业户口', '农户', '农业'].map((item) => this.normalizeEnumText(item)).includes(normalized)) {
        return options.includes('农业') ? '农业' : value;
      }
    }

    if (options.includes('是') && options.includes('否')) {
      if (['是', 'yes', 'y', 'true', '1', '需要', '需', '要', '办理', '已办', '催办', '需要催办'].map((item) => this.normalizeEnumText(item)).includes(normalized)) {
        return '是';
      }
      if (['否', 'no', 'n', 'false', '0', '不需要', '无需', '不用', '未办', '不用催办', '不催办', '无'].map((item) => this.normalizeEnumText(item)).includes(normalized)) {
        return '否';
      }
    }

    return value;
  }

  private applySafeDefaults(_result: Record<string, unknown>, _fields: FieldConfig[], _warnings: RowValidationWarning[]): void {
    return;
  }

  private normalizeValue(value: unknown, fieldType: FieldType): unknown {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'string') {
      const text = value.trim();
      if (text.length === 0) return null;
      if (fieldType === FieldType.NUMBER) {
        const num = Number(text.replace(/,/g, ''));
        return Number.isFinite(num) ? num : text;
      }
      return text;
    }
    return value;
  }

  private async isRequired(field: FieldConfig, normalized: Record<string, unknown>): Promise<boolean> {
    if (field.isRequired || field.defaultRequired) return true;
    if (!field.conditionalRequired) return false;
    const evaluated = await this.astEvaluator.evaluate(field.conditionalRequired as unknown as AstNode, normalized);
    return evaluated.result;
  }

  private hasValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  private headerMatchKeys(header: string, field: FieldConfig, includeFieldAliases: boolean): Set<string> {
    const rawCandidates = new Set<string>([header]);
    if (includeFieldAliases) {
      rawCandidates.add(field.fieldName);
      rawCandidates.add(field.fieldCode);
      field.fieldCode.split('_').forEach((part) => rawCandidates.add(part));
      (HEADER_ALIASES[field.fieldCode] ?? []).forEach((alias) => rawCandidates.add(alias));
    }
    const keys = new Set<string>();

    for (const candidate of rawCandidates) {
      for (const item of this.expandHeaderCandidate(candidate)) {
        const normalized = this.normalizeHeaderForMatch(item);
        if (normalized) {
          keys.add(normalized);
        }
      }
    }

    return keys;
  }

  private expandHeaderCandidate(value: string): string[] {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return [];
    }
    const withoutParen = raw.replace(/（/g, '(').replace(/）/g, ')').replace(/\([^)]*\)/g, '');
    const result = new Set<string>([raw, withoutParen]);
    for (const candidate of [raw, withoutParen]) {
      candidate
        .split(/[\/\\|｜:：\n\r]+/g)
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => result.add(item));
    }
    return Array.from(result);
  }

  private normalizeHeaderForMatch(value: string): string {
    return String(value ?? '')
      .toLowerCase()
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/\([^)]*\)/g, '')
      .replace(/[\s\-_()/【】\[\]{}:：，,。.；;、*"'“”‘’]/g, '')
      .replace(/的|之|是否/g, '')
      .trim();
  }

  private normalizeEnumText(value: string): string {
    return String(value ?? '')
      .toLowerCase()
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/[\s\-_()/【】\[\]{}:：，,。.；;、*"'“”‘’]/g, '')
      .trim();
  }

  private hasIntersection(left: Set<string>, right: Set<string>): boolean {
    for (const item of left) {
      if (right.has(item)) {
        return true;
      }
    }
    return false;
  }
}
