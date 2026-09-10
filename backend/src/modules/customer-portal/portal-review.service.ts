import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, In, IsNull, Not } from 'typeorm';
import { hasAnyRole, isAdminRole, WORK_ORDER_CREATOR_ROLES } from 'src/common/auth/role-permissions';
import { BusinessScope, Customer, CustomerAssignee, DispatchedOrder, OperationLog, WorkOrder, WorkOrderStatus } from 'src/entities';
import { CustomerPortalSubmission } from 'src/entities/customer-portal-submission.entity';
import { JwtUserPayload } from '../auth/auth.types';
import { WorkOrderValidationService } from '../work-orders/work-order-validation.service';

/** Claims only an authenticated portal intake. Normal orders keep their existing owner/data scope. */
@Injectable()
export class PortalReviewService {
  constructor(private readonly dataSource: DataSource, private readonly validation: WorkOrderValidationService) {}

  private async assertAccess(customerId: string, user: JwtUserPayload) {
    if (!hasAnyRole(user.roles, WORK_ORDER_CREATOR_ROLES) || (user.businessScope && user.businessScope !== BusinessScope.BEILUN)) {
      throw new ForbiddenException('当前账号无增减员审核权限');
    }
    const customer = await this.dataSource.getRepository(Customer).findOne({ where: { id: customerId, businessScope: BusinessScope.BEILUN, isActive: true } });
    if (!customer) throw new NotFoundException('客户不存在');
    if (!isAdminRole(user.roles)) {
      const assignment = await this.dataSource.getRepository(CustomerAssignee).findOne({ where: { customerId, userId: user.sub, businessScope: BusinessScope.BEILUN, isActive: true } });
      if (!assignment) throw new ForbiddenException('请由该客户已配置的业务员审核');
    }
  }

  async list(customerId: string, user: JwtUserPayload) {
    await this.assertAccess(customerId, user);
    const rows = await this.dataSource.getRepository(CustomerPortalSubmission).find({ where: { customerId, businessType: In(['onboarding', 'resignation']), workOrderId: Not(IsNull()) }, order: { createdAt: 'DESC' }, take: 200 });
    const orders = rows.length ? await this.dataSource.getRepository(WorkOrder).find({ where: { customerId, id: In(rows.map(row => row.workOrderId!)), businessScope: BusinessScope.BEILUN } }) : [];
    return rows.map(row => {
      const order = orders.find(item => item.id === row.workOrderId);
      const claimedBy = order?.extraData.portal_reviewed_by;
      return { id: row.id, requestNo: row.requestNo, businessType: row.businessType, workOrderId: order?.id ?? null,
        createdAt: row.createdAt, status: order?.status ?? 'missing',
        configurationMissing: order?.extraData.portal_configuration_missing ?? [],
        canClaim: order?.status === WorkOrderStatus.DRAFT && !order.submittedAt && (!claimedBy || claimedBy === user.sub),
        canReview: claimedBy === user.sub && order?.createdBy === user.sub && order?.status === WorkOrderStatus.DRAFT,
        originalStopMonth: row.businessType === 'resignation' ? String(row.fields.social_stop_month ?? '') : null };
    });
  }

  async claim(customerId: string, submissionId: string, user: JwtUserPayload) {
    await this.assertAccess(customerId, user);
    const submission = await this.dataSource.getRepository(CustomerPortalSubmission).findOne({ where: { id: submissionId, customerId } });
    if (!submission?.workOrderId || submission.businessType === 'salary') throw new NotFoundException('增减员受理记录不存在');
    const departmentId = await this.validation.resolveDepartmentId(undefined, user.sub);
    return this.dataSource.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`work_order:submit:${submission.workOrderId}`]);
      const repo = manager.getRepository(WorkOrder);
      const order = await repo.findOne({ where: { id: submission.workOrderId!, customerId, businessScope: BusinessScope.BEILUN }, lock: { mode: 'pessimistic_write' } });
      const key = createHash('sha256').update(JSON.stringify([customerId, submission.accountId, submission.requestId])).digest('hex');
      if (!order || order.orderType !== submission.businessType || order.extraData.portal_intake_key !== key || order.extraData.portal_input_hash !== submission.inputHash) throw new BadRequestException('受理记录与工单来源不匹配');
      if (order.status !== WorkOrderStatus.DRAFT || order.submittedAt || await manager.getRepository(DispatchedOrder).count({ where: { parentOrderId: order.id } })) throw new ConflictException('只允许认领尚未提交的门户草稿');
      if (order.extraData.portal_reviewed_by) {
        if (order.extraData.portal_reviewed_by !== user.sub || order.createdBy !== user.sub) throw new ConflictException('该资料已由其他业务员认领');
        return { workOrderId: order.id };
      }
      const previousCreator = order.createdBy;
      order.createdBy = user.sub; order.departmentId = departmentId;
      order.extraData = { ...order.extraData, portal_reviewed_by: user.sub };
      await repo.save(order);
      const logs = manager.getRepository(OperationLog);
      await logs.save(logs.create({ entityType: 'work_order', entityId: order.id, userId: user.sub, actionType: 'portal_review_claim', beforeData: { createdBy: previousCreator }, afterData: { createdBy: user.sub, submissionId }, ipAddress: null }));
      return { workOrderId: order.id };
    });
  }
}
