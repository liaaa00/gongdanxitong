import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { BusinessScope, FieldConfig, FieldType, OrderType } from 'src/entities';
import { CustomerPortalSubmission } from 'src/entities/customer-portal-submission.entity';
import { CustomerPortalService } from 'src/modules/customer-portal/customer-portal.service';
import { ImportTemplateService } from 'src/modules/imports/import-template.service';
import { ExcelParserService } from 'src/modules/imports/excel-parser.service';

const customerId='11111111-1111-4111-8111-111111111111';
const session={customer:{id:customerId,customerName:'客户',customerCode:'SAME'},account:{id:'22222222-2222-4222-8222-222222222222'},businessPermissions:['employee_changes','salary'],mustChangePassword:false};
const token='test-session-token';
function fixture(){
  const fieldDefinitions=[['employee_name','员工姓名'],['id_card_no','证件号码'],['mobile','移动电话'],['email','电子邮件'],['resignation_date','离职日期'],['social_stop_month','社保公积金停保月'],['resignation_reason','离职原因'],['social_location','社保缴纳地']];
  const fields: FieldConfig[]=fieldDefinitions.map(([fieldCode,fieldName])=>Object.assign(new FieldConfig(),{id:fieldCode,fieldCode,fieldName,fieldType:fieldCode==='resignation_reason'?FieldType.DROPDOWN:FieldType.TEXT,isActive:true,isRequired:false,defaultRequired:false,conditionalRequired:null,dropdownOptions:fieldCode==='resignation_reason'?['个人辞职','公司解聘']:null,orderType:OrderType.RESIGNATION,displayOrder:1}));
  const auth={session:jest.fn().mockResolvedValue(session)};
  const templateConfig={list:jest.fn().mockResolvedValue([])};
  const submissions={find:jest.fn().mockResolvedValue([])};
  const customers={findOne:jest.fn().mockImplementation(async ({ where }) => where.businessScope === 'beilun' ? { id: customerId, businessScope: 'beilun' } : null)};
  const validation={validateRow:jest.fn().mockImplementation(async({raw})=>({ok:true,normalized:raw,errors:[]}))};
  const transaction=jest.fn();
  const query=jest.fn();
  const rules={findOne:jest.fn().mockResolvedValue(null)};
  const contractSubjects={listFundLocations:jest.fn().mockResolvedValue([]),findFundRuleByLocation:jest.fn().mockResolvedValue(null)};
  const ruleApplication={resolve:jest.fn().mockResolvedValue({defaults:{},branch:null,missing:['缴纳地对应商社']})};
  const orders={createQueryBuilder:jest.fn(),find:jest.fn().mockResolvedValue([])};
  const mails={find:jest.fn().mockResolvedValue([])};
  const workOrders={createDraft:jest.fn().mockResolvedValue({id:'draft-id',orderNo:'WO-PORTAL'})};
  const service=new CustomerPortalService(auth as never,{transaction,query} as never,submissions as never,rules as never,customers as never,{find:jest.fn().mockResolvedValue(fields)} as never,orders as never,mails as never,workOrders as never,new ImportTemplateService(templateConfig as never),templateConfig as never,validation as never,new ExcelParserService(),{} as never,contractSubjects as never,ruleApplication as never);
  return {service,auth,submissions,transaction,query,fields,customers,rules,contractSubjects,ruleApplication,orders,workOrders,validation};
}

describe('Customer portal authoritative business boundary',()=>{
  it('returns actual child completion results without internal handler data or export-only children',async()=>{
    const {service,submissions,orders}=fixture();
    submissions.find.mockResolvedValue([{id:'submission',workOrderId:'work',businessType:'onboarding',fields:{},status:'received'}]);
    orders.find.mockResolvedValue([{id:'work',orderType:OrderType.ONBOARDING,employeeName:'示例员工',status:'completed',completedAt:new Date(),dispatchedOrders:[
      {moduleCode:'contract',status:'completed',handlerId:'internal-user',completionRemark:'内部备注'},
      {moduleCode:'payroll_bank_card',status:'pending'},
    ]}]);
    const result=await service.progress({linkToken:token});
    expect(result.list[0].status).toBe('completed');
    expect(result.list[0].result).toContain('已办结');expect(result.list[0].steps).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('internal-user');expect(JSON.stringify(result)).not.toContain('内部备注');
  });

  // 批次1口径（2026-09-16）：办理进度窗口回看 12 个月（原 6 个月），保留 200 条上限。
  // 11 个月前的记录应落入窗口（since ≤ 11 个月前），13 个月前的记录应被窗口排除（since > 13 个月前）。
  it('looks back 12 months and keeps the 200-row cap for the progress window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-16T08:00:00Z'));
    try {
      const { service, submissions } = fixture();
      await service.progress({ linkToken: token });
      expect(submissions.find).toHaveBeenCalledTimes(1);
      const call = submissions.find.mock.calls[0][0];
      const operator = call.where.createdAt as { value?: Date; _value?: Date; type?: string };
      expect(operator.type).toBe('moreThanOrEqual');
      const since = new Date(operator.value ?? operator._value!);
      const elevenMonthsAgo = new Date('2025-10-16T08:00:00Z');
      const thirteenMonthsAgo = new Date('2025-08-16T08:00:00Z');
      // 11 个月前：在回看窗口内（since 早于等于该时间点）
      expect(since.getTime()).toBeLessThanOrEqual(elevenMonthsAgo.getTime());
      // 13 个月前：超出 12 个月窗口，必须被排除（since 晚于该时间点）
      expect(since.getTime()).toBeGreaterThan(thirteenMonthsAgo.getTime());
      // 精确口径：since = 2025-09-16（now - 12 个月）
      expect(Number.isNaN(since.getTime())).toBe(false);
      const oneYearAgo = new Date('2025-09-16T08:00:00Z');
      expect(Math.abs(since.getTime() - oneYearAgo.getTime())).toBeLessThan(60_000);
      expect(call.take).toBe(200);
    } finally {
      jest.useRealTimers();
    }
  });
  it('derives the configured prior salary month across a year boundary', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-01-15T00:00:00Z'));
    try {
      const { service, rules } = fixture();
      rules.findOne.mockResolvedValue({ salaryRules: { payrollMonthMode: 'previous' } });
      expect(await service.schema({linkToken:token,businessType:'salary'})).toMatchObject({defaultMonth:'2026-12',reminderWorkdayOffsets:[3,2,1]});
    } finally { jest.useRealTimers(); }
  });

  it('keeps unknown payment locations as pending intake and rejects invented fund ratios', async () => {
    const { service, fields, validation } = fixture();
    for (const code of ['social_location','fund_ratio','remark']) fields.push(Object.assign(new FieldConfig(),{fieldCode:code,fieldName:code,isActive:true,fieldType:FieldType.TEXT}));
    const raw = { social_location:'待配置城市',remark:'请核实该城市要求' };
    expect(await (service as any).validateFields('onboarding',raw)).toEqual(raw);
    expect(validation.validateRow).toHaveBeenLastCalledWith(expect.objectContaining({context:'portal_intake'}));
    await expect((service as any).validateFields('onboarding',{...raw,fund_ratio:'8%+8%'})).rejects.toThrow('不属于该缴纳地');
  });

  it('requires a choice from the official payment-location ratios and retains the chosen value', async () => {
    const { service, fields, contractSubjects } = fixture();
    fields.push(Object.assign(new FieldConfig(),{id:'social_location',fieldCode:'social_location',fieldName:'社保缴纳地',isActive:true,fieldType:FieldType.TEXT}));
    for (const code of ['fund_ratio','remark']) fields.push(Object.assign(new FieldConfig(),{id:code,fieldCode:code,fieldName:code,isActive:true,fieldType:FieldType.TEXT}));
    contractSubjects.findFundRuleByLocation.mockResolvedValue({fundRatioOptions:['5%+5%','8%+8%'],fundRatioMode:'same'});
    await expect((service as any).validateFields('onboarding',{social_location:'宁波'})).rejects.toThrow('请选择');
    await expect((service as any).validateFields('onboarding',{social_location:'宁波',fund_ratio:'8%+8%'})).resolves.toMatchObject({social_location:'宁波',fund_ratio:'8%+8%'});
  });

  it('does not infer probation from a contract date and keeps explicit probation optional', async () => {
    const { service, fields } = fixture();
    const probationCodes = ['contract_start_date','probation_start_date','probation_months','probation_end_date','probation_salary'];
    for (const code of probationCodes) fields.push(Object.assign(new FieldConfig(),{id:code,fieldCode:code,fieldName:code,isActive:true,fieldType:FieldType.TEXT}));
    await expect((service as any).validateFields('onboarding',{contract_start_date:'2026-09-01'})).not.toHaveProperty('probation_start_date');
    await expect((service as any).validateFields('onboarding',{probation_salary:'5000'})).resolves.toHaveProperty('probation_salary','5000');
    await expect((service as any).validateFields('onboarding',{probation_start_date:'2026-09-01',probation_salary:'5000'})).resolves.toHaveProperty('probation_start_date','2026-09-01');
    await expect((service as any).validateFields('onboarding',{probation_months:7})).rejects.toThrow('不可填写');
  });

  it('preserves original stop year/month while creating a pending draft using the existing month field', async () => {
    const {service,transaction,query,orders,workOrders}=fixture();
    query.mockResolvedValue([{id:'99999999-9999-4999-8999-999999999999',business_scope:BusinessScope.BEILUN}]);
    const qb={where:jest.fn().mockReturnThis(),andWhere:jest.fn().mockReturnThis(),getOne:jest.fn().mockResolvedValue(null)};
    orders.createQueryBuilder.mockReturnValue(qb);
    const repo={findOne:jest.fn().mockResolvedValue(null),create:jest.fn((value)=>value),save:jest.fn(async(value)=>({id:'submission-id',...value}))};
    transaction.mockImplementation(async(operation)=>operation({query:jest.fn(),getRepository:()=>repo}));
    await service.submit({linkToken:token,businessType:'resignation',requestId:'cross-year',fields:{employee_name:'测试员工',id_card_no:'synthetic-test-only',social_stop_month:'2027-01'}});
    expect(workOrders.createDraft).toHaveBeenCalledWith(expect.objectContaining({customerId,extraData:expect.objectContaining({social_stop_month:'1月',portal_configuration_pending:true})}),expect.any(Object),null);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({fields:expect.objectContaining({social_stop_month:'2027-01'})}));
  });
  it('checks current account permission before accessing business fields',async()=>{
    const {service,auth}=fixture();auth.session.mockRejectedValue(new ForbiddenException('未授权'));
    await expect(service.template({linkToken:token,businessType:'onboarding'})).rejects.toBeInstanceOf(ForbiddenException);
    expect(auth.session).toHaveBeenCalledWith(token,'onboarding');
  });
  it('rejects work and progress requests until mandatory password change completes',async()=>{
    const {service,auth,submissions}=fixture();auth.session.mockResolvedValue({...session,mustChangePassword:true});
    await expect(service.progress({linkToken:token})).rejects.toBeInstanceOf(ForbiddenException);
    expect(submissions.find).not.toHaveBeenCalled();
  });
  it('reads resignation dropdown values from the active field configuration',async()=>{
    const {service}=fixture();const result=await service.schema({linkToken:token,businessType:'resignation'});
    expect(result.fields.find((field)=>field.code==='resignation_reason')?.options).toEqual(['个人辞职','公司解聘']);
    expect(result.fields.some((field)=>field.code==='need_resignation_cert')).toBe(false);
  });
  it('generates a real customer-bound standard workbook with field metadata and dropdowns',async()=>{
    const {service}=fixture(); const result=await service.template({linkToken:token,businessType:"resignation"});
    expect(result.fileName).toMatch(/\.xlsx$/);
    const buffer=Buffer.from(result.contentBase64,'base64');expect(buffer.subarray(0,2).toString()).toBe('PK');
    const workbook=new Workbook();await workbook.xlsx.load(buffer as never);
    expect(workbook.getWorksheet('__portal')?.getCell('B1').text).toBe(customerId);
    expect(workbook.getWorksheet('__portal')?.state).toBe('veryHidden');
    expect(workbook.worksheets[0].getRow(1).values).toContain('离职原因');
  });
  it('imports its own onboarding workbook with the second-row header and forwards batch materials', async () => {
    const { service } = fixture();
    const template = await service.template({linkToken:token,businessType:'onboarding'});
    const workbook = new Workbook(); await workbook.xlsx.load(Buffer.from(template.contentBase64,'base64') as never);
    const sheet=workbook.worksheets[0];
    expect(sheet.getCell('A2').text).toBe('字段名');
    expect(sheet.getCell('A1').text).not.toContain('AQ-BJ');
    sheet.getCell('B6').value='演示员工';
    sheet.getCell('C6').value='synthetic-id';
    const files=[{name:'batch.pdf',mimeType:'application/pdf',contentBase64:Buffer.from('%PDF-1.7 test').toString('base64')}];
    const submit=jest.spyOn(service,'submit').mockResolvedValue({ok:true,submissionId:'row',workOrderId:'order',workOrderNo:'WO-BATCH',requestNo:'WO-BATCH',status:'received',message:'已受理'});
    const result=await service.importRows({linkToken:token,businessType:'onboarding',fileName:template.fileName,contentBase64:Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64'),files},undefined,true);
    expect(result).toMatchObject({successCount:1,failureCount:0,details:[{rowNumber:6,success:true,workOrderNo:'WO-BATCH'}]});
    expect(submit.mock.calls[0][0].fields).toMatchObject({employee_name:'演示员工'});
    expect(submit.mock.calls[0][0].files).toEqual(files);
    sheet.getCell(2,8).value='任意新增列';
    await expect(service.importRows({linkToken:token,businessType:'onboarding',fileName:template.fileName,contentBase64:Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64')},undefined,false)).rejects.toThrow('表头被修改');
  });
  it('rejects a workbook from another customer even when customer names and codes match',async()=>{
    const {service}=fixture();const generated=await service.template({linkToken:token,businessType:'resignation'});
    const workbook=new Workbook();await workbook.xlsx.load(Buffer.from(generated.contentBase64,'base64') as never);
    workbook.getWorksheet('__portal')!.getCell('B1').value='33333333-3333-4333-8333-333333333333';
    await expect(service.importRows({linkToken:token,businessType:'resignation',fileName:generated.fileName,contentBase64:Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64')},{} as never,false)).rejects.toThrow('模板客户');
  });
  it('rejects client-supplied internal configuration before writing a draft',async()=>{
    const {service,transaction}=fixture();
    await expect(service.submit({linkToken:token,businessType:'resignation',requestId:'bad-rule',fields:{need_resignation_cert:'否'}},{} as never)).rejects.toThrow('客户不可填写');
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each([{mode:'unknown'},{mode:'changed',channel:'text',note:''},{mode:'same',month:'2026-13'},{mode:'same',amount:200},{mode:'changed',channel:'attachment'}])('rejects invalid salary intake %p',async(fields)=>{
    const {service,transaction}=fixture();
    await expect(service.submit({linkToken:token,businessType:'salary',requestId:'invalid-salary',fields},{} as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('restricts progress to the signed customer and granted business types',async()=>{
    const {service,submissions}=fixture();const result=await service.progress({linkToken:token});
    expect(submissions.find.mock.calls[0][0].where.customerId).toBe(customerId);
    expect(submissions.find.mock.calls[0][0].where.businessType.value).toEqual(['onboarding','resignation','salary']);
    expect(result).toMatchObject({list:[],total:0,summary:{completed:0,processing:0}});
  });

  it('persists local salary intake without an external adapter and returns the same receipt on retry', async () => {
    const { service, transaction } = fixture();
    let saved: CustomerPortalSubmission | null = null;
    const repo = {
      findOne: jest.fn(async () => saved),
      create: jest.fn((value) => Object.assign(new CustomerPortalSubmission(), { id: 'salary-id' }, value)),
      save: jest.fn(async (value) => { saved = value; return value; }),
    };
    const manager = { query: jest.fn().mockResolvedValue([]), getRepository: jest.fn().mockReturnValue(repo) };
    transaction.mockImplementation(async (operation) => operation(manager));
    const input = { linkToken: token, businessType: 'salary' as const, requestId: 'local-salary-1', fields: { month: '2026-09', mode: 'changed', channel: 'text', note: '新增一名员工，请内部核验' } };
    const receipt = await service.submit(input);
    expect(receipt.requestNo).toMatch(/^SAL-202609-[a-f0-9-]{36}$/);
    expect(saved).toMatchObject({ customerId, accountId: session.account.id, businessType: 'salary', status: 'received', workOrderId: null, fields: input.fields });
    expect(await service.submit(input)).toEqual(receipt);
    expect(repo.save).toHaveBeenCalledTimes(1);
    await expect(service.submit({ ...input, fields: { ...input.fields, note: '不同内容' } })).rejects.toThrow('同一请求编号');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('never acknowledges salary intake when the database commit fails', async () => {
    const { service, transaction } = fixture();
    const repo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((value) => value), save: jest.fn(async (value) => ({ id: 'salary-id', ...value })) };
    transaction.mockImplementation(async (operation) => {
      await operation({ query: jest.fn().mockResolvedValue([]), getRepository: () => repo });
      throw new Error('commit failed');
    });
    await expect(service.submit({ linkToken: token, businessType: 'salary', requestId: 'salary-failed', fields: { month: '2026-09', mode: 'same' } })).rejects.toThrow('commit failed');
  });

  it.each([
    { permissions: ['employee_changes'], allowed: ['onboarding', 'resignation'] },
    { permissions: ['salary'], allowed: ['salary'] },
  ])('expands account-level %p permission to the correct progress business types', async ({ permissions, allowed }) => {
    const { service, auth, submissions } = fixture();
    auth.session.mockResolvedValue({ ...session, businessPermissions: permissions });

    await service.progress({ linkToken: token });

    expect(submissions.find.mock.calls[0][0].where.businessType.value).toEqual(allowed);
  });

  it('resolves an active Beilun administrator as the anonymous portal draft actor', async () => {
    const { service, query } = fixture();
    query.mockResolvedValue([{ id: '99999999-9999-4999-8999-999999999999', username: 'portal-admin', real_name: '门户受理', business_scope: BusinessScope.BEILUN }]);
    const actor = await (service as any).getPortalActor();
    expect(actor).toMatchObject({ sub: '99999999-9999-4999-8999-999999999999', username: 'portal-admin', roles: ['admin'], businessScope: BusinessScope.BEILUN });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("u.business_scope = $1"), [BusinessScope.BEILUN]);
  });

  it('allows a returned portal draft to be corrected and resubmitted in place', async () => {
    const { service, transaction, submissions, validation, ruleApplication } = fixture();
    const originalFields = { employee_name: '旧姓名', id_card_no: '110101199001011234', mobile: '13800138000', resignation_date: '2026-09-10', social_stop_month: '2026-10', resignation_reason: '个人辞职' };
    const row = Object.assign(new CustomerPortalSubmission(), { id: '33333333-3333-4333-8333-333333333333', customerId, accountId: session.account.id, businessType: 'resignation', requestId: 'original-request', inputHash: 'old-hash', requestNo: 'WO-RETURNED', workOrderId: '44444444-4444-4444-8444-444444444444', fields: originalFields, status: 'received' });
    const order: any = { id: row.workOrderId, customerId, orderType: OrderType.RESIGNATION, status: 'draft', submittedAt: null, businessScope: BusinessScope.BEILUN, extraData: { portal_review_status: 'needs_correction', portal_correction_reason: '请修正姓名', portal_correction_fields: ['employee_name'], portal_input_hash: 'old-hash' } };
    (submissions as any).findOne = jest.fn().mockResolvedValue(row);
    validation.validateRow.mockResolvedValue({ ok: true, normalized: { employee_name: '新姓名', id_card_no: '110101199001011234', mobile: '13800138000', resignation_date: '2026-09-10', social_stop_month: '2026-10', resignation_reason: '个人辞职' }, errors: [] });
    ruleApplication.resolve.mockResolvedValue({ defaults: {}, branch: null, missing: [] });
    const submissionRepo = { findOne: jest.fn().mockResolvedValue(row), save: jest.fn(async (value) => value) };
    const orderRepo = { findOne: jest.fn().mockResolvedValue(order), save: jest.fn(async (value) => value) };
    transaction.mockImplementation(async (operation) => operation({ query: jest.fn().mockResolvedValue([]), getRepository: (target: any) => target === CustomerPortalSubmission ? submissionRepo : orderRepo }));
    const result = await service.resubmit({ linkToken: token, businessType: 'resignation', submissionId: row.id, fields: row.fields });
    expect(result).toMatchObject({ workOrderId: row.workOrderId, requestNo: 'WO-RETURNED', status: 'received' });
    expect(row.inputHash).not.toBe('old-hash');
    expect(order.extraData.portal_review_status).toBe('pending_review');
    expect(order.extraData.portal_correction_reason).toBeNull();
    expect(submissionRepo.save).toHaveBeenCalled();
    expect(orderRepo.save).toHaveBeenCalled();
  });

  it('rejects changes to fields that were not returned for correction', async () => {
    const { service, transaction, submissions, validation, ruleApplication } = fixture();
    const row = Object.assign(new CustomerPortalSubmission(), { id: '55555555-5555-4555-8555-555555555555', customerId, accountId: session.account.id, businessType: 'resignation', requestId: 'original-request-2', inputHash: 'old-hash', requestNo: 'WO-RETURNED-2', workOrderId: '66666666-6666-4666-8666-666666666666', fields: { employee_name: '旧姓名', id_card_no: '110101199001011234', mobile: '13800138000', resignation_date: '2026-09-10', social_stop_month: '2026-10', resignation_reason: '个人辞职' }, status: 'received' });
    const order: any = { id: row.workOrderId, customerId, orderType: OrderType.RESIGNATION, status: 'draft', submittedAt: null, businessScope: BusinessScope.BEILUN, extraData: { portal_review_status: 'needs_correction', portal_correction_fields: ['employee_name'] } };
    (submissions as any).findOne = jest.fn().mockResolvedValue(row);
    validation.validateRow.mockResolvedValue({ ok: true, normalized: { employee_name: '新姓名', id_card_no: '110101199001011234', mobile: '13900139000', resignation_date: '2026-09-10', social_stop_month: '2026-10', resignation_reason: '个人辞职' }, errors: [] });
    const submissionRepo = { findOne: jest.fn().mockResolvedValue(row), save: jest.fn(async (value) => value) };
    const orderRepo = { findOne: jest.fn().mockResolvedValue(order), save: jest.fn(async (value) => value) };
    transaction.mockImplementation(async (operation) => operation({ query: jest.fn().mockResolvedValue([]), getRepository: (target: any) => target === CustomerPortalSubmission ? submissionRepo : orderRepo }));
    await expect(service.resubmit({ linkToken: token, businessType: 'resignation', submissionId: row.id, fields: row.fields })).rejects.toThrow('只能修改退回补正字段');
    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(ruleApplication.resolve).not.toHaveBeenCalled();
  });

  it('rejects internal customer portal management access from another business scope', async () => {
    const { service, customers } = fixture();
    const outOfProvinceUser = { sub: 'u1', username: 'u1', roles: ['admin'], businessScope: BusinessScope.OUT_OF_PROVINCE };
    await expect(service.listSalary(customerId, outOfProvinceUser as never)).rejects.toThrow('客户不存在');
    expect(customers.findOne).toHaveBeenCalledWith({ where: { id: customerId, businessScope: BusinessScope.OUT_OF_PROVINCE } });
  });
});

