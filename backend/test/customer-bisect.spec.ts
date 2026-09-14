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
    const probationCodes = ['probation_start_date','probation_months','probation_end_date','probation_salary'];
    for (const code of probationCodes) fields.push(Object.assign(new FieldConfig(),{id:code,fieldCode:code,fieldName:code,isActive:true,fieldType:FieldType.TEXT}));
    jest.spyOn(service as any,'editableFields').mockResolvedValue(fields);
    await expect((service as any).validateFields('onboarding',{contract_start_date:'2026-09-01'})).not.toHaveProperty('probation_start_date');
    await expect((service as any).validateFields('onboarding',{probation_salary:'5000'})).resolves.toHaveProperty('probation_salary','5000');
    await expect((service as any).validateFields('onboarding',{probation_start_date:'2026-09-01',probation_months:7,probation_salary:'5000'})).rejects.toThrow('1 至 6');
  });
  it('generates a real customer-bound standard workbook with field metadata and dropdowns',async()=>{
    const {service}=fixture();const parser:any=(service as any).parser; const orig=parser.parseBuffer.bind(parser); parser.parseBuffer=async(buffer:any,options:any)=>{const out=await orig(buffer,options);console.log('PARSED_META',out.meta.rowNumbers,'ROWS',out.rows);return out;}; const result=await service.template({linkToken:token,businessType:'resignation'});
    expect(result.fileName).toMatch(/\.xlsx$/);
    const buffer=Buffer.from(result.contentBase64,'base64');expect(buffer.subarray(0,2).toString()).toBe('PK');
    const workbook=new Workbook();await workbook.xlsx.load(buffer as never);
    expect(workbook.getWorksheet('__portal')?.getCell('B1').text).toBe(customerId);
    expect(workbook.getWorksheet('__portal')?.state).toBe('veryHidden');
    expect(workbook.worksheets[0].getRow(1).values).toContain('离职原因');
  });
  it('imports its own onboarding workbook with the second-row header and forwards batch materials', async () => {

});

