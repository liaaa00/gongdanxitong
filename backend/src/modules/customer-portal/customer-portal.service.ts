import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In, MoreThanOrEqual, Repository } from 'typeorm';
import { Workbook } from 'exceljs';
import { isUUID } from 'class-validator';
import { BusinessScope, Customer, CustomerAssignee, CustomerPortalRule, FieldConfig, FieldType, OrderType, WorkOrder, WorkOrderCompletionEmail, WorkOrderStatus } from 'src/entities';
import { CustomerPortalSubmission } from 'src/entities/customer-portal-submission.entity';
import { CustomerPortalAccountsService, PortalBusinessType, businessTypesForPermissions } from '../customer-portal-accounts/customer-portal-accounts.service';
import { JwtUserPayload } from '../auth/auth.types';
import { hasManagementScopeRole, isAdminRole } from 'src/common/auth/role-permissions';
import { WorkOrderService } from '../work-orders/work-order.service';
import { ImportTemplateService } from '../imports/import-template.service';
import { ImportTemplateConfigService, ImportTemplateFieldView } from '../imports/import-template-config.service';
import { ImportFieldValidationService } from '../imports/field-validation.service';
import { ExcelParserService } from '../imports/excel-parser.service';
import { UploadService } from '../upload/upload.service';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from 'src/config/configuration';
import { ContractSubjectsService, getAllowedFundRatios } from '../contract-subjects/contract-subjects.service';
import { PortalRuleApplicationService } from '../customer-rules/portal-rule-application.service';
import { getDispatchModuleLabel, isDispatchModuleVisibleForOrderType, isExportOnlyDispatchModule } from 'src/common/constants/dispatch-modules';
import { PortalNotificationSettingsService } from '../portal-notifications/portal-notification-settings.service';

const EDITABLE = {
  onboarding: ['employee_name','id_card_type','id_card_no','mobile','email','household_type','ethnicity','education','marital_status','household_address','current_address','position','position_type','work_city','contract_term_type','contract_term','contract_start_date','contract_end_date','probation_start_date','probation_months','probation_end_date','probation_salary','probation_other_salary','work_hour_system','salary_form','base_salary','other_salary','social_location','start_month','social_base','fund_base','fund_ratio','remark','bank_name','bank_account'],
  resignation: ['employee_name','id_card_no','mobile','email','resignation_date','social_location','social_stop_month','resignation_reason'],
};
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
type Business = PortalBusinessType;
type Session = Awaited<ReturnType<CustomerPortalAccountsService['session']>>;
export interface PortalFile { name: string; mimeType: string; bizPurpose?: string; contentBase64: string }
export interface PortalInput { linkToken: string; businessType?: Business; requestId?: string; submissionId?: string; fields?: Record<string, unknown>; fileName?: string; contentBase64?: string; files?: PortalFile[] }
type NormalizedSalary = { month: string; mode: 'same' | 'changed'; note: string; channel: 'text' | 'attachment' | null };

@Injectable()
export class CustomerPortalService {
  private readonly logger = new Logger(CustomerPortalService.name);
  constructor(
    private readonly auth: CustomerPortalAccountsService,
    private readonly dataSource: DataSource,
    @InjectRepository(CustomerPortalSubmission) private readonly submissions: Repository<CustomerPortalSubmission>,
    @InjectRepository(CustomerPortalRule) private readonly rules: Repository<CustomerPortalRule>,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(FieldConfig) private readonly fields: Repository<FieldConfig>,
    @InjectRepository(WorkOrder) private readonly orders: Repository<WorkOrder>,
    @InjectRepository(WorkOrderCompletionEmail) private readonly mails: Repository<WorkOrderCompletionEmail>,
    private readonly workOrders: WorkOrderService,
    private readonly templates: ImportTemplateService,
    private readonly templateConfig: ImportTemplateConfigService,
    private readonly validation: ImportFieldValidationService,
    private readonly parser: ExcelParserService,
    private readonly uploads: UploadService,
    private readonly contractSubjects: ContractSubjectsService,
    private readonly ruleApplication: PortalRuleApplicationService,
    @Optional() private readonly configService?: ConfigService<AppConfig, true>,
    @Optional() private readonly notificationSettings?: PortalNotificationSettingsService,
  ) {}

  private async session(input: PortalInput, requireBusiness = true): Promise<Session> {
    if (requireBusiness && !['onboarding','resignation','salary'].includes(input.businessType ?? '')) throw new BadRequestException('请选择业务类型');
    const session = await this.auth.session(input.linkToken, requireBusiness ? input.businessType : undefined);
    if (session.mustChangePassword) throw new ForbiddenException('请先修改初始密码');
    return session;
  }

  async schema(input: PortalInput) {
    const session = await this.session(input);
    const rule = await this.rules.findOne({ where: { customerId: session.customer.id, isActive: true } });
    if (input.businessType === 'salary') return { fields: [], reminderWorkdayOffsets: [3,2,1], defaultMonth: this.defaultSalaryMonth(rule) };
    const fields = await this.editableFields(input.businessType as 'onboarding'|'resignation');
    const names = [...new Set([...(await this.contractSubjects.listFundLocations()), ...(rule?.paymentLocationRules ?? []).map((item) => item.socialLocation)])];
    const locations = await Promise.all(names.map(async (name) => ({ name, fundRatios: getAllowedFundRatios(await this.contractSubjects.findFundRuleByLocation(name)) })));
    return { fields: fields.map((field) => ({ code: field.fieldCode, name: field.fieldName, required: field.isRequired, options: field.dropdownOptions ?? [], type: field.fieldType })), locations };
  }

  private defaultSalaryMonth(rule: CustomerPortalRule | null): string {
    const current = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 7);
    if (rule?.salaryRules?.payrollMonthMode !== 'previous') return current;
    const [year, month] = current.split('-').map(Number);
    return `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, '0')}`;
  }

  async template(input: PortalInput) {
    const session = await this.session(input);
    if (input.businessType === 'salary') throw new BadRequestException('薪资使用变化说明或附件，无员工明细模板');
    const business = input.businessType as 'onboarding'|'resignation';
    const fields = await this.editableFields(business);
    const configured = (await this.templateConfig.list(business as OrderType)) ?? [];
    const views = fields.map((field): ImportTemplateFieldView => ({
      ...(configured.find((item) => item.fieldCode === field.fieldCode) ?? {}),
      ...field, orderType: business as OrderType, order_type: business as OrderType,
      headerAlias: null, isRequiredOverride: field.isRequired,
    } as ImportTemplateFieldView));
    const generated = await this.templates.generateForFields(business as OrderType, views);
    // Metadata binds the standard workbook to its customer and current field schema.
    const book = new Workbook();
    await book.xlsx.load(generated.buffer as never);
    if (business === 'onboarding') {
      const sheet = book.worksheets[0];
      for (const range of [...sheet.model.merges]) if (/^\w+1:\w+1$/.test(range)) sheet.unMergeCells(range);
      sheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => { cell.value = null; });
      sheet.mergeCells(1, 1, 1, fields.length + 2);
      sheet.getCell(1, 1).value = '客户填写资料；试用期选填。特殊城市要求请填备注。银行卡信息如不由外服联系员工收集，则需在本次填写。';
      sheet.getCell(2, fields.length + 2).value = '附件';
      sheet.getCell(3, fields.length + 2).value = '选填';
      sheet.getCell(4, fields.length + 2).value = '本批次附件请在门户页面单独上传，统一送至共享邮箱。';
      const locationColumn = fields.findIndex((field) => field.fieldCode === 'social_location') + 2;
      if (locationColumn >= 2) for (let row = 6; row <= 505; row++) {
        const cell = sheet.getCell(row, locationColumn);
        if (cell.dataValidation) cell.dataValidation = { ...cell.dataValidation, showErrorMessage: false };
      }
    } else {
      book.worksheets[0].getCell(3, fields.length + 2).value = '本批次附件请在门户页面单独上传，统一送至共享邮箱。';
      book.worksheets[0].getCell(4, fields.length + 2).value = '';
    }
    const metadata = book.addWorksheet('__portal'); metadata.state = 'veryHidden';
    metadata.addRows([['customerId', session.customer.id], ['businessType', business], ['schema', this.schemaHash(fields)]]);
    return { fileName: business === 'onboarding' ? '客户入职标准模板.xlsx' : '客户离职标准模板.xlsx', mimeType: MIME, contentBase64: Buffer.from(await book.xlsx.writeBuffer()).toString('base64') };
  }

  private async editableFields(business: 'onboarding'|'resignation'): Promise<FieldConfig[]> {
    const all = await this.fields.find({ where: { isActive: true, fieldCode: In(EDITABLE[business]) } });
    const configured = await this.templateConfig.list(business as OrderType);
    return EDITABLE[business].filter((code) => business !== 'onboarding' || !['contract_term', 'probation_months'].includes(code)).map((code) => all.find((field) => field.fieldCode === code)).filter((field): field is FieldConfig => Boolean(field)).map((field) => {
      const override = configured.find((item) => item.fieldCode === field.fieldCode);
      const result = Object.assign(new FieldConfig(), field, {
        // The customer submits intake; internal-only requirements remain for internal review.
        isRequired: business === 'resignation' ? ['employee_name','id_card_no','mobile','resignation_date','social_stop_month','resignation_reason'].includes(field.fieldCode) : (override?.isRequired ?? field.isRequired),
        defaultRequired: business === 'resignation' ? ['employee_name','id_card_no','mobile','resignation_date','social_stop_month','resignation_reason'].includes(field.fieldCode) : (override?.defaultRequired ?? field.defaultRequired),
        conditionalRequired: override?.conditionalRequired ?? field.conditionalRequired,
        importTemplateConfigured: true,
      });
      if (['bank_name', 'bank_account', 'fund_ratio', 'remark'].includes(field.fieldCode) || field.fieldCode.startsWith('probation_')) {
        result.isRequired = false; result.defaultRequired = false; result.conditionalRequired = null;
      }
      if (['social_location', 'fund_ratio', 'social_stop_month'].includes(field.fieldCode)) {
        result.fieldType = FieldType.TEXT; result.dropdownOptions = null;
        result.validationRegex = null; result.validationMsg = null;
      }
      if (field.fieldCode === 'social_stop_month') {
        result.fieldName = '社保公积金停保月（几月不产生费用填几月）';
        result.validationRegex = '^\\d{4}-(0[1-9]|1[0-2])$';
        result.validationMsg = '停保月请填写完整年月，例如 2027-01（该月起不产生费用）';
        result.helpText = result.validationMsg; result.placeholder = '2027-01';
      }
      if (['bank_name', 'bank_account'].includes(field.fieldCode)) result.helpText = '如不由外服联系员工收集该信息，则需在本次收集页面填写。';
      if (field.fieldCode === 'remark') result.helpText = '特殊城市的社保公积金要求请在此备注，由内部人员确认。';
      return result;
    });
  }

  private schemaHash(fields: FieldConfig[]) { return this.hash(fields.map((field) => [field.fieldCode,field.fieldName,field.isRequired,field.dropdownOptions])); }
  private hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

  private normalizeSalary(fields: Record<string, unknown>, defaultMonth: string): NormalizedSalary {
    if (Object.keys(fields).some((key) => !['mode','note','channel','month'].includes(key))) throw new BadRequestException('薪资不接受员工明细或金额字段');
    const month = String(fields.month ?? defaultMonth);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('薪资所属月份格式错误');
    if (!['same','changed'].includes(String(fields.mode))) throw new BadRequestException('请选择有变化或与上月无变化');
    const note = String(fields.note ?? '').trim();
    if (note.length > 2000) throw new BadRequestException('变化说明最多2000字');
    if (fields.mode === 'changed' && !['text','attachment'].includes(String(fields.channel))) throw new BadRequestException('请选择变化说明或附件');
    if (fields.mode === 'changed' && fields.channel === 'text' && !note) throw new BadRequestException('请填写变化说明');
    return { month, mode: fields.mode as NormalizedSalary['mode'], note: fields.mode === 'same' ? '' : note, channel: fields.mode === 'same' ? null : fields.channel as 'text' | 'attachment' };
  }

  private async validateFields(business: 'onboarding'|'resignation', raw: Record<string, unknown>, rowNo = 1) {
    const fields = await this.editableFields(business);
    if (Object.keys(raw).some((code) => !fields.some((field) => field.fieldCode === code))) throw new BadRequestException('包含客户不可填写或已停用的字段');
    const result = await this.validation.validateRow({ rowNo, raw, mapping: fields.map((field) => ({header:field.fieldCode,fieldCode:field.fieldCode})), orderType: business as OrderType, fields, context: 'portal_intake' });
    if (!result.ok) throw new BadRequestException(result.errors.map((error) => error.message).join('；'));
    if (business === 'onboarding') {
      const location = String(result.normalized.social_location ?? '').trim();
      const fundRule = location ? await this.contractSubjects.findFundRuleByLocation(location) : null;
      const ratio = String(result.normalized.fund_ratio ?? '').trim();
      const options = getAllowedFundRatios(fundRule);
      if (fundRule && options.length && !ratio) throw new BadRequestException('请选择缴纳地允许的公积金比例');
      if (ratio && (!fundRule || !options.includes(ratio))) throw new BadRequestException('公积金比例不属于该缴纳地允许的比例；未配置缴纳地请留空并备注');
      if (String(result.normalized.remark ?? '').length > 1000) throw new BadRequestException('社保公积金备注最多1000字');
    }
    return result.normalized;
  }

  async submit(input: PortalInput, user?: JwtUserPayload) {
    const session = await this.session(input);
    const business = input.businessType!;
    const rule = await this.rules.findOne({ where: { customerId: session.customer.id, isActive: true } });
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(input.requestId ?? '')) throw new BadRequestException('请求编号无效');
    const normalized: Record<string, unknown> = business === 'salary'
      ? this.normalizeSalary(input.fields ?? {}, this.defaultSalaryMonth(rule))
      : await this.validateFields(business, input.fields ?? {});
    if (business === 'salary' && normalized.channel === 'attachment' && !input.files?.length) throw new BadRequestException('请上传薪资文件');
    if (business === 'salary' && normalized.channel !== 'attachment' && input.files?.length) throw new BadRequestException('当前薪资填写方式不接受附件');
    const fingerprint = this.hash({ business, fields: normalized, files: input.files ?? [] });
    const key = this.hash([session.customer.id, session.account.id, input.requestId]);
    return this.withUploadCompensation(key, async (manager, createdFileIds) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
      const repo = manager.getRepository(CustomerPortalSubmission);
      const existing = await repo.findOne({ where: { customerId: session.customer.id, accountId: session.account.id, requestId: input.requestId! } });
      if (existing) {
        if (existing.inputHash !== fingerprint) throw new ConflictException('同一请求编号不能提交不同资料');
        return this.receipt(existing);
      }
      let orderId: string | null = null;
      let requestNo: string;
      if (business === 'salary') {
        // Local salary intake is persisted below in this transaction. A receipt
        // is returned only after commit; no external payroll adapter is needed.
        requestNo = `SAL-${(normalized as NormalizedSalary).month.replace('-', '')}-${randomUUID()}`;
      } else {
        requestNo = '';
      }
      if (business !== 'salary') {
        const resolved = await this.ruleApplication.resolve(rule, session.customer.id, business, normalized.social_location);
        const intake = { ...normalized };
        if (business === 'resignation') intake.social_stop_month = `${Number(String(normalized.social_stop_month).slice(5))}月`;
        // Recover a draft if a prior connection failed after the existing work-order service committed it.
        const recovered = await this.orders.createQueryBuilder('w').where('w.customer_id = :customerId', { customerId: session.customer.id }).andWhere("w.extra_data ->> 'portal_intake_key' = :key", { key }).andWhere("w.extra_data ->> 'portal_input_hash' = :fingerprint", { fingerprint }).andWhere("w.order_type = :orderType", { orderType: business }).getOne();
        const draft = recovered ?? await this.workOrders.createDraft({ orderType: business as OrderType, customerId: session.customer.id, extraData: {
          ...resolved.defaults, ...intake,
          ...(resolved.branch ? { branchId: resolved.branch.id, branch_code: resolved.branch.branchCode } : {}),
          portal_configuration_pending: resolved.missing.length > 0, portal_configuration_missing: resolved.missing,
          customer_name: session.customer.customerName, customer_code: session.customer.customerCode, portal_intake_key: key, portal_input_hash: fingerprint, portal_business_type: business,
        } }, await this.getPortalActor(), resolved.branch?.id ?? null);
        orderId = draft.id; requestNo = draft.orderNo;
      }
      const row = await repo.save(repo.create({ customerId: session.customer.id, accountId: session.account.id, businessType: business, requestId: input.requestId!, inputHash: fingerprint, requestNo, workOrderId: orderId, fields: normalized, status: 'received', resultNote: null, completedAt: null }));
      if (input.files?.length) await this.enqueueAttachments(row, input.files, rule, manager.getRepository(WorkOrderCompletionEmail), createdFileIds);
      return this.receipt(row);
    });
  }

  /** Re-submit a portal draft that internal staff returned for correction. The
   * original request/order number is retained so the correction stays in the
   * same business trail; only the customer supplied fields and intake hash are
   * replaced after the same validation and transaction lock as first submit. */
  async resubmit(input: PortalInput) {
    const session = await this.session(input);
    const business = input.businessType;
    if (business !== 'onboarding' && business !== 'resignation') throw new BadRequestException('退回补正只支持增员或减员');
    if (!input.submissionId || !isUUID(input.submissionId)) throw new BadRequestException('退回受理记录无效');
    const rule = await this.rules.findOne({ where: { customerId: session.customer.id, isActive: true } });
    const normalized: Record<string, unknown> = await this.validateFields(business, input.fields ?? {});
    const fingerprint = this.hash({ business, fields: normalized, files: input.files ?? [] });
    const submission = await this.submissions.findOne({ where: { id: input.submissionId, customerId: session.customer.id, accountId: session.account.id, businessType: business } });
    if (!submission?.workOrderId) throw new NotFoundException('退回受理记录不存在');
    return this.withUploadCompensation(`portal-resubmit:${submission.id}`, async (manager, createdFileIds) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`portal-resubmit:${submission.id}`]);
      const repo = manager.getRepository(CustomerPortalSubmission);
      const row = await repo.findOne({ where: { id: submission.id, customerId: session.customer.id, accountId: session.account.id }, lock: { mode: 'pessimistic_write' } });
      const order = await manager.getRepository(WorkOrder).findOne({ where: { id: submission.workOrderId!, customerId: session.customer.id, businessScope: BusinessScope.BEILUN }, lock: { mode: 'pessimistic_write' } });
      if (!row || !order || order.orderType !== business || order.submittedAt || order.status !== WorkOrderStatus.DRAFT || order.extraData?.portal_review_status !== 'needs_correction') {
        throw new ConflictException('该受理记录当前不能重新提交');
      }
      const correctionFields = new Set(
        (Array.isArray(order.extraData?.portal_correction_fields) ? order.extraData.portal_correction_fields : [])
          .map((field) => String(field).trim())
          .filter(Boolean),
      );
      if (!correctionFields.size) throw new BadRequestException('退回记录未指定可补正字段');
      const originalFields = (row.fields ?? {}) as Record<string, unknown>;
      const changedKeys = new Set([...Object.keys(originalFields), ...Object.keys(normalized)]);
      const invalidCorrectionField = [...correctionFields].some((field) => !changedKeys.has(field));
      if (invalidCorrectionField) throw new BadRequestException('退回补正字段无效，请联系审核人员重新退回');
      const comparable = (value: unknown) => this.hash([value === undefined, value]);
      for (const field of changedKeys) {
        if (correctionFields.has(field)) continue;
        if (comparable(originalFields[field]) !== comparable(normalized[field])) {
          throw new ConflictException(`只能修改退回补正字段：${field}`);
        }
      }
      const resolved = await this.ruleApplication.resolve(rule, session.customer.id, business, normalized.social_location);
      const intake = { ...normalized };
      if (business === 'resignation') intake.social_stop_month = `${Number(String(normalized.social_stop_month).slice(5))}月`;
      row.inputHash = fingerprint; row.fields = normalized; row.status = 'received'; row.resultNote = null; row.completedAt = null;
      order.extraData = { ...order.extraData, ...resolved.defaults, ...intake,
        ...(resolved.branch ? { branchId: resolved.branch.id, branch_code: resolved.branch.branchCode } : {}),
        portal_configuration_pending: resolved.missing.length > 0, portal_configuration_missing: resolved.missing,
        portal_input_hash: fingerprint, portal_review_status: 'pending_review', portal_correction_reason: null,
        portal_correction_fields: [], portal_reviewed_by: null };
      await manager.getRepository(WorkOrder).save(order);
      await repo.save(row);
      if (input.files?.length) await this.enqueueAttachments(row, input.files, rule, manager.getRepository(WorkOrderCompletionEmail), createdFileIds);
      return this.receipt(row);
    });
  }

  /** Portal customers do not carry an internal JWT. Use a controlled, existing
   * administrator identity so work-order foreign keys and audit records remain valid. */
  private async getPortalActor(): Promise<JwtUserPayload> {
    const rows = await this.dataSource.query(
      `SELECT u.id, u.username, u.real_name, u.business_scope
         FROM users u
         INNER JOIN user_roles ur ON ur.user_id = u.id AND ur.is_primary = true
         INNER JOIN roles r ON r.id = ur.role_id AND r.code = 'admin' AND r.is_active = true
        WHERE u.is_active = true
          AND u.business_scope = $1
        ORDER BY u.created_at ASC
        LIMIT 1`,
      [BusinessScope.BEILUN],
    );
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row?.id) throw new ServiceUnavailableException('门户受理缺少系统操作账号，请联系管理员配置');
    return { sub: String(row.id), username: String(row.username ?? 'portal-system'), realName: String(row.real_name ?? '门户系统'), roles: ['admin'], businessScope: row.business_scope };
  }

  private receipt(row: CustomerPortalSubmission) { return { ok: true, submissionId: row.id, workOrderId: row.workOrderId, workOrderNo: row.requestNo, requestNo: row.requestNo, status: row.status, message: '资料已受理，请在办理进度查看结果。' }; }

  async importRows(input: PortalInput, user: JwtUserPayload | undefined, confirm: boolean) {
    const session = await this.session(input);
    if (input.businessType === 'salary') throw new BadRequestException('薪资不使用员工明细导入');
    if (!input.fileName?.endsWith('.xlsx') || !input.contentBase64) throw new BadRequestException('请上传系统下载的 .xlsx 标准模板');
    const buffer = Buffer.from(input.contentBase64, 'base64');
    if (buffer.length > 10*1024*1024 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new BadRequestException('文件不是有效的标准 Excel 或超过10MB');
    const business = input.businessType!;
    const fields = await this.editableFields(business);
    const book = new Workbook();
    try { await book.xlsx.load(buffer as never); } catch { throw new BadRequestException('无法读取 Excel 文件'); }
    const meta = book.getWorksheet('__portal');
    if (!meta || meta.getCell('B1').text !== session.customer.id || meta.getCell('B2').text !== business || meta.getCell('B3').text !== this.schemaHash(fields)) throw new BadRequestException('模板客户、业务类型或字段版本不一致，请重新下载模板');
    const sheet = book.worksheets[0];
    const headerRow = business === 'onboarding' ? 2 : 1;
    const expectedHeaders = ['字段名', ...fields.map((field) => field.fieldName), '附件'];
    const actualHeaders = Array.from({ length: Math.max(expectedHeaders.length, sheet.getRow(headerRow).cellCount) }, (_, index) => String(sheet.getCell(headerRow, index + 1).text ?? '').trim());
    if (actualHeaders.some((header, index) => index < expectedHeaders.length ? header !== expectedHeaders[index] : Boolean(header))) throw new BadRequestException('模板表头被修改，请重新下载标准模板');
    const parsed = await this.parser.parseBuffer(buffer, { headerRows: 1, headerStartRow: headerRow });
    const headers = fields.map((field) => field.fieldName);
    if (!parsed.rows.length || parsed.rows.length > 500) throw new BadRequestException('每次请导入1至500条资料');
    const details: Array<{rowNumber:number;success:boolean;message:string;workOrderNo?:string}> = [];
    const digest = this.hash(input.contentBase64);
    for (let index=0; index<parsed.rows.length; index++) {
      const rowNumber = parsed.meta.rowNumbers[index] + 1;
      const raw = Object.fromEntries(fields.map((field) => [field.fieldCode, parsed.rows[index][field.fieldName] ?? '']));
      try {
        await this.validateFields(business, raw, rowNumber);
        const result = confirm ? await this.submit({ ...input, fields: raw, requestId: `excel-${digest.slice(0,48)}-${rowNumber}` }, user) : undefined;
        details.push({ rowNumber, success:true, message: confirm ? '已受理' : '校验通过', ...(result ? {workOrderNo:result.workOrderNo} : {}) });
      } catch (error) { details.push({rowNumber,success:false,message:error instanceof Error ? error.message : '导入失败'}); }
    }
    return { ok:true, templateValid:true, successCount:details.filter((row)=>row.success).length, failureCount:details.filter((row)=>!row.success).length, details };
  }

  async progress(input: PortalInput) {
    const session = await this.session(input, false);
    const allowed = businessTypesForPermissions(session.businessPermissions);
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const rows = await this.submissions.find({ where: {customerId:session.customer.id,businessType:In(allowed),createdAt:MoreThanOrEqual(twelveMonthsAgo)},order:{createdAt:'DESC'},take:200 });
    const orders = rows.some((row)=>row.workOrderId) ? await this.orders.find({where:{id:In(rows.map((row)=>row.workOrderId).filter(Boolean)),customerId:session.customer.id},relations:{dispatchedOrders:true}}) : [];
    const mails = rows.length ? await this.mails.find({where:[{portalSubmissionId:In(rows.map((row)=>row.id))},...(orders.length?[{workOrderId:In(orders.map((row)=>row.id)),customerId:session.customer.id}]:[])],order:{createdAt:'DESC'}}) : [];
    const list = rows.map((row)=> {
      const order = orders.find((item)=>item.id===row.workOrderId);
      const mail = mails.find((item)=>(item.portalSubmissionId===row.id || Boolean(row.workOrderId && item.workOrderId===row.workOrderId)) && item.templateCode !== 'portal-attachments');
      const steps = (order?.dispatchedOrders ?? []).filter(child => !isExportOnlyDispatchModule(child.moduleCode) && isDispatchModuleVisibleForOrderType(child.moduleCode, order!.orderType))
        .map(child => ({ name: getDispatchModuleLabel(child.moduleCode), status: child.status, completedAt: child.completedAt }));
      const labels: Record<string,string> = { pending:'待办理',processing:'办理中',completed:'已办结',returned:'已退回',void:'已作废',withdrawn:'已撤回',modify_pending:'修改审核中',withdraw_pending:'撤回审核中',void_pending:'作废审核中' };
      const reviewStatus = String(order?.extraData?.portal_review_status ?? '');
      const customerCorrection = reviewStatus === 'needs_correction';
      const result = customerCorrection ? (String(order?.extraData?.portal_correction_reason ?? '') || '请补充或修正资料') : (order ? (steps.length ? steps.map(step=>`${step.name}：${labels[step.status] ?? '办理中'}`).join('；') : '资料已受理，等待内部审核') : row.resultNote);
      return {id:row.id,requestNo:row.requestNo,businessType:row.businessType,subject:order?.employeeName ?? String(row.fields.month ?? ''),status:customerCorrection ? 'needs_correction' : (order?.status ?? row.status),createdAt:row.createdAt,completedAt:order?.completedAt ?? row.completedAt,result,steps,completionEmailStatus:mail?.status ?? null,correctionReason:customerCorrection ? String(order?.extraData?.portal_correction_reason ?? '') : '',correctionFields:customerCorrection && Array.isArray(order?.extraData?.portal_correction_fields) ? order.extraData.portal_correction_fields : [],fields:row.fields};
    });
    return { list, total:list.length, summary:{processing:list.filter((row)=>!['completed','void','withdrawn'].includes(row.status)).length,completed:list.filter((row)=>row.status==='completed').length}, month:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}).slice(0,7) };
  }

  private async withUploadCompensation<T>(lockKey: string, operation: (manager: EntityManager, createdFileIds: string[]) => Promise<T>): Promise<T> {
    const createdFileIds: string[] = [];
    const uploadLockKey = `portal-upload:${lockKey}`;
    try {
      return await this.dataSource.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [uploadLockKey]);
        return operation(manager, createdFileIds);
      });
    } catch (error) {
      if (createdFileIds.length) {
        try {
          await this.dataSource.transaction(async (manager) => {
            await manager.query("SET LOCAL lock_timeout = '5s'");
            // A lost COMMIT response is ambiguous. Wait for that transaction, then inspect committed references.
            await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [uploadLockKey]);
            const records: Array<{ attachmentId: string | null; attachmentIds: string[] }> = await manager.query(
              'SELECT attachment_id AS "attachmentId", attachment_ids AS "attachmentIds" FROM work_order_completion_emails WHERE attachment_id = ANY($1::text[]) OR attachment_ids ?| $1::text[]',
              [createdFileIds],
            );
            const referenced = new Set(records.flatMap((record) => [record.attachmentId, ...(record.attachmentIds ?? [])]).filter(Boolean));
            for (const fileId of createdFileIds) {
              if (referenced.has(fileId)) continue;
              try { await this.uploads.deleteFile(fileId); }
              catch { this.logger.error(`Portal upload cleanup failed for file ${fileId}`); }
            }
          });
        } catch {
          // Retain files when the database cannot prove they are unreferenced.
          this.logger.error(`Portal upload cleanup deferred: commit state could not be verified for ${createdFileIds.length} file(s)`);
        }
      }
      throw error;
    }
  }

  private async enqueueAttachments(row: CustomerPortalSubmission, files: PortalFile[], rule: CustomerPortalRule|null, repo: Repository<WorkOrderCompletionEmail>, createdFileIds: string[]) {
    if (files.length>5) throw new BadRequestException('最多上传5个附件');
    let totalSize = 0;
    for (const file of files) {
      if (!/\.(pdf|jpe?g|png|docx?|xlsx?|zip)$/i.test(file.name) || file.name.length>180 || /[\/\\\r\n]/.test(file.name)) throw new BadRequestException('附件名称或格式不支持');
      if (!file.contentBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(file.contentBase64)) throw new BadRequestException('附件内容无效');
      const size = Buffer.byteLength(file.contentBase64, 'base64'); totalSize += size;
      if (size > 30*1024*1024) throw new BadRequestException('附件为空或超过允许大小');
    }
    if (totalSize > 30*1024*1024) throw new BadRequestException('附件总大小超过允许大小');
    const attachmentIds: string[] = [];
    for (const file of files) {
      const content = Buffer.from(file.contentBase64,'base64');
      if (!content.length) throw new BadRequestException('附件为空或超过允许大小');
      const saved = await this.uploads.saveBuffer({kind:'attachment',buffer:content,originalName:file.name,mimeType:file.mimeType});
      createdFileIds.push(saved.fileId);
      attachmentIds.push(saved.fileId);
    }
    const mailbox = rule?.sharedEmailRules?.mailbox?.trim();
    await repo.save(repo.create({workOrderId:null,portalSubmissionId:row.id,customerId:row.customerId,completedVersion:1,templateCode:'portal-attachments',templateVersion:'v1',toRecipients:mailbox?[mailbox]:[],ccRecipients:[],replyTo:null,subject:`客户资料 ${row.requestNo}`,bodySnapshot:`客户 ${row.customerId} 提交${row.businessType}附件，请共享部门核验归档。`,attachmentIds,attachmentId:null,attachmentHash:null,status:mailbox?'pending':'failed',attemptCount:0,nextRetryAt:null,lastError:mailbox?null:'共享邮箱地址尚未配置，附件已保存，配置后可重试',sentAt:null}));
  }

  async attachments(input: PortalInput, user?: JwtUserPayload) {
    const session = await this.session(input);
    if (!input.files?.length) throw new BadRequestException('请选择附件');
    const fingerprint = this.hash(input.files);
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(input.requestId ?? '')) throw new BadRequestException('请求编号无效');
    return this.withUploadCompensation(this.hash([session.customer.id, session.account.id, input.requestId]), async (manager, createdFileIds)=> {
      const repo=manager.getRepository(CustomerPortalSubmission);
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))',[session.customer.id+session.account.id+input.requestId]);
      const existing=await repo.findOne({where:{customerId:session.customer.id,accountId:session.account.id,requestId:input.requestId!}});
      if(existing){if(existing.inputHash!==fingerprint)throw new ConflictException('请求编号已用于其他附件');return this.receipt(existing);}
      const row=await repo.save(repo.create({customerId:session.customer.id,accountId:session.account.id,businessType:input.businessType!,requestId:input.requestId!,inputHash:fingerprint,requestNo:'ATT-'+randomUUID().slice(0,8).toUpperCase(),fields:{},status:'received'}));
      const rule=await this.rules.findOne({where:{customerId:session.customer.id,isActive:true}});
      await this.enqueueAttachments(row,input.files!,rule,manager.getRepository(WorkOrderCompletionEmail),createdFileIds);
      return {...this.receipt(row),ok:Boolean(rule?.sharedEmailRules?.mailbox),status:row.status,message:rule?.sharedEmailRules?.mailbox?'附件已保存并进入共享邮箱发送队列。':'共享邮箱尚未配置，附件已保存但投递失败，请配置后重试。'};
    });
  }

  private async assertCustomerAccess(customerId: string, user: JwtUserPayload): Promise<Customer> {
    if (!isUUID(customerId)) throw new BadRequestException('客户 UUID 格式错误');
    const businessScope = user.businessScope ?? BusinessScope.BEILUN;
    const customer = await this.customers.findOne({ where: { id: customerId, businessScope } });
    if (!customer) throw new NotFoundException('客户不存在');
    return customer;
  }

  async listSalary(customerId: string, user: JwtUserPayload) {
    await this.assertAssignedCustomerAccess(customerId, user);
    return this.submissions.find({where:{customerId,businessType:'salary'},order:{createdAt:'DESC'},take:200});
  }
  async listSalaryWorkbench(month: string | undefined, user: JwtUserPayload) {
    const targetMonth = month?.trim() || this.defaultSalaryMonth(null);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
      throw new BadRequestException('薪资所属月份格式应为 YYYY-MM');
    }
    const businessScope = user.businessScope ?? BusinessScope.BEILUN;
    const customers = await this.listPortalBusinessCustomers(user, businessScope);
    if (!customers.length) {
      return { month: targetMonth, summary: { total: 0, submitted: 0, notSubmitted: 0, received: 0, completed: 0 }, list: [] };
    }
    const customerIds = customers.map((customer) => customer.id);
    const [rules, submissions, emails] = await Promise.all([
      this.rules.find({ where: { customerId: In(customerIds), isActive: true } }),
      this.submissions.find({ where: { customerId: In(customerIds), businessType: 'salary' }, order: { createdAt: 'DESC' }, take: 5000 }),
      this.mails.find({ where: { customerId: In(customerIds) }, order: { createdAt: 'DESC' }, take: 5000 }),
    ]);
    const latestByCustomer = new Map<string, CustomerPortalSubmission>();
    for (const submission of submissions) {
      if (String(submission.fields?.month ?? '') !== targetMonth || !latestByCustomer.has(submission.customerId)) {
        if (String(submission.fields?.month ?? '') === targetMonth && !latestByCustomer.has(submission.customerId)) latestByCustomer.set(submission.customerId, submission);
      }
    }
    const ruleByCustomer = new Map(rules.map((rule) => [rule.customerId, rule]));
    const emailsBySubmission = new Map<string, WorkOrderCompletionEmail[]>();
    for (const email of emails) {
      if (!email.portalSubmissionId) continue;
      const rows = emailsBySubmission.get(email.portalSubmissionId) ?? [];
      rows.push(email);
      emailsBySubmission.set(email.portalSubmissionId, rows);
    }
    const list = await Promise.all(customers.map(async (customer) => {
      const submission = latestByCustomer.get(customer.id);
      const customerEmails = submission ? (emailsBySubmission.get(submission.id) ?? []) : [];
      const attachmentIds = Array.from(new Set(customerEmails.flatMap((email) => [email.attachmentId, ...(email.attachmentIds ?? [])]).filter((id): id is string => Boolean(id))));
      const attachments = await Promise.all(attachmentIds.map(async (fileId) => {
        try {
          const meta = await this.uploads.resolveFile(fileId);
          return { fileId, fileName: meta.originalName, mimeType: meta.mimeType, size: meta.size, downloadUrl: `/api/files/${fileId}` };
        } catch {
          return { fileId, fileName: fileId, mimeType: null, size: null, downloadUrl: `/api/files/${fileId}` };
        }
      }));
      const completionEmail = customerEmails.find((email) => email.templateCode === 'portal-salary-completion') ?? null;
      const attachmentEmail = customerEmails.find((email) => email.templateCode === 'portal-attachments') ?? null;
      const status = submission?.status === 'completed' ? 'completed' : submission ? 'received' : 'not_submitted';
      return {
        customerId: customer.id,
        customerName: customer.customerName,
        customerCode: customer.customerCode,
        configured: Boolean(ruleByCustomer.get(customer.id)),
        expectedMonth: targetMonth,
        submissionId: submission?.id ?? null,
        requestNo: submission?.requestNo ?? null,
        status,
        mode: submission?.fields?.mode ?? null,
        channel: submission?.fields?.channel ?? null,
        note: submission?.fields?.note ?? null,
        createdAt: submission?.createdAt ?? null,
        completedAt: submission?.completedAt ?? null,
        resultNote: submission?.resultNote ?? null,
        attachmentEmailStatus: attachmentEmail?.status ?? null,
        completionEmailStatus: completionEmail?.status ?? null,
        attachmentCount: attachments.length,
        attachments,
      };
    }));
    return {
      month: targetMonth,
      summary: {
        total: list.length,
        submitted: list.filter((row) => row.status !== 'not_submitted').length,
        notSubmitted: list.filter((row) => row.status === 'not_submitted').length,
        received: list.filter((row) => row.status === 'received').length,
        completed: list.filter((row) => row.status === 'completed').length,
      },
      list,
    };
  }

  async listSalaryReturns(query: {
    month?: string;
    customerId?: string;
    status?: string;
    search?: string;
    page?: string | number;
    pageSize?: string | number;
  }, user: JwtUserPayload) {
    const month = String(query.month ?? '').trim();
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('薪资所属月份格式应为 YYYY-MM');
    const businessScope = user.businessScope ?? BusinessScope.BEILUN;
    let customers: Customer[];
    customers = await this.listPortalBusinessCustomers(user, businessScope);
    if (query.customerId) customers = customers.filter((customer) => customer.id === query.customerId);
    if (!customers.length) return { items: [], total: 0, page: 1, pageSize: 20 };
    const customerIds = customers.map((customer) => customer.id);
    const [submissions, emails] = await Promise.all([
      this.submissions.find({ where: { customerId: In(customerIds), businessType: 'salary' }, order: { createdAt: 'DESC' }, take: 10000 }),
      this.mails.find({ where: { customerId: In(customerIds) }, order: { createdAt: 'DESC' }, take: 10000 }),
    ]);
    const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
    const emailsBySubmission = new Map<string, WorkOrderCompletionEmail[]>();
    for (const email of emails) {
      if (!email.portalSubmissionId) continue;
      const rows = emailsBySubmission.get(email.portalSubmissionId) ?? [];
      rows.push(email);
      emailsBySubmission.set(email.portalSubmissionId, rows);
    }
    const keyword = String(query.search ?? '').trim().toLowerCase();
    const filtered = await Promise.all(submissions.filter((submission) => {
      if (month && String(submission.fields?.month ?? '') !== month) return false;
      if (query.status && submission.status !== query.status) return false;
      if (!keyword) return true;
      const customer = customerMap.get(submission.customerId);
      return [submission.requestNo, customer?.customerName, customer?.customerCode, submission.fields?.month, submission.fields?.note]
        .some((value) => String(value ?? '').toLowerCase().includes(keyword));
    }).map(async (submission) => {
      const customer = customerMap.get(submission.customerId);
      const submissionEmails = emailsBySubmission.get(submission.id) ?? [];
      const attachmentEmail = submissionEmails.find((email) => email.templateCode === 'portal-attachments') ?? null;
      const completionEmail = submissionEmails.find((email) => email.templateCode === 'portal-salary-completion') ?? null;
      const resolveAttachments = async (fileIds: string[]) => Promise.all(fileIds.map(async (fileId) => {
        try {
          const meta = await this.uploads.resolveFile(fileId);
          return { fileId, fileName: meta.originalName, mimeType: meta.mimeType, size: meta.size, downloadUrl: `/api/files/${fileId}` };
        } catch {
          return { fileId, fileName: fileId, mimeType: null, size: null, downloadUrl: `/api/files/${fileId}` };
        }
      }));
      const uniqueIds = (email: WorkOrderCompletionEmail | null) => Array.from(new Set([email?.attachmentId, ...(email?.attachmentIds ?? [])].filter((id): id is string => Boolean(id))));
      // 客户在门户上传的附件与内部办结后生成的回传附件分开呈现，业务员才能同时看到文字填写和附件提交两种内容。
      const submissionAttachments = await resolveAttachments(uniqueIds(attachmentEmail));
      const completionAttachments = await resolveAttachments(uniqueIds(completionEmail));
      const attachments = [...submissionAttachments, ...completionAttachments];
      return {
        id: submission.id,
        customerId: submission.customerId,
        customerName: customer?.customerName ?? '',
        customerCode: customer?.customerCode ?? '',
        requestNo: submission.requestNo,
        month: String(submission.fields?.month ?? ''),
        status: submission.status,
        mode: submission.fields?.mode ?? null,
        channel: submission.fields?.channel ?? null,
        note: submission.fields?.note ?? null,
        createdAt: submission.createdAt,
        completedAt: submission.completedAt,
        resultNote: submission.resultNote,
        attachments,
        submissionAttachments,
        completionAttachments,
        attachmentEmail: attachmentEmail ? { id: attachmentEmail.id, status: attachmentEmail.status, attemptCount: attachmentEmail.attemptCount, lastError: attachmentEmail.lastError, sentAt: attachmentEmail.sentAt, toRecipients: attachmentEmail.toRecipients } : null,
        completionEmail: completionEmail ? { id: completionEmail.id, status: completionEmail.status, attemptCount: completionEmail.attemptCount, lastError: completionEmail.lastError, sentAt: completionEmail.sentAt, toRecipients: completionEmail.toRecipients } : null,
      };
    }));
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize };
  }

  async completeSalary(id:string,customerId:string,resultNote:string,user:JwtUserPayload) {
    if(!resultNote.trim() || resultNote.length>2000)throw new BadRequestException('请填写2000字以内的办理结果');
    const customer = await this.assertAssignedCustomerAccess(customerId,user);
    return this.withUploadCompensation(this.hash([customerId, id, 'salary-completion']), async(manager, createdFileIds)=>{
      const repo=manager.getRepository(CustomerPortalSubmission);
      const row=await repo.findOne({where:{id,customerId,businessType:'salary'},lock:{mode:'pessimistic_write'}});
      if(!row)throw new NotFoundException('薪资受理记录不存在');
      if(row.status==='completed')return row;
      row.status='completed';row.resultNote=resultNote.trim();row.completedAt=new Date();
      const rule=await this.rules.findOne({where:{customerId,isActive:true}});
      if(rule?.completionEmailEnabled && rule.completionEmailTo.length){
        const content = this.notificationSettings ? await this.notificationSettings.render('completion', {
          order_no:row.requestNo, employee_name:'', customer_name:customer.customerName, business_type:'薪资',
          objection_notice:rule.objectionDeadlineDays===null?'如有异议，请按约定时间反馈。':`如有异议，请在${rule.objectionDeadlineDays}天内反馈。`,
        },manager) : {subject:`薪资${row.requestNo}办结结果`,body:row.resultNote};
        const book=new Workbook();const sheet=book.addWorksheet('薪资办结结果');
        sheet.addRows([['受理编号','所属月份','办理结果'],[row.requestNo,String(row.fields.month),row.resultNote]]);
        const buffer=Buffer.from(await book.xlsx.writeBuffer());const file=await this.uploads.saveBuffer({kind:'excel',buffer,originalName:`${row.requestNo}-薪资办结结果.xlsx`,mimeType:MIME});
        createdFileIds.push(file.fileId);
        const mails=manager.getRepository(WorkOrderCompletionEmail);
        await mails.save(mails.create({workOrderId:null,portalSubmissionId:row.id,customerId,completedVersion:1,templateCode:'portal-salary-completion',templateVersion:'v1',toRecipients:rule.completionEmailTo,ccRecipients:rule.completionEmailCc,replyTo:rule.completionEmailReplyTo,subject:content.subject,bodySnapshot:content.body,attachmentId:file.fileId,attachmentIds:[],attachmentHash:this.hash(buffer),status:'pending',attemptCount:0,nextRetryAt:null,lastError:null,sentAt:null}));
      }
      return repo.save(row);
    });
  }

  async emailRecords(customerId:string,user:JwtUserPayload) {
    await this.assertAssignedCustomerAccess(customerId,user);
    return this.mails.find({where:{customerId},order:{createdAt:'DESC'},take:200});
  }
  async retryEmail(id:string,customerId:string,user:JwtUserPayload){
    await this.assertAssignedCustomerAccess(customerId,user);
    const row=await this.mails.findOne({where:{id,customerId}});if(!row)throw new NotFoundException('发送记录不存在');
    if(!['failed','pending'].includes(row.status))throw new ConflictException('当前邮件状态不允许重试');
    if(row.templateCode==='portal-attachments'){const rule=await this.rules.findOne({where:{customerId,isActive:true}});if(!rule?.sharedEmailRules?.mailbox)throw new BadRequestException('请先配置共享邮箱');if(!this.isMailTransportConfigured())throw new BadRequestException('共享邮箱 SMTP 尚未配置，请先完成邮件服务配置');row.toRecipients=[rule.sharedEmailRules.mailbox];}
    row.status='pending';row.attemptCount=0;row.nextRetryAt=null;row.lastError=null;return this.mails.save(row);
  }

  private async listPortalBusinessCustomers(user: JwtUserPayload, businessScope: BusinessScope): Promise<Customer[]> {
    const roles = user.roles ?? [];
    if (isAdminRole(roles) || hasManagementScopeRole(roles)) {
      return this.customers.find({ where: { businessScope, isActive: true }, order: { customerName: 'ASC', customerCode: 'ASC' } });
    }
    const assigned = await this.dataSource.getRepository(CustomerAssignee).find({
      where: { userId: user.sub, businessScope, isActive: true },
      select: ['customerId'],
    });
    const customerIds = assigned.map((item) => item.customerId);
    return customerIds.length
      ? this.customers.find({ where: { id: In(customerIds), businessScope, isActive: true }, order: { customerName: 'ASC', customerCode: 'ASC' } })
      : [];
  }

  private async assertAssignedCustomerAccess(customerId: string, user: JwtUserPayload): Promise<Customer> {
    const customer = await this.assertCustomerAccess(customerId, user);
    const roles = user.roles ?? [];
    if (isAdminRole(roles) || hasManagementScopeRole(roles)) return customer;
    const assignment = await this.dataSource.getRepository(CustomerAssignee).findOne({
      where: { customerId, userId: user.sub, businessScope: user.businessScope ?? BusinessScope.BEILUN, isActive: true },
    });
    if (!assignment) throw new ForbiddenException('当前账号未分配该客户');
    return customer;
  }

  private isMailTransportConfigured(): boolean {
    const config = this.configService?.get<AppConfig['mail']>('mail', { infer: true });
    return Boolean(config?.enabled && config.host && config.port > 0 && config.from && config.maxAttempts > 0);
  }
}
