import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, In, IsNull, Not } from 'typeorm';
import { hasAnyRole, hasManagementScopeRole, isAdminRole, WORK_ORDER_CREATOR_ROLES } from 'src/common/auth/role-permissions';
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

  private assertWorkbenchAccess(user: JwtUserPayload) {
    if (!(hasAnyRole(user.roles, WORK_ORDER_CREATOR_ROLES) || hasManagementScopeRole(user.roles)) || (user.businessScope && user.businessScope !== BusinessScope.BEILUN)) {
      throw new ForbiddenException('当前账号无增减员审核权限');
    }
  }

  /** Cross-customer review list. Customer assignees see only their assigned customers; administrators and business owners see all active customers read-only. */
  async listWorkbench(user: JwtUserPayload, query: {
    customerId?: string;
    businessType?: 'onboarding' | 'resignation';
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    this.assertWorkbenchAccess(user);
    const customerRepo = this.dataSource.getRepository(Customer);
    let customerIds: string[];
    // 管理员和业务负责人可以查看本业务范围全部客户，但保持只读；
    // 业务员/业务组长仍只显示 customer_assignees 中绑定的客户。
    if (isAdminRole(user.roles) || hasManagementScopeRole(user.roles)) {
      customerIds = (await customerRepo.find({ where: { businessScope: BusinessScope.BEILUN, isActive: true }, select: ['id'] })).map((item) => item.id);
    } else {
      customerIds = (await this.dataSource.getRepository(CustomerAssignee).find({ where: { userId: user.sub, businessScope: BusinessScope.BEILUN, isActive: true }, select: ['customerId'] })).map((item) => item.customerId);
    }
    if (query.customerId) customerIds = customerIds.filter((id) => id === query.customerId);
    if (!customerIds.length) return { items: [], total: 0, page: Math.max(1, Number(query.page) || 1), pageSize: Math.min(100, Math.max(1, Number(query.pageSize) || 20)) };

    const customers = await customerRepo.find({ where: { id: In(customerIds), businessScope: BusinessScope.BEILUN, isActive: true } });
    const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
    const submissionRepo = this.dataSource.getRepository(CustomerPortalSubmission);
    const submissions = await submissionRepo.find({
      where: { customerId: In(customerIds), businessType: query.businessType ? query.businessType : In(['onboarding', 'resignation']), workOrderId: Not(IsNull()) },
      order: { createdAt: 'DESC' },
      take: 1000,
    });
    const orderIds = submissions.flatMap((submission) => submission.workOrderId ? [submission.workOrderId] : []);
    const orders = orderIds.length ? await this.dataSource.getRepository(WorkOrder).find({ where: { id: In(orderIds), businessScope: BusinessScope.BEILUN } }) : [];
    const orderMap = new Map(orders.map((order) => [order.id, order]));
    const keyword = String(query.search ?? '').trim().toLowerCase();
    const canWriteReview = hasAnyRole(user.roles, WORK_ORDER_CREATOR_ROLES);
    const filtered = submissions.map((submission) => {
      const order = submission.workOrderId ? orderMap.get(submission.workOrderId) : undefined;
      const extraData = order?.extraData ?? {};
      const customer = customerMap.get(submission.customerId);
      const reviewStatus = String(extraData.portal_review_status ?? (order?.status === WorkOrderStatus.DRAFT ? 'pending_review' : order?.status ?? 'missing'));
      return {
        id: submission.id,
        requestNo: submission.requestNo,
        customerId: submission.customerId,
        customerName: customer?.customerName ?? order?.customerName ?? String(extraData.customer_name ?? ''),
        customerCode: customer?.customerCode ?? order?.customerCode ?? String(extraData.customer_code ?? ''),
        businessType: submission.businessType,
        workOrderId: order?.id ?? null,
        employeeName: order?.employeeName ?? String(extraData.employee_name ?? ''),
        employeeIdCard: order?.employeeIdCard ?? String(extraData.id_card_no ?? ''),
        createdAt: submission.createdAt,
        status: order?.status ?? 'missing',
        reviewStatus,
        configurationMissing: Array.isArray(extraData.portal_configuration_missing) ? extraData.portal_configuration_missing : [],
        correctionReason: String(extraData.portal_correction_reason ?? ''),
        correctionFields: Array.isArray(extraData.portal_correction_fields) ? extraData.portal_correction_fields : [],
        claimedBy: String(extraData.portal_reviewed_by ?? ''),
        canClaim: canWriteReview && order?.status === WorkOrderStatus.DRAFT && !order.submittedAt && (!extraData.portal_reviewed_by || extraData.portal_reviewed_by === user.sub),
        canReview: canWriteReview && extraData.portal_reviewed_by === user.sub && order?.createdBy === user.sub && order?.status === WorkOrderStatus.DRAFT,
        originalStopMonth: submission.businessType === 'resignation' ? String(submission.fields.social_stop_month ?? '') : null,
      };
    }).filter((row) => {
      if (query.status && row.reviewStatus !== query.status && row.status !== query.status) return false;
      if (!keyword) return true;
      return [row.requestNo, row.customerName, row.customerCode, row.employeeName, row.employeeIdCard].some((value) => String(value).toLowerCase().includes(keyword));
    });
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize };
  }

  async requestCorrection(customerId: string, submissionId: string, payload: { reason: string; fields?: string[] }, user: JwtUserPayload) {
    await this.assertAccess(customerId, user);
    const reason = String(payload.reason ?? '').trim();
    if (!reason) throw new BadRequestException('请填写退回原因');
    const correctionFields = Array.isArray(payload.fields)
      ? [...new Set(payload.fields.map((field) => String(field ?? '').trim()).filter(Boolean))].slice(0, 100)
      : [];
    if (!correctionFields.length) throw new BadRequestException('请至少指定一个待补字段');
    const submission = await this.dataSource.getRepository(CustomerPortalSubmission).findOne({ where: { id: submissionId, customerId } });
    if (!submission?.workOrderId || submission.businessType === 'salary') throw new NotFoundException('增减员受理记录不存在');
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`work_order:submit:${submission.workOrderId}`]);
      const repo = manager.getRepository(WorkOrder);
      const order = await repo.findOne({ where: { id: submission.workOrderId!, customerId, businessScope: BusinessScope.BEILUN }, lock: { mode: 'pessimistic_write' } });
      const key = createHash('sha256').update(JSON.stringify([customerId, submission.accountId, submission.requestId])).digest('hex');
      if (!order || order.orderType !== submission.businessType || order.extraData.portal_intake_key !== key || order.extraData.portal_input_hash !== submission.inputHash) throw new BadRequestException('受理记录与工单来源不匹配');
      if (![WorkOrderStatus.DRAFT, WorkOrderStatus.RETURNED].includes(order.status) || order.submittedAt || await manager.getRepository(DispatchedOrder).count({ where: { parentOrderId: order.id } })) {
        throw new ConflictException('只有尚未派发的门户草稿可以退回补正');
      }
      const before = { ...order.extraData, status: order.status, createdBy: order.createdBy };
      const originalCreator = String(order.extraData.portal_original_created_by ?? order.createdBy);
      order.createdBy = originalCreator;
      order.extraData = {
        ...order.extraData,
        portal_review_status: 'needs_correction',
        portal_correction_reason: reason,
        portal_correction_fields: correctionFields,
        portal_reviewed_by: null,
      };
      await repo.save(order);
      const logs = manager.getRepository(OperationLog);
      await logs.save(logs.create({ entityType: 'work_order', entityId: order.id, userId: user.sub, actionType: 'portal_review_return', beforeData: before, afterData: { status: order.status, reason, fields: order.extraData.portal_correction_fields }, ipAddress: null }));
      return { workOrderId: order.id, reviewStatus: 'needs_correction' };
    });
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
      order.extraData = { ...order.extraData, portal_reviewed_by: user.sub, portal_original_created_by: order.extraData.portal_original_created_by ?? previousCreator, portal_review_status: 'in_review', portal_correction_reason: null, portal_correction_fields: [] };
      await repo.save(order);
      const logs = manager.getRepository(OperationLog);
      await logs.save(logs.create({ entityType: 'work_order', entityId: order.id, userId: user.sub, actionType: 'portal_review_claim', beforeData: { createdBy: previousCreator }, afterData: { createdBy: user.sub, submissionId }, ipAddress: null }));
      return { workOrderId: order.id };
    });
  }
}
