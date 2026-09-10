import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In, MoreThanOrEqual, Repository } from 'typeorm';
import { Workbook } from 'exceljs';
import { isUUID } from 'class-validator';
import { BusinessScope, Customer, CustomerPortalRule, FieldConfig, OrderType, WorkOrder, WorkOrderCompletionEmail } from 'src/entities';
import { CustomerPortalSubmission } from 'src/entities/customer-portal-submission.entity';
import { CustomerPortalAccountsService, PortalBusinessType, businessTypesForPermissions } from '../customer-portal-accounts/customer-portal-accounts.service';
import { JwtUserPayload } from '../auth/auth.types';
import { WorkOrderService } from '../work-orders/work-order.service';
import { ImportTemplateService } from '../imports/import-template.service';
import { ImportTemplateConfigService, ImportTemplateFieldView } from '../imports/import-template-config.service';
import { ImportFieldValidationService } from '../imports/field-validation.service';
import { ExcelParserService } from '../imports/excel-parser.service';
import { UploadService } from '../upload/upload.service';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from 'src/config/configuration';

const EDITABLE = {
  onboarding: ['employee_name','id_card_type','id_card_no','mobile','email','household_type','ethnicity','education','marital_status','household_address','current_address','position','position_type','work_city','contract_term_type','contract_term','contract_start_date','contract_end_date','probation_start_date','probation_months','probation_end_date','probation_salary','probation_other_salary','work_hour_system','salary_form','base_salary','other_salary','social_location','start_month','social_base','fund_base','bank_name','bank_account'],
  resignation: ['employee_name','id_card_no','mobile','email','resignation_date','social_stop_month','resignation_reason'],
};
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
type Business = PortalBusinessType;
type Session = Awaited<ReturnType<CustomerPortalAccountsService['session']>>;
export interface PortalFile { name: string; mimeType: string; bizPurpose?: string; contentBase64: string }
export interface PortalInput { linkToken: string; businessType?: Business; requestId?: string; fields?: Record<string, unknown>; fileName?: string; contentBase64?: string; files?: PortalFile[] }
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
    @Optional() private readonly configService?: ConfigService<AppConfig, true>,
  ) {}

  private async session(input: PortalInput, requireBusiness = true): Promise<Session> {
    if (requireBusiness && !['onboarding','resignation','salary'].includes(input.businessType ?? '')) throw new BadRequestException('请选择业务类型');
    const session = await this.auth.session(input.linkToken, requireBusiness ? input.businessType : undefined);
    if (session.mustChangePassword) throw new ForbiddenException('请先修改初始密码');
    return session;
  }

  async schema(input: PortalInput) {
    await this.session(input);
    if (input.businessType === 'salary') return { fields: [], reminderWorkdayOffsets: [3,2,1] };
    const fields = await this.editableFields(input.businessType as 'onboarding'|'resignation');
    return { fields: fields.map((field) => ({ code: field.fieldCode, name: field.fieldName, required: field.isRequired, options: field.dropdownOptions ?? [], type: field.fieldType })) };
  }

  async template(input: PortalInput) {
    const session = await this.session(input);
    if (input.businessType === 'salary') throw new BadRequestException('薪资使用变化说明或附件，无员工明细模板');
    const business = input.businessType as 'onboarding'|'resignation';
    const fields = await this.editableFields(business);
    const configured = await this.templateConfig.list(business as OrderType);
    const views = fields.map((field): ImportTemplateFieldView => ({
      ...(configured.find((item) => item.fieldCode === field.fieldCode) ?? {}),
      ...field, orderType: business as OrderType, order_type: business as OrderType,
      headerAlias: null, isRequiredOverride: field.isRequired,
    } as ImportTemplateFieldView));
    const generated = await this.templates.generateForFields(business as OrderType, views);
    // Metadata binds the standard workbook to its customer and current field schema.
    const book = new Workbook();
    await book.xlsx.load(generated.buffer as never);
    const metadata = book.addWorksheet('__portal'); metadata.state = 'veryHidden';
    metadata.addRows([['customerId', session.customer.id], ['businessType', business], ['schema', this.schemaHash(fields)]]);
    return { fileName: business === 'onboarding' ? '客户入职标准模板.xlsx' : '客户离职标准模板.xlsx', mimeType: MIME, contentBase64: Buffer.from(await book.xlsx.writeBuffer()).toString('base64') };
  }

  private async editableFields(business: 'onboarding'|'resignation'): Promise<FieldConfig[]> {
    const all = await this.fields.find({ where: { isActive: true, fieldCode: In(EDITABLE[business]) } });
    const configured = await this.templateConfig.list(business as OrderType);
    return EDITABLE[business].map((code) => all.find((field) => field.fieldCode === code)).filter((field): field is FieldConfig => Boolean(field)).map((field) => {
      const override = configured.find((item) => item.fieldCode === field.fieldCode);
      return Object.assign(new FieldConfig(), field, {
        // The customer submits intake; internal-only requirements remain for internal review.
        isRequired: business === 'resignation' ? ['employee_name','id_card_no','mobile','resignation_date','social_stop_month','resignation_reason'].includes(field.fieldCode) : (override?.isRequired ?? field.isRequired),
        defaultRequired: business === 'resignation' ? ['employee_name','id_card_no','mobile','resignation_date','social_stop_month','resignation_reason'].includes(field.fieldCode) : (override?.defaultRequired ?? field.defaultRequired),
        conditionalRequired: override?.conditionalRequired ?? field.conditionalRequired,
      });
    });
  }

  private schemaHash(fields: FieldConfig[]) { return this.hash(fields.map((field) => [field.fieldCode,field.fieldName,field.isRequired,field.dropdownOptions])); }
  private hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

  private normalizeSalary(fields: Record<string, unknown>): NormalizedSalary {
    if (Object.keys(fields).some((key) => !['mode','note','channel','month'].includes(key))) throw new BadRequestException('薪资不接受员工明细或金额字段');
    const month = String(fields.month ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0,7));
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
    const result = await this.validation.validateRow({ rowNo, raw, mapping: fields.map((field) => ({header:field.fieldCode,fieldCode:field.fieldCode})), orderType: business as OrderType, fields });
    if (!result.ok) throw new BadRequestException(result.errors.map((error) => error.message).join('；'));
    return result.normalized;
  }

  async submit(input: PortalInput, user?: JwtUserPayload) {
    const session = await this.session(input);
    const business = input.businessType!;
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(input.requestId ?? '')) throw new BadRequestException('请求编号无效');
    const normalized: NormalizedSalary | Record<string, unknown> = business === 'salary'
      ? this.normalizeSalary(input.fields ?? {})
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
      const rule = await this.rules.findOne({ where: { customerId: session.customer.id, isActive: true } });
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
        // Recover a draft if a prior connection failed after the existing work-order service committed it.
        const recovered = await this.orders.createQueryBuilder('w').where('w.customer_id = :customerId', { customerId: session.customer.id }).andWhere("w.extra_data ->> 'portal_intake_key' = :key", { key }).andWhere("w.extra_data ->> 'portal_input_hash' = :fingerprint", { fingerprint }).andWhere("w.order_type = :orderType", { orderType: business }).getOne();
        const draft = recovered ?? await this.workOrders.createDraft({ orderType: business as OrderType, customerId: session.customer.id, extraData: {
          ...normalized, ...(business === 'onboarding' ? rule?.onboardingDefaults : rule?.resignationDefaults),
          customer_name: session.customer.customerName, customer_code: session.customer.customerCode, portal_intake_key: key, portal_input_hash: fingerprint, portal_business_type: business,
        } }, await this.getPortalActor());
        orderId = draft.id; requestNo = draft.orderNo;
      }
      const row = await repo.save(repo.create({ customerId: session.customer.id, accountId: session.account.id, businessType: business, requestId: input.requestId!, inputHash: fingerprint, requestNo, workOrderId: orderId, fields: business === 'salary' ? normalized : {}, status: 'received', resultNote: null, completedAt: null }));
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
    const expectedHeaders = ['字段名', ...fields.map((field) => field.fieldName), '附件'];
    const actualHeaders = Array.from({ length: expectedHeaders.length }, (_, index) => String(sheet.getCell(1, index + 1).text ?? '').trim());
    if (actualHeaders.length !== expectedHeaders.length || actualHeaders.some((header, index) => header !== expectedHeaders[index])) throw new BadRequestException('模板表头被修改，请重新下载标准模板');
    const parsed = await this.parser.parseBuffer(buffer, { headerRows: 1 });
    const headers = fields.map((field) => field.fieldName);
    if (!parsed.rows.length || parsed.rows.length > 500) throw new BadRequestException('每次请导入1至500条资料');
    const details: Array<{rowNumber:number;success:boolean;message:string;workOrderNo?:string}> = [];
    const digest = this.hash(input.contentBase64);
    for (let index=0; index<parsed.rows.length; index++) {
      const rowNumber = parsed.meta.rowNumbers[index] + 1;
      const raw = Object.fromEntries(fields.map((field) => [field.fieldCode, parsed.rows[index][field.fieldName] ?? '']));
      try {
        await this.validateFields(business, raw, rowNumber);
        const result = confirm ? await this.submit({ ...input, files: undefined, fields: raw, requestId: `excel-${digest.slice(0,48)}-${rowNumber}` }, user) : undefined;
        details.push({ rowNumber, success:true, message: confirm ? '已受理' : '校验通过', ...(result ? {workOrderNo:result.workOrderNo} : {}) });
      } catch (error) { details.push({rowNumber,success:false,message:error instanceof Error ? error.message : '导入失败'}); }
    }
    return { ok:true, templateValid:true, successCount:details.filter((row)=>row.success).length, failureCount:details.filter((row)=>!row.success).length, details };
  }

  async progress(input: PortalInput) {
    const session = await this.session(input, false);
    const allowed = businessTypesForPermissions(session.businessPermissions);
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    const rows = await this.submissions.find({ where: {customerId:session.customer.id,businessType:In(allowed),createdAt:MoreThanOrEqual(since)},order:{createdAt:'DESC'},take:200 });
    const orders = rows.some((row)=>row.workOrderId) ? await this.orders.find({where:{id:In(rows.map((row)=>row.workOrderId).filter(Boolean)),customerId:session.customer.id}}) : [];
    const mails = rows.length ? await this.mails.find({where:[{portalSubmissionId:In(rows.map((row)=>row.id))},...(orders.length?[{workOrderId:In(orders.map((row)=>row.id)),customerId:session.customer.id}]:[])],order:{createdAt:'DESC'}}) : [];
    const list = rows.map((row)=> {
      const order = orders.find((item)=>item.id===row.workOrderId);
      const mail = mails.find((item)=>(item.portalSubmissionId===row.id || Boolean(row.workOrderId && item.workOrderId===row.workOrderId)) && item.templateCode !== 'portal-attachments');
      return {id:row.id,requestNo:row.requestNo,businessType:row.businessType,subject:order?.employeeName ?? String(row.fields.month ?? ''),status:order?.status ?? row.status,createdAt:row.createdAt,completedAt:order?.completedAt ?? row.completedAt,result:row.resultNote,completionEmailStatus:mail?.status ?? null};
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

  private async assertCustomerAccess(customerId: string, user: JwtUserPayload): Promise<void> {
    if (!isUUID(customerId)) throw new BadRequestException('客户 UUID 格式错误');
    const businessScope = user.businessScope ?? BusinessScope.BEILUN;
    const customer = await this.customers.findOne({ where: { id: customerId, businessScope } });
    if (!customer) throw new NotFoundException('客户不存在');
  }

  async listSalary(customerId: string, user: JwtUserPayload) {
    await this.assertCustomerAccess(customerId, user);
    return this.submissions.find({where:{customerId,businessType:'salary'},order:{createdAt:'DESC'},take:200});
  }

  async completeSalary(id:string,customerId:string,resultNote:string,user:JwtUserPayload) {
    if(!resultNote.trim() || resultNote.length>2000)throw new BadRequestException('请填写2000字以内的办理结果');
    await this.assertCustomerAccess(customerId,user);
    return this.withUploadCompensation(this.hash([customerId, id, 'salary-completion']), async(manager, createdFileIds)=>{
      const repo=manager.getRepository(CustomerPortalSubmission);
      const row=await repo.findOne({where:{id,customerId,businessType:'salary'},lock:{mode:'pessimistic_write'}});
      if(!row)throw new NotFoundException('薪资受理记录不存在');
      if(row.status==='completed')return row;
      row.status='completed';row.resultNote=resultNote.trim();row.completedAt=new Date();
      const rule=await this.rules.findOne({where:{customerId,isActive:true}});
      if(rule?.completionEmailEnabled && rule.completionEmailTo.length){
        const book=new Workbook();const sheet=book.addWorksheet('薪资办结结果');
        sheet.addRows([['受理编号','所属月份','办理结果'],[row.requestNo,String(row.fields.month),row.resultNote]]);
        const buffer=Buffer.from(await book.xlsx.writeBuffer());const file=await this.uploads.saveBuffer({kind:'excel',buffer,originalName:`${row.requestNo}-薪资办结结果.xlsx`,mimeType:MIME});
        createdFileIds.push(file.fileId);
        const mails=manager.getRepository(WorkOrderCompletionEmail);
        await mails.save(mails.create({workOrderId:null,portalSubmissionId:row.id,customerId,completedVersion:1,templateCode:'portal-salary-completion',templateVersion:'v1',toRecipients:rule.completionEmailTo,ccRecipients:rule.completionEmailCc,replyTo:rule.completionEmailReplyTo,subject:`薪资${row.requestNo}办结结果`,bodySnapshot:row.resultNote,attachmentId:file.fileId,attachmentIds:[],attachmentHash:this.hash(buffer),status:'pending',attemptCount:0,nextRetryAt:null,lastError:null,sentAt:null}));
      }
      return repo.save(row);
    });
  }

  async emailRecords(customerId:string,user:JwtUserPayload) {
    await this.assertCustomerAccess(customerId,user);
    return this.mails.find({where:{customerId},order:{createdAt:'DESC'},take:200});
  }
  async retryEmail(id:string,customerId:string,user:JwtUserPayload){
    await this.assertCustomerAccess(customerId,user);
    const row=await this.mails.findOne({where:{id,customerId}});if(!row)throw new NotFoundException('发送记录不存在');
    if(!['failed','pending'].includes(row.status))throw new ConflictException('当前邮件状态不允许重试');
    if(row.templateCode==='portal-attachments'){const rule=await this.rules.findOne({where:{customerId,isActive:true}});if(!rule?.sharedEmailRules?.mailbox)throw new BadRequestException('请先配置共享邮箱');if(!this.isMailTransportConfigured())throw new BadRequestException('共享邮箱 SMTP 尚未配置，请先完成邮件服务配置');row.toRecipients=[rule.sharedEmailRules.mailbox];}
    row.status='pending';row.attemptCount=0;row.nextRetryAt=null;row.lastError=null;return this.mails.save(row);
  }

  private isMailTransportConfigured(): boolean {
    const config = this.configService?.get<AppConfig['mail']>('mail', { infer: true });
    return Boolean(config?.enabled && config.host && config.port > 0 && config.from && config.maxAttempts > 0);
  }
}
