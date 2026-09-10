import { createHash } from 'node:crypto';
import { BusinessScope, Customer, CustomerAssignee, DispatchedOrder, OperationLog, OrderType, WorkOrder, WorkOrderStatus } from 'src/entities';
import { CustomerPortalSubmission } from 'src/entities/customer-portal-submission.entity';
import { PortalReviewService } from 'src/modules/customer-portal/portal-review.service';

const customerId='11111111-1111-4111-8111-111111111111';
const user={sub:'reviewer',username:'reviewer',roles:['biz_member'],businessScope:BusinessScope.BEILUN};
function fixture(){
  const submission={id:'submission',customerId,accountId:'account',requestId:'request',inputHash:'hash',businessType:'onboarding',workOrderId:'order'};
  const order={id:'order',customerId,orderType:OrderType.ONBOARDING,status:WorkOrderStatus.DRAFT,createdBy:'system',submittedAt:null,extraData:{portal_intake_key:createHash('sha256').update(JSON.stringify([customerId,'account','request'])).digest('hex'),portal_input_hash:'hash'} as Record<string,unknown>};
  const save=jest.fn(async value=>value),log=jest.fn(async value=>value),query=jest.fn();
  const repos=new Map<unknown,unknown>([
    [Customer,{findOne:jest.fn(async()=>({id:customerId}))}],
    [CustomerAssignee,{findOne:jest.fn(async()=>({userId:user.sub}))}],
    [CustomerPortalSubmission,{findOne:jest.fn(async()=>submission)}],
    [WorkOrder,{findOne:jest.fn(async()=>order),save}],
    [DispatchedOrder,{count:jest.fn(async()=>0)}],
    [OperationLog,{create:(value:unknown)=>value,save:log}],
  ]);
  const getRepository=(entity:unknown)=>repos.get(entity);
  const dataSource={getRepository,transaction:jest.fn(async operation=>operation({getRepository,query}))};
  const service=new PortalReviewService(dataSource as never,{resolveDepartmentId:jest.fn(async()=> 'department')} as never);
  return {service,order,submission,save,log,repos,query};
}
describe('Portal draft review ownership',()=>{
  it('claims a verified draft for a configured business assignee and audits the system creator',async()=>{
    const {service,order,save,log,query}=fixture();
    await expect(service.claim(customerId,'submission',user)).resolves.toEqual({workOrderId:'order'});
    expect(order.createdBy).toBe('reviewer');expect(order.extraData.portal_reviewed_by).toBe('reviewer');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'),['work_order:submit:order']);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({beforeData:{createdBy:'system'},actionType:'portal_review_claim'}));
    await service.claim(customerId,'submission',user);expect(save).toHaveBeenCalledTimes(1);
  });
  it('does not give unassigned staff or backend roles access',async()=>{
    const {service,repos,save}=fixture();
    (repos.get(CustomerAssignee) as {findOne:jest.Mock}).findOne.mockResolvedValue(null);
    await expect(service.claim(customerId,'submission',user)).rejects.toThrow('已配置的业务员');
    await expect(service.claim(customerId,'submission',{...user,roles:['social_insurance_specialist']})).rejects.toThrow('无增减员审核权限');
    expect(save).not.toHaveBeenCalled();
  });
  it.each(['submitted','wrongSource','otherReviewer','existingChild'])('protects %s records',async scenario=>{
    const {service,order,repos,save}=fixture();
    if(scenario==='submitted')order.status=WorkOrderStatus.PROCESSING;
    if(scenario==='wrongSource')order.extraData.portal_input_hash='other';
    if(scenario==='otherReviewer')order.extraData.portal_reviewed_by='other';
    if(scenario==='existingChild')(repos.get(DispatchedOrder) as {count:jest.Mock}).count.mockResolvedValue(1);
    await expect(service.claim(customerId,'submission',user)).rejects.toThrow();expect(save).not.toHaveBeenCalled();
  });
});
