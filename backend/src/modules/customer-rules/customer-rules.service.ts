import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { isEmail, isUUID } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { toPageResult } from 'src/common/types/pagination.types';
import { Branch, BusinessScope, Customer, CustomerPaymentLocationRule, CustomerPortalRule, OrderType, WorkOrder, WorkOrderStatus } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

const ONBOARDING_DEFAULT_FIELDS = new Set([
  'fund_ratio', 'outsource_type', 'business_mode', 'employee_type', 'need_company_contract',
  'need_esign', 'esign_platform', 'contract_subject', 'company_address', 'project_name',
  'work_arrangement', 'contract_template', 'need_contract_urge', 'need_onboarding_contact',
  'feedback_deadline', 'is_common_template', 'supplementary_materials', 'need_company_payroll',
  'payroll_location', 'social_urge', 'special_remark',
  'payroll_cycle', 'payroll_date', 'need_payroll_slip', 'purchased_products', 'service_fee', 'deposit',
]);
const RESIGNATION_DEFAULT_FIELDS = new Set([
  'need_resignation_cert', 'cert_delivery_address', 'cert_delivery_method', 'certificate_template',
]);
const COMPLETION_BUSINESS_TYPES = ['onboarding', 'resignation', 'salary'] as const;
const SALARY_REMINDER_OFFSETS = [3, 2, 1] as const;

const BOOLEAN_ONBOARDING_FIELDS = new Set(['need_company_contract', 'need_esign', 'need_contract_urge', 'need_onboarding_contact', 'need_company_payroll']);
// Customer-level choices only: no employee addresses, remarks, dates or amounts.
const HISTORICAL_ONBOARDING_FIELDS = new Set([
  'outsource_type', 'business_mode', 'need_company_contract', 'need_esign', 'esign_platform',
  'contract_subject', 'company_address', 'contract_template', 'need_contract_urge',
  'need_onboarding_contact', 'is_common_template', 'need_company_payroll', 'payroll_location',
]);
const HISTORICAL_RESIGNATION_FIELDS = new Set(['need_resignation_cert', 'cert_delivery_method', 'certificate_template']);
const TRUSTED_ORDER_STATUSES = [WorkOrderStatus.PENDING, WorkOrderStatus.PROCESSING, WorkOrderStatus.COMPLETED];
const RULE_INPUT_FIELDS = new Set([
  'onboardingDefaults', 'resignationDefaults', 'paymentLocationRules', 'salaryRules', 'sharedEmailRules',
  'completionEmailEnabled', 'completionEmailTo', 'completionEmailCc', 'completionEmailReplyTo',
  'completionEmailBusinessTypes', 'completionEmailFields', 'objectionDeadlineDays', 'isActive',
]);

type PrimitiveRuleValue = string | number | boolean;
type SalaryRules = CustomerPortalRule['salaryRules'];
type SharedEmailRules = CustomerPortalRule['sharedEmailRules'];

export interface CustomerPortalRuleReadiness {
  ready: boolean;
  missing: string[];
}

export interface SaveCustomerPortalRuleInput {
  onboardingDefaults?: Record<string, unknown>;
  resignationDefaults?: Record<string, unknown>;
  paymentLocationRules?: Array<{
    socialLocation: string;
    branchId: string;
    onboardingDefaults: Record<string, unknown>;
    resignationDefaults: Record<string, unknown>;
  }>;
  salaryRules?: Record<string, unknown>;
  sharedEmailRules?: Record<string, unknown>;
  completionEmailEnabled?: boolean;
  completionEmailTo?: string[];
  completionEmailCc?: string[];
  completionEmailReplyTo?: string | null;
  completionEmailBusinessTypes?: string[];
  completionEmailFields?: string[];
  objectionDeadlineDays?: number | null;
  isActive?: boolean;
}

export interface BatchSaveCustomerPortalRuleInput {
  customerId: string;
  rule: SaveCustomerPortalRuleInput;
  rowNumber?: number;
}

@Injectable()
export class CustomerRulesService {
  constructor(
    @InjectRepository(CustomerPortalRule)
    private readonly ruleRepository: Repository<CustomerPortalRule>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}

  async list(query: PaginationQueryDto, user: JwtUserPayload) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.customerRepository.createQueryBuilder('customer');
    qb.where('customer.isActive = true');
    qb.andWhere('customer.businessScope = :businessScope', { businessScope: user.businessScope ?? BusinessScope.BEILUN });
    if (query.keyword) {
      qb.andWhere('(customer.customerCode ILIKE :keyword OR customer.customerName ILIKE :keyword)', { keyword: `%${query.keyword}%` });
    }
    qb.orderBy('customer.customerName', 'ASC').addOrderBy('customer.id', 'ASC');
    const [customers, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const rules = customers.length
      ? await this.ruleRepository.createQueryBuilder('rule').where('rule.customerId IN (:...customerIds)', { customerIds: customers.map((customer) => customer.id) }).getMany()
      : [];
    const ruleMap = new Map(rules.map((rule) => [rule.customerId, rule]));
    return toPageResult(page, pageSize, total, customers.map((customer) => this.toView(customer, ruleMap.get(customer.id) ?? null)));
  }

  async get(customerId: string, user: JwtUserPayload) {
    const customer = await this.getAccessibleCustomer(customerId, user);
    const rule = await this.ruleRepository.findOne({ where: { customerId } });
    return this.toView(customer, rule);
  }

  async getPortalDefaults(customerId: string, user: JwtUserPayload) {
    const customer = await this.getAccessibleCustomer(customerId, user);
    const rule = await this.ruleRepository.findOne({ where: { customerId, isActive: true } });
    return {
      customerId: customer.id,
      customerCode: customer.customerCode,
      configured: Boolean(rule),
      onboardingDefaults: rule?.onboardingDefaults ?? {},
      resignationDefaults: rule?.resignationDefaults ?? {},
      paymentLocationRules: rule?.paymentLocationRules ?? [],
      salaryRules: this.viewSalaryRules(rule?.salaryRules),
      sharedEmailRules: this.viewSharedEmailRules(rule?.sharedEmailRules),
      readiness: this.getReadiness(rule),
    };
  }

  async getLocationOptions(customerId: string, user: JwtUserPayload) {
    const customer = await this.getAccessibleCustomer(customerId, user);
    const branches = await this.branchRepository.find({
      where: { customerId: customer.id, businessScope: customer.businessScope, isActive: true },
      order: { branchCode: 'ASC', id: 'ASC' },
    });
    return branches.map(({ id, branchCode, branchName, city }) => ({ id, branchCode, branchName, city }));
  }

  async upsert(customerId: string, input: SaveCustomerPortalRuleInput, user: JwtUserPayload) {
    this.validateInput(input);
    const customer = await this.getAccessibleCustomer(customerId, user);
    let rule = await this.ruleRepository.findOne({ where: { customerId } });
    if (!rule) {
      rule = this.ruleRepository.create({
        customerId,
        onboardingDefaults: {},
        resignationDefaults: {},
        paymentLocationRules: [],
        salaryRules: this.viewSalaryRules(),
        sharedEmailRules: this.viewSharedEmailRules(),
        completionEmailEnabled: false,
        completionEmailTo: [],
        completionEmailCc: [],
        completionEmailReplyTo: null,
        completionEmailBusinessTypes: [...COMPLETION_BUSINESS_TYPES],
        completionEmailFields: ['order_no', 'order_type', 'customer_name', 'employee_name', 'employee_id_card'],
        objectionDeadlineDays: null,
        isActive: true,
      });
    }
    if (input.onboardingDefaults !== undefined) {
      rule.onboardingDefaults = this.normalizePrimitiveDefaults({ ...rule.onboardingDefaults, ...input.onboardingDefaults }, ONBOARDING_DEFAULT_FIELDS, '入职');
    }
    if (input.resignationDefaults !== undefined) rule.resignationDefaults = this.normalizeResignationDefaults({ ...rule.resignationDefaults, ...input.resignationDefaults });
    if (input.paymentLocationRules !== undefined) rule.paymentLocationRules = await this.normalizePaymentLocationRules(input.paymentLocationRules, customer, rule.onboardingDefaults, rule.resignationDefaults);
    if (input.onboardingDefaults !== undefined) {
      if (rule.paymentLocationRules?.length) {
        for (const location of rule.paymentLocationRules) this.validateEmployeeType({ ...rule.onboardingDefaults, ...location.onboardingDefaults }, `${location.socialLocation}入职`);
      } else this.validateEmployeeType(rule.onboardingDefaults, '入职');
    }
    if (input.salaryRules !== undefined) rule.salaryRules = this.normalizeSalaryRules({ ...this.viewSalaryRules(rule.salaryRules), ...input.salaryRules });
    if (input.sharedEmailRules !== undefined) rule.sharedEmailRules = this.normalizeSharedEmailRules({ ...this.viewSharedEmailRules(rule.sharedEmailRules), ...input.sharedEmailRules });
    if (input.completionEmailEnabled !== undefined) rule.completionEmailEnabled = input.completionEmailEnabled;
    if (input.completionEmailTo !== undefined) rule.completionEmailTo = this.normalizeEmails(input.completionEmailTo);
    if (input.completionEmailCc !== undefined) rule.completionEmailCc = this.normalizeEmails(input.completionEmailCc);
    if (input.completionEmailReplyTo !== undefined) rule.completionEmailReplyTo = input.completionEmailReplyTo?.trim().toLowerCase() || null;
    if (input.completionEmailFields !== undefined) rule.completionEmailFields = this.normalizeCompletionEmailFields(input.completionEmailFields);
    if (input.completionEmailBusinessTypes !== undefined) {
      const businessTypes = [...new Set(input.completionEmailBusinessTypes)];
      if (businessTypes.length !== COMPLETION_BUSINESS_TYPES.length || COMPLETION_BUSINESS_TYPES.some((value) => !businessTypes.includes(value))) {
        throw new BadRequestException('入职、离职、薪资三类业务必须全部发送办结结果邮件');
      }
    }
    rule.completionEmailBusinessTypes = [...COMPLETION_BUSINESS_TYPES];
    if (input.objectionDeadlineDays !== undefined) rule.objectionDeadlineDays = input.objectionDeadlineDays;
    if (input.isActive !== undefined) rule.isActive = input.isActive;
    if (rule.completionEmailEnabled && rule.completionEmailTo.length === 0) {
      throw new BadRequestException('启用办结结果邮件时，至少需要配置一个收件人');
    }
    rule.updatedBy = user.sub;
    const saved = await this.ruleRepository.save(rule);
    return this.toView(customer, saved);
  }

  async batchUpsert(rows: BatchSaveCustomerPortalRuleInput[], user: JwtUserPayload) {
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('批量导入至少需要一条客户规则');
    if (rows.length > 500) throw new BadRequestException('每批最多导入 500 条客户规则');
    const customerIdCounts = new Map<string, number>();
    for (const row of rows) {
      const id = typeof row?.customerId === 'string' ? row.customerId.trim().toLowerCase() : '';
      if (id) customerIdCounts.set(id, (customerIdCounts.get(id) || 0) + 1);
    }

    const results: Array<{ customerId: string; rowNumber: number; success: boolean; message: string; customerCode?: string; customerName?: string }> = [];
    for (const [index, row] of rows.entries()) {
      const customerId = typeof row?.customerId === 'string' ? row.customerId.trim().toLowerCase() : '';
      const rowNumber = Number.isInteger(row?.rowNumber) && row.rowNumber! > 0 ? row.rowNumber! : index + 2;
      try {
        if (!this.isRecord(row)) throw new BadRequestException('客户规则行格式错误');
        if (Object.keys(row).some((key) => !['customerId', 'rule', 'rowNumber'].includes(key))) throw new BadRequestException('客户规则行包含未知字段');
        if (!isUUID(customerId)) throw new BadRequestException('客户 UUID 为空或格式错误，请使用模板中的客户 UUID');
        if ((customerIdCounts.get(customerId) || 0) > 1) throw new BadRequestException('同一客户 UUID 重复，重复行均未导入');
        if (!this.isRecord(row.rule) || Object.keys(row.rule).length === 0) throw new BadRequestException('未填写任何办理规则');
        const saved = await this.upsert(customerId, row.rule, user);
        results.push({ customerId, rowNumber, customerCode: saved.customerCode, customerName: saved.customerName, success: true, message: '导入成功' });
      } catch (error) {
        results.push({ customerId, rowNumber, success: false, message: error instanceof Error ? error.message : '导入失败' });
      }
    }
    const successCount = results.filter((item) => item.success).length;
    return { total: rows.length, successCount, failedCount: rows.length - successCount, results };
  }

  async importFromExistingOrders(customerIds: string[] | undefined, user: JwtUserPayload) {
    if (customerIds !== undefined && (!Array.isArray(customerIds) || customerIds.length > 500 || customerIds.some((id) => typeof id !== 'string' || !isUUID(id)))) {
      throw new BadRequestException('历史带入必须使用有效客户 UUID，每批最多 500 个客户');
    }
    const customerQb = this.customerRepository.createQueryBuilder('customer').where('customer.isActive = true');
    customerQb.andWhere('customer.businessScope = :businessScope', { businessScope: user.businessScope ?? BusinessScope.BEILUN });
    if (customerIds?.length) customerQb.andWhere('customer.id IN (:...customerIds)', { customerIds });
    const customers = await customerQb.getMany();
    if (customers.length === 0) return { customerCount: 0, importedCount: 0, skippedCount: 0, failedCount: 0, sourceOrderCount: 0, results: [] };

    const ids = customers.map((customer) => customer.id);
    const orders = await this.workOrderRepository.find({
      where: {
        customerId: In(ids),
        orderType: In([OrderType.ONBOARDING, OrderType.RESIGNATION]),
        businessScope: BusinessScope.BEILUN,
        status: In(TRUSTED_ORDER_STATUSES),
        submittedAt: Not(IsNull()),
      },
      order: { updatedAt: 'DESC', id: 'DESC' },
    });
    const existingRules = await this.ruleRepository.find({ where: { customerId: In(ids) } });
    const ruleMap = new Map(existingRules.map((rule) => [rule.customerId, rule]));
    const derivedMap = this.deriveRulesFromOrders(orders);
    let importedCount = 0;
    const results: Array<{ customerId: string; customerCode: string; customerName: string; status: 'imported' | 'skipped' | 'failed'; message: string }> = [];

    for (const customer of customers) {
      const identity = { customerId: customer.id, customerCode: customer.customerCode, customerName: customer.customerName };
      try {
        const derived = derivedMap.get(customer.id);
        if (!derived || (Object.keys(derived.onboardingDefaults).length === 0 && Object.keys(derived.resignationDefaults).length === 0)) {
          results.push({ ...identity, status: 'skipped', message: '没有可带入的可信入职、离职规则' });
          continue;
        }
        let rule = ruleMap.get(customer.id);
        if (!rule) {
          rule = this.ruleRepository.create({
            customerId: customer.id,
            onboardingDefaults: {},
            resignationDefaults: {},
            paymentLocationRules: [],
            salaryRules: this.viewSalaryRules(),
            sharedEmailRules: this.viewSharedEmailRules(),
            completionEmailEnabled: false,
            completionEmailTo: [],
            completionEmailCc: [],
            completionEmailReplyTo: null,
            completionEmailBusinessTypes: [...COMPLETION_BUSINESS_TYPES],
            completionEmailFields: ['order_no', 'order_type', 'customer_name', 'employee_name', 'employee_id_card'],
            objectionDeadlineDays: null,
            isActive: true,
          });
        }
        const onboardingDefaults = { ...derived.onboardingDefaults, ...(rule.onboardingDefaults || {}) };
        const resignationDefaults = { ...derived.resignationDefaults, ...(rule.resignationDefaults || {}) };
        if (resignationDefaults.need_resignation_cert === '是' && !String(resignationDefaults.cert_delivery_address || '').trim()
          && rule.resignationDefaults?.need_resignation_cert === undefined) {
          delete resignationDefaults.need_resignation_cert;
        }
        if (Object.entries(onboardingDefaults).every(([key, value]) => rule.onboardingDefaults?.[key] === value)
          && Object.entries(resignationDefaults).every(([key, value]) => rule.resignationDefaults?.[key] === value)) {
          results.push({ ...identity, status: 'skipped', message: '已有配置优先，没有可补充的规则' });
          continue;
        }
        rule.onboardingDefaults = onboardingDefaults;
        rule.resignationDefaults = resignationDefaults;
        rule.updatedBy = user.sub;
        await this.ruleRepository.save(rule);
        importedCount += 1;
        results.push({ ...identity, status: 'imported', message: '已带入缺失规则，已有人工配置保持不变' });
      } catch (error) {
        results.push({ ...identity, status: 'failed', message: error instanceof Error ? error.message : '带入失败' });
      }
    }

    return {
      customerCount: customers.length,
      importedCount,
      skippedCount: results.filter((item) => item.status === 'skipped').length,
      failedCount: results.filter((item) => item.status === 'failed').length,
      sourceOrderCount: orders.filter((order) => this.isTrustedOrder(order)).length,
      results,
    };
  }

  private async getAccessibleCustomer(customerId: string, user: JwtUserPayload): Promise<Customer> {
    if (typeof customerId !== 'string' || !isUUID(customerId)) throw new BadRequestException('客户 UUID 格式错误');
    const qb = this.customerRepository.createQueryBuilder('customer').where('customer.id = :customerId', { customerId });
    qb.andWhere('customer.businessScope = :businessScope', { businessScope: user.businessScope ?? BusinessScope.BEILUN });
    const customer = await qb.getOne();
    if (customer) return customer;
    throw new NotFoundException('客户不存在');
  }

  private deriveRulesFromOrders(orders: WorkOrder[]) {
    const result = new Map<string, { onboardingDefaults: Record<string, PrimitiveRuleValue>; resignationDefaults: Record<string, PrimitiveRuleValue> }>();
    for (const order of orders) {
      if (!this.isTrustedOrder(order)) continue;
      const current = result.get(order.customerId) || { onboardingDefaults: {}, resignationDefaults: {} };
      const target = order.orderType === OrderType.ONBOARDING ? current.onboardingDefaults : current.resignationDefaults;
      const fields = order.orderType === OrderType.ONBOARDING ? HISTORICAL_ONBOARDING_FIELDS : HISTORICAL_RESIGNATION_FIELDS;
      for (const fieldCode of fields) {
        if (target[fieldCode] !== undefined) continue;
        const rawValue = order.extraData?.[fieldCode];
        const value = this.normalizeHistoricalValue(fieldCode, rawValue);
        if (value !== undefined) target[fieldCode] = value;
      }
      result.set(order.customerId, current);
    }
    return result;
  }

  private isTrustedOrder(order: WorkOrder): boolean {
    return order.businessScope === BusinessScope.BEILUN
      && TRUSTED_ORDER_STATUSES.includes(order.status)
      && order.submittedAt instanceof Date && Number.isFinite(order.submittedAt.getTime())
      && [OrderType.ONBOARDING, OrderType.RESIGNATION].includes(order.orderType);
  }

  private normalizeHistoricalValue(fieldCode: string, rawValue: unknown): PrimitiveRuleValue | undefined {
    if (rawValue === undefined || rawValue === null || rawValue === '') return undefined;
    if (BOOLEAN_ONBOARDING_FIELDS.has(fieldCode)) {
      if (rawValue === true || ['是', '1.是', '1', 'true'].includes(String(rawValue).trim().toLowerCase())) return true;
      if (rawValue === false || ['否', '2.否', '0', 'false'].includes(String(rawValue).trim().toLowerCase())) return false;
      return undefined;
    }
    if (typeof rawValue !== 'string') return undefined;
    const value = rawValue.trim();
    if (!value || value.length > 1000) return undefined;
    if (['need_resignation_cert', 'is_common_template'].includes(fieldCode) && !['是', '否'].includes(value)) return undefined;
    if (fieldCode === 'cert_delivery_method' && !['电子版', '纸质版', '电子版和纸质版'].includes(value)) return undefined;
    return value;
  }

  private isRecord(input: unknown): input is Record<string, unknown> {
    return input !== null && typeof input === 'object' && !Array.isArray(input);
  }

  private validateInput(input: SaveCustomerPortalRuleInput): void {
    if (!this.isRecord(input)) throw new BadRequestException('办理规则必须为对象');
    const unknown = Object.keys(input).find((key) => !RULE_INPUT_FIELDS.has(key));
    if (unknown) throw new BadRequestException(`办理规则包含未知字段：${unknown}`);
    for (const field of ['onboardingDefaults', 'resignationDefaults', 'salaryRules', 'sharedEmailRules'] as const) {
      if (input[field] !== undefined && !this.isRecord(input[field])) throw new BadRequestException(`${field} 必须为对象`);
    }
    if (input.paymentLocationRules !== undefined && (!Array.isArray(input.paymentLocationRules) || input.paymentLocationRules.length > 500)) {
      throw new BadRequestException('缴纳地办理规则必须为数组，最多 500 项');
    }
    for (const field of ['completionEmailEnabled', 'isActive'] as const) {
      if (input[field] !== undefined && typeof input[field] !== 'boolean') throw new BadRequestException(`${field} 必须为是或否`);
    }
    for (const field of ['completionEmailTo', 'completionEmailCc', 'completionEmailBusinessTypes', 'completionEmailFields'] as const) {
      const value = input[field];
      if (value !== undefined && (!Array.isArray(value) || value.length > 100 || value.some((item) => typeof item !== 'string'))) {
        throw new BadRequestException(`${field} 必须为文本数组，最多 100 项`);
      }
    }
    if (input.completionEmailReplyTo !== undefined && input.completionEmailReplyTo !== null
      && (typeof input.completionEmailReplyTo !== 'string' || !isEmail(input.completionEmailReplyTo.trim()))) {
      throw new BadRequestException('办结邮件回复地址格式错误');
    }
    if (input.objectionDeadlineDays !== undefined && input.objectionDeadlineDays !== null
      && (typeof input.objectionDeadlineDays !== 'number' || !Number.isInteger(input.objectionDeadlineDays) || input.objectionDeadlineDays < 0 || input.objectionDeadlineDays > 30)) {
      throw new BadRequestException('异议期限必须为 0 至 30 天的整数');
    }
  }


  private normalizePrimitiveDefaults(input: Record<string, unknown>, whitelist: Set<string>, label: string): Record<string, PrimitiveRuleValue> {
    const result: Record<string, PrimitiveRuleValue> = {};
    for (const [fieldCode, rawValue] of Object.entries(input)) {
      if (!whitelist.has(fieldCode)) throw new BadRequestException(`${label}规则不允许配置字段：${fieldCode}`);
      if (rawValue === undefined || rawValue === null || rawValue === '') continue;
      if (!['string', 'number', 'boolean'].includes(typeof rawValue)) throw new BadRequestException(`${label}规则字段格式错误：${fieldCode}`);
      const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
      if (typeof value === 'string' && value.length > 1000) throw new BadRequestException(`${label}规则字段内容过长：${fieldCode}`);
      if (value === '') continue;
      if (whitelist === ONBOARDING_DEFAULT_FIELDS && BOOLEAN_ONBOARDING_FIELDS.has(fieldCode) && typeof value !== 'boolean') {
        throw new BadRequestException(`入职规则字段必须为是或否：${fieldCode}`);
      }
      if (fieldCode === 'is_common_template' && !['是', '否'].includes(String(value))) throw new BadRequestException('通用模板只能选择“是”或“否”');
      if (fieldCode === 'payroll_cycle' && !['当月', '次月'].includes(String(value))) throw new BadRequestException('发薪周期只能选择“当月”或“次月”');
      if (fieldCode === 'payroll_date' && (typeof value !== 'string' || !/^(?:[1-9]|[12]\d|3[01])$/.test(value))) throw new BadRequestException('发薪日必须为 1 至 31 的日期文本');
      if (fieldCode === 'need_payroll_slip' && !['是', '否'].includes(String(value))) throw new BadRequestException('是否需要工资单只能选择“是”或“否”');
      if (fieldCode === 'fund_ratio') {
        const components = String(value).split('+').map((part) => Number(part.trim().replace(/%$/, '')));
        if (typeof value === 'boolean' || !/^\d+(?:\.\d+)?%?(?:\+\d+(?:\.\d+)?%)?$/.test(String(value))
          || components.some((part) => !Number.isFinite(part) || part < 0 || part > 100)) throw new BadRequestException('公积金比例格式错误');
      } else if (!BOOLEAN_ONBOARDING_FIELDS.has(fieldCode) && typeof value !== 'string') {
        throw new BadRequestException(`${label}规则字段必须为文本：${fieldCode}`);
      }
      result[fieldCode] = value as PrimitiveRuleValue;
    }
    return result;
  }

  private normalizeResignationDefaults(input: Record<string, unknown>) {
    const result = this.normalizePrimitiveDefaults(input, RESIGNATION_DEFAULT_FIELDS, '离职');
    const needCertificate = result.need_resignation_cert;
    if (needCertificate !== undefined && needCertificate !== '是' && needCertificate !== '否') {
      throw new BadRequestException('是否需要开具离职证明只能选择“是”或“否”');
    }
    if (result.cert_delivery_method !== undefined && !['电子版', '纸质版', '电子版和纸质版'].includes(String(result.cert_delivery_method))) {
      throw new BadRequestException('离职证明形式只能选择电子版、纸质版或电子版和纸质版');
    }
    if (needCertificate === '是' && !String(result.cert_delivery_address || '').trim()) {
      throw new BadRequestException('需要开具离职证明时必须配置送达地址');
    }
    return result;
  }

  private validateEmployeeType(defaults: Record<string, PrimitiveRuleValue>, label: string) {
    if (Object.keys(defaults).length && !String(defaults.employee_type ?? '').trim()) {
      throw new BadRequestException(`${label}规则必须配置员工类型`);
    }
  }

  private async normalizePaymentLocationRules(
    input: SaveCustomerPortalRuleInput['paymentLocationRules'],
    customer: Customer,
    onboardingDefaults: Record<string, PrimitiveRuleValue>,
    resignationDefaults: Record<string, PrimitiveRuleValue>,
  ): Promise<CustomerPaymentLocationRule[]> {
    const locations = new Set<string>();
    const result: CustomerPaymentLocationRule[] = [];
    for (const [index, raw] of (input ?? []).entries()) {
      const label = `第 ${index + 1} 条缴纳地规则`;
      if (!this.isRecord(raw) || Object.keys(raw).some((key) => !['socialLocation', 'branchId', 'onboardingDefaults', 'resignationDefaults'].includes(key))) {
        throw new BadRequestException(`${label}格式错误或包含未知字段`);
      }
      if (typeof raw.socialLocation !== 'string' || !raw.socialLocation.trim() || raw.socialLocation.trim().length > 128) {
        throw new BadRequestException(`${label}必须填写 128 字以内的缴纳地`);
      }
      const socialLocation = raw.socialLocation.trim();
      if (locations.has(socialLocation)) throw new BadRequestException(`同一客户缴纳地重复：${socialLocation}`);
      locations.add(socialLocation);
      if (typeof raw.branchId !== 'string' || !isUUID(raw.branchId.trim())) throw new BadRequestException(`${label}必须选择有效的商社 UUID`);
      const branchId = raw.branchId.trim().toLowerCase();
      const branch = await this.branchRepository.findOne({ where: { id: branchId, customerId: customer.id, businessScope: customer.businessScope, isActive: true } });
      if (!branch) throw new BadRequestException(`${label}所选商社不存在、已停用或不属于当前客户及业务范围`);
      if (!this.isRecord(raw.onboardingDefaults) || !this.isRecord(raw.resignationDefaults)) throw new BadRequestException(`${label}的入职、离职默认项必须为对象`);
      const localOnboarding = this.normalizePrimitiveDefaults(raw.onboardingDefaults, ONBOARDING_DEFAULT_FIELDS, `${socialLocation}入职`);
      const localResignation = this.normalizePrimitiveDefaults(raw.resignationDefaults, RESIGNATION_DEFAULT_FIELDS, `${socialLocation}离职`);
      this.validateEmployeeType({ ...onboardingDefaults, ...localOnboarding }, `${socialLocation}入职`);
      this.normalizeResignationDefaults({ ...resignationDefaults, ...localResignation });
      result.push({ socialLocation, branchId, onboardingDefaults: localOnboarding, resignationDefaults: localResignation });
    }
    return result;
  }

  private normalizeSalaryRules(input: Record<string, unknown>): SalaryRules {
    const allowed = new Set(['billingDay', 'reminderEnabled', 'reminderWorkdayOffsets', 'payrollMonthMode']);
    const unknown = Object.keys(input).find((key) => !allowed.has(key));
    if (unknown) throw new BadRequestException(`薪资规则不允许配置字段：${unknown}`);
    const rawBillingDay = input.billingDay;
    const billingDay = rawBillingDay === undefined || rawBillingDay === null || rawBillingDay === '' ? null : Number(rawBillingDay);
    if (rawBillingDay !== undefined && rawBillingDay !== null && typeof rawBillingDay !== 'number' && typeof rawBillingDay !== 'string') throw new BadRequestException('薪资账单日格式错误');
    if (billingDay !== null && (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 28)) {
      throw new BadRequestException('薪资账单日必须是 1 至 28 日');
    }
    const reminderEnabled = input.reminderEnabled === undefined ? true : input.reminderEnabled;
    if (typeof reminderEnabled !== 'boolean') throw new BadRequestException('薪资提醒启用状态格式错误');
    if (input.reminderWorkdayOffsets !== undefined) {
      const offsets = input.reminderWorkdayOffsets;
      if (!Array.isArray(offsets) || offsets.length !== 3 || offsets.some((value, index) => value !== SALARY_REMINDER_OFFSETS[index])) {
        throw new BadRequestException('薪资提醒节奏固定为账单日前 3 / 2 / 1 个工作日');
      }
    }
    const payrollMonthMode = input.payrollMonthMode === undefined ? 'current' : input.payrollMonthMode;
    if (payrollMonthMode !== 'current' && payrollMonthMode !== 'previous') throw new BadRequestException('薪资所属月份规则只能选择当月或上月');
    return { billingDay, reminderEnabled, reminderWorkdayOffsets: [...SALARY_REMINDER_OFFSETS], payrollMonthMode };
  }

  private normalizeSharedEmailRules(input: Record<string, unknown>): SharedEmailRules {
    const allowed = new Set(['mailbox', 'routeKey']);
    const unknown = Object.keys(input).find((key) => !allowed.has(key));
    if (unknown) throw new BadRequestException(`共享邮箱规则不允许配置字段：${unknown}`);
    for (const field of ['mailbox', 'routeKey']) {
      if (input[field] !== undefined && input[field] !== null && typeof input[field] !== 'string') throw new BadRequestException('共享邮箱规则字段必须为文本');
    }
    const mailbox = String(input.mailbox || '').trim().toLowerCase();
    const routeKey = String(input.routeKey || '').trim();
    if (mailbox && (!isEmail(mailbox) || mailbox.length > 320)) throw new BadRequestException('共享邮箱地址格式错误');
    if (routeKey.length > 100) throw new BadRequestException('共享邮箱路由标识不能超过 100 个字符');
    return { mailbox, routeKey };
  }

  private normalizeCompletionEmailFields(input: string[]): string[] {
    const fields = [...new Set((input || []).map((field) => String(field || '').trim()).filter(Boolean))];
    if (fields.length === 0) throw new BadRequestException('办结邮件结果字段不能为空');
    if (fields.some((field) => field.length > 128 || !/^[a-zA-Z0-9_.-]+$/.test(field))) {
      throw new BadRequestException('办结邮件结果字段仅支持字母、数字及 _ . - 组合');
    }
    return fields;
  }

  private normalizeEmails(input: string[]): string[] {
    const emails = [...new Set(input.map((email) => email.trim().toLowerCase()).filter(Boolean))];
    if (emails.some((email) => !isEmail(email) || email.length > 320)) throw new BadRequestException('办结邮件收件人或抄送地址格式错误');
    return emails;
  }

  private viewSalaryRules(input?: Partial<SalaryRules> | null): SalaryRules {
    return {
      billingDay: Number.isInteger(input?.billingDay) ? input!.billingDay! : null,
      reminderEnabled: input?.reminderEnabled !== false,
      reminderWorkdayOffsets: [...SALARY_REMINDER_OFFSETS],
      payrollMonthMode: input?.payrollMonthMode === 'previous' ? 'previous' : 'current',
    };
  }

  private viewSharedEmailRules(input?: Partial<SharedEmailRules> | null): SharedEmailRules {
    return { mailbox: String(input?.mailbox || ''), routeKey: String(input?.routeKey || '') };
  }

  private toView(customer: Customer, rule: CustomerPortalRule | null) {
    return {
      customerId: customer.id,
      customerCode: customer.customerCode,
      customerName: customer.customerName,
      configured: Boolean(rule),
      onboardingDefaults: rule?.onboardingDefaults ?? {},
      resignationDefaults: rule?.resignationDefaults ?? {},
      paymentLocationRules: rule?.paymentLocationRules ?? [],
      salaryRules: this.viewSalaryRules(rule?.salaryRules),
      sharedEmailRules: this.viewSharedEmailRules(rule?.sharedEmailRules),
      completionEmailEnabled: rule?.completionEmailEnabled ?? false,
      completionEmailTo: rule?.completionEmailTo ?? [],
      completionEmailCc: rule?.completionEmailCc ?? [],
      completionEmailReplyTo: rule?.completionEmailReplyTo ?? null,
      completionEmailBusinessTypes: [...COMPLETION_BUSINESS_TYPES],
      completionEmailFields: rule?.completionEmailFields ?? ['order_no', 'order_type', 'customer_name', 'employee_name', 'employee_id_card'],
      objectionDeadlineDays: rule?.objectionDeadlineDays ?? null,
      isActive: rule?.isActive ?? true,
      updatedBy: rule?.updatedBy ?? null,
      updatedAt: rule?.updatedAt ?? null,
      readiness: this.getReadiness(rule),
    };
  }

  private getReadiness(rule: CustomerPortalRule | null): CustomerPortalRuleReadiness {
    const missing: string[] = [];
    if (!rule) {
      missing.push('整套客户办理规则');
      return { ready: false, missing };
    }
    if (!rule.isActive) missing.push('启用整套客户规则');
    const locations = rule.paymentLocationRules?.length ? rule.paymentLocationRules : [{ socialLocation: '', onboardingDefaults: {}, resignationDefaults: {} }];
    for (const location of locations) {
      const prefix = location.socialLocation ? `${location.socialLocation}·` : '';
      const onboarding = { ...rule.onboardingDefaults, ...location.onboardingDefaults };
      const resignation = { ...rule.resignationDefaults, ...location.resignationDefaults };
      if (!Object.keys(onboarding).length) missing.push(`${prefix}入职规则`);
      else if (!String(onboarding.employee_type ?? '').trim()) missing.push(`${prefix}入职规则·员工类型`);
      if (!Object.keys(resignation).length) missing.push(`${prefix}离职规则`);
    }
    const billingDay = rule.salaryRules?.billingDay;
    if (billingDay == null || !Number.isInteger(billingDay) || billingDay < 1 || billingDay > 28) missing.push('薪资账单日');
    if (!String(rule.sharedEmailRules?.mailbox || '').trim()) missing.push('共享邮箱地址');
    return { ready: missing.length === 0, missing };
  }
}
