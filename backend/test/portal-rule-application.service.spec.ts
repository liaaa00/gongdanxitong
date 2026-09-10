import { createHash } from 'node:crypto';
import { Branch, BusinessScope, Customer, CustomerPortalRule, OperationLog, OrderType, WorkOrder, WorkOrderStatus } from 'src/entities';
import { CustomerPortalSubmission } from 'src/entities/customer-portal-submission.entity';
import { PortalRuleApplicationService } from 'src/modules/customer-rules/portal-rule-application.service';

const customerId='11111111-1111-4111-8111-111111111111';
const branchId='22222222-2222-4222-8222-222222222222';
const user={sub:'staff',businessScope:BusinessScope.BEILUN,roles:['admin']};
const submission={customerId,workOrderId:'order',accountId:'account',requestId:'request',requestNo:'WO-TEST',inputHash:'hash',businessType:'onboarding'};
function fixture() {
  const rule=Object.assign(new CustomerPortalRule(), {isActive:true,customerId,onboardingDefaults:{employee_type:'正式员工',need_esign:true,contract_subject:'全局主体'},resignationDefaults:{need_resignation_cert:'否'},paymentLocationRules:[{socialLocation:'宁波',branchId,onboardingDefaults:{contract_subject:'宁波主体',payroll_date:'20'},resignationDefaults:{}}]});
  const order: WorkOrder=Object.assign(new WorkOrder(),{id:'order',customerId,status:WorkOrderStatus.DRAFT,submittedAt:null,orderType:OrderType.ONBOARDING,branchId:null,branchCode:null,extraData:{social_location:'宁波',portal_intake_key:createHash('sha256').update(JSON.stringify([customerId,submission.accountId,submission.requestId])).digest('hex'),portal_input_hash:'hash',portal_configuration_pending:true,contract_subject:'人工主体',need_esign:false}});
  const branches={findOne:jest.fn().mockResolvedValue({id:branchId,branchCode:'NB-001'})};
  const logs={create:jest.fn(value=>value),save:jest.fn()};
  const qb={update:jest.fn().mockReturnThis(),set:jest.fn().mockReturnThis(),where:jest.fn().mockReturnThis(),execute:jest.fn().mockResolvedValue({affected:1})};
  const orders={findOne:jest.fn().mockResolvedValue(order),createQueryBuilder:jest.fn().mockReturnValue(qb)};
  const repos=new Map<unknown,unknown>([[Customer,{findOne:jest.fn().mockResolvedValue({id:customerId})}],[CustomerPortalSubmission,{find:jest.fn().mockResolvedValue([submission])}],[WorkOrder,orders],[CustomerPortalRule,{findOne:jest.fn().mockResolvedValue(rule)}],[Branch,branches],[OperationLog,logs]]);
  const manager={getRepository:(entity:unknown)=>repos.get(entity),query:jest.fn()};
  const dataSource={...manager,manager,transaction:jest.fn(async(callback)=>callback(manager))};
  return {service:new PortalRuleApplicationService(dataSource as never),rule,order,branches,qb,logs};
}

describe('Portal draft rules and customer isolation',()=>{
  it('resolves only an exact configured location and a branch owned by that customer',async()=>{
    const {service,rule,branches}=fixture();
    expect(await service.resolve(rule,customerId,'onboarding','宁波')).toMatchObject({branch:{id:branchId},defaults:{contract_subject:'宁波主体'},missing:[]});
    expect(branches.findOne).toHaveBeenCalledWith({where:{id:branchId,customerId,businessScope:'beilun',isActive:true}});
    expect(await service.resolve(rule,customerId,'onboarding','宁波周边')).toMatchObject({branch:null,missing:['缴纳地对应商社']});
    branches.findOne.mockResolvedValue(null);
    expect(await service.resolve(rule,customerId,'onboarding','宁波')).toMatchObject({branch:null,missing:['缴纳地对应商社']});
  });
  it('does not use inactive rules, ambiguous mappings, or customer defaults to guess a fund ratio',async()=>{
    const {service,rule}=fixture();
    rule.onboardingDefaults.fund_ratio='5%+5%';
    expect((await service.resolve(rule,customerId,'onboarding','宁波')).defaults).not.toHaveProperty('fund_ratio');
    rule.paymentLocationRules.push({...rule.paymentLocationRules[0]});
    expect((await service.resolve(rule,customerId,'onboarding','宁波')).branch).toBeNull();
    rule.isActive=false;
    expect((await service.resolve(rule,customerId,'onboarding','宁波')).defaults).toEqual({});
  });
  it('fills blanks while retaining manual false and text; uses a guarded update and an audit of field names',async()=>{
    const {service,qb,logs}=fixture();
    const result=await service.syncPending(customerId,user as never);
    expect(result.updatedCount).toBe(1);
    const params=qb.where.mock.calls[0][1];
    expect(JSON.parse(params.next)).toMatchObject({contract_subject:'人工主体',need_esign:false,payroll_date:'20',employee_type:'正式员工',portal_configuration_pending:false,branch_code:'NB-001'});
    expect(qb.where.mock.calls[0][0]).toContain('extra_data = CAST(:original AS jsonb)');
    expect(logs.save).toHaveBeenCalledWith(expect.objectContaining({actionType:'portal_rule_fill',afterData:expect.objectContaining({fields:expect.any(Array)})}));
    expect(logs.save.mock.calls[0][0].afterData).not.toHaveProperty('extraData');
  });
  it.each([WorkOrderStatus.PENDING,WorkOrderStatus.PROCESSING,WorkOrderStatus.COMPLETED,WorkOrderStatus.RETURNED,WorkOrderStatus.WITHDRAWN])('does not rewrite %s orders',async(status)=>{
    const {service,order,qb}=fixture();order.status=status;
    expect((await service.syncPending(customerId,user as never)).skippedCount).toBe(1);
    expect(qb.execute).not.toHaveBeenCalled();
  });
  it('refuses a draft whose submission proof or original input hash does not match',async()=>{
    const {service,order,qb}=fixture();order.extraData.portal_intake_key='another-customer';
    expect((await service.syncPending(customerId,user as never)).skippedCount).toBe(1);
    expect(qb.execute).not.toHaveBeenCalled();
  });
  it('retains a manually selected branch and reports a concurrent edit without overwriting it',async()=>{
    const {service,order,qb,logs}=fixture();order.branchId='manual';order.branchCode='MANUAL';
    qb.execute.mockResolvedValue({affected:0});
    expect((await service.syncPending(customerId,user as never)).skippedCount).toBe(1);
    expect(qb.set).toHaveBeenCalledWith(expect.objectContaining({branchId:'manual',branchCode:'MANUAL'}));
    expect(logs.save).not.toHaveBeenCalled();
  });
});
