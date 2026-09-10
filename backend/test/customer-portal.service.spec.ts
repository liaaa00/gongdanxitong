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
  const fieldDefinitions=[['employee_name','员工姓名'],['id_card_no','证件号码'],['mobile','移动电话'],['email','电子邮件'],['resignation_date','离职日期'],['social_stop_month','社保公积金停保月'],['resignation_reason','离职原因']];
  const fields=fieldDefinitions.map(([fieldCode,fieldName])=>Object.assign(new FieldConfig(),{id:fieldCode,fieldCode,fieldName,fieldType:fieldCode==='resignation_reason'?FieldType.DROPDOWN:FieldType.TEXT,isActive:true,isRequired:false,defaultRequired:false,conditionalRequired:null,dropdownOptions:fieldCode==='resignation_reason'?['个人辞职','公司解聘']:null,orderType:OrderType.RESIGNATION,displayOrder:1}));
  const auth={session:jest.fn().mockResolvedValue(session)};
  const templateConfig={list:jest.fn().mockResolvedValue([])};
  const submissions={find:jest.fn().mockResolvedValue([])};
  const customers={findOne:jest.fn().mockImplementation(async ({ where }) => where.businessScope === 'beilun' ? { id: customerId, businessScope: 'beilun' } : null)};
  const validation={validateRow:jest.fn().mockImplementation(async({raw})=>({ok:true,normalized:raw,errors:[]}))};
  const transaction=jest.fn();
  const query=jest.fn();
  const rules={findOne:jest.fn().mockResolvedValue(null)};
  const service=new CustomerPortalService(auth as never,{transaction,query} as never,submissions as never,rules as never,customers as never,{find:jest.fn().mockResolvedValue(fields)} as never,{} as never,{} as never,{} as never,new ImportTemplateService(templateConfig as never),templateConfig as never,validation as never,new ExcelParserService(),{} as never);
  return {service,auth,submissions,transaction,query,fields,customers};
}

describe('Customer portal authoritative business boundary',()=>{
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
    const {service}=fixture();const result=await service.template({linkToken:token,businessType:'resignation'});
    expect(result.fileName).toMatch(/\.xlsx$/);
    const buffer=Buffer.from(result.contentBase64,'base64');expect(buffer.subarray(0,2).toString()).toBe('PK');
    const workbook=new Workbook();await workbook.xlsx.load(buffer as never);
    expect(workbook.getWorksheet('__portal')?.getCell('B1').text).toBe(customerId);
    expect(workbook.getWorksheet('__portal')?.state).toBe('veryHidden');
    expect(workbook.worksheets[0].getRow(1).values).toContain('离职原因');
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

  it('rejects internal customer portal management access from another business scope', async () => {
    const { service, customers } = fixture();
    const outOfProvinceUser = { sub: 'u1', username: 'u1', roles: ['admin'], businessScope: BusinessScope.OUT_OF_PROVINCE };
    await expect(service.listSalary(customerId, outOfProvinceUser as never)).rejects.toThrow('客户不存在');
    expect(customers.findOne).toHaveBeenCalledWith({ where: { id: customerId, businessScope: BusinessScope.OUT_OF_PROVINCE } });
  });
});
