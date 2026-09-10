import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager, IsNull, Not } from 'typeorm';
import { Branch, BusinessScope, Customer, CustomerPortalRule, OperationLog, OrderType, WorkOrder, WorkOrderStatus } from 'src/entities';
import { CustomerPortalSubmission } from 'src/entities/customer-portal-submission.entity';
import { JwtUserPayload } from '../auth/auth.types';

const isBlank = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && !value.trim());

/** Applies only explicitly configured customer/location associations. */
@Injectable()
export class PortalRuleApplicationService {
  constructor(private readonly dataSource: DataSource) {}

  async resolve(rule: CustomerPortalRule | null, customerId: string, business: 'onboarding' | 'resignation', location: unknown, manager: EntityManager = this.dataSource.manager) {
    const active = rule?.isActive ? rule : null;
    const matches = (active?.paymentLocationRules ?? []).filter((item) => item.socialLocation === String(location ?? '').trim());
    const mapping = matches.length === 1 ? matches[0] : undefined;
    const branch = mapping ? await manager.getRepository(Branch).findOne({ where: { id: mapping.branchId, customerId, businessScope: BusinessScope.BEILUN, isActive: true } }) : null;
    const defaults: Record<string, string | number | boolean> = {
      ...(business === 'onboarding' ? active?.onboardingDefaults : active?.resignationDefaults),
      ...(branch ? (business === 'onboarding' ? mapping?.onboardingDefaults : mapping?.resignationDefaults) : {}),
    };
    // The ratio is selected by the customer against the official location list.
    delete defaults.fund_ratio;
    if (!branch) {
      delete defaults.contract_subject;
      delete defaults.company_address;
    }
    const missing: string[] = [];
    if (!active) missing.push('客户办理规则');
    if (!branch) missing.push('缴纳地对应商社');
    if (business === 'onboarding' && isBlank(defaults.employee_type)) missing.push('员工类型');
    if (business === 'resignation' && Object.keys(defaults).length === 0) missing.push('离职规则');
    return { defaults, branch, missing };
  }

  async syncPending(customerId: string, user: JwtUserPayload) {
    const customer = await this.dataSource.getRepository(Customer).findOne({ where: { id: customerId, businessScope: BusinessScope.BEILUN, isActive: true } });
    if (!customer) throw new NotFoundException('客户不存在');
    const submissions = await this.dataSource.getRepository(CustomerPortalSubmission).find({ where: { customerId, workOrderId: Not(IsNull()) }, order: { createdAt: 'ASC' } });
    const results: Array<{ workOrderId: string; requestNo: string; status: 'updated' | 'skipped' | 'failed'; message: string; fields?: string[] }> = [];
    for (const submission of submissions) {
      const identity = { workOrderId: submission.workOrderId!, requestNo: submission.requestNo };
      if (submission.businessType === 'salary') continue;
      try {
        const result = await this.dataSource.transaction(async (manager) => {
          await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`work_order:submit:${submission.workOrderId}`]);
          const repo = manager.getRepository(WorkOrder);
          const order = await repo.findOne({ where: { id: submission.workOrderId!, customerId }, lock: { mode: 'pessimistic_write' } });
          const key = createHash('sha256').update(JSON.stringify([customerId, submission.accountId, submission.requestId])).digest('hex');
          if (!order || order.status !== WorkOrderStatus.DRAFT || order.submittedAt || order.orderType !== submission.businessType
            || order.extraData?.portal_intake_key !== key || order.extraData?.portal_input_hash !== submission.inputHash) {
            return { ...identity, status: 'skipped' as const, message: '仅补齐本客户尚未提交的门户草稿' };
          }
          const rule = await manager.getRepository(CustomerPortalRule).findOne({ where: { customerId, isActive: true } });
          const resolved = await this.resolve(rule, customerId, submission.businessType as 'onboarding' | 'resignation', order.extraData.social_location, manager);
          const next = { ...order.extraData };
          const changed: string[] = [];
          for (const [field, value] of Object.entries(resolved.defaults)) {
            if (isBlank(next[field]) && !isBlank(value)) { next[field] = value; changed.push(field); }
          }
          // A manually chosen branch wins, just like manually entered field values.
          let branchId = order.branchId;
          let branchCode = order.branchCode;
          if (!branchId && isBlank(branchCode) && resolved.branch) {
            branchId = resolved.branch.id; branchCode = resolved.branch.branchCode;
            next.branchId = branchId; next.branch_code = branchCode;
            changed.push('branchId', 'branch_code');
          }
          const missing = resolved.missing.filter((field) => field !== '员工类型' || isBlank(next.employee_type));
          if (next.portal_configuration_pending !== (missing.length > 0) || JSON.stringify(next.portal_configuration_missing) !== JSON.stringify(missing)) {
            next.portal_configuration_pending = missing.length > 0; next.portal_configuration_missing = missing;
            changed.push('portal_configuration_pending');
          }
          if (!changed.length) return { ...identity, status: 'skipped' as const, message: '已有填写优先，没有可补齐的空项' };
          // Compare the original row too: concurrent staff edits must never be overwritten.
          const update = await repo.createQueryBuilder().update(WorkOrder).set({ extraData: () => 'CAST(:next AS jsonb)', branchId, branchCode, lastModifiedAt: new Date(), lastModifiedBy: user.sub })
            .where('id = :id AND status = :status AND submitted_at IS NULL AND extra_data = CAST(:original AS jsonb)', { id: order.id, status: WorkOrderStatus.DRAFT, original: JSON.stringify(order.extraData), next: JSON.stringify(next) }).execute();
          if (update.affected !== 1) return { ...identity, status: 'skipped' as const, message: '草稿已被其他操作更新，请刷新后重试' };
          const logs = manager.getRepository(OperationLog);
          await logs.save(logs.create({ entityType: 'work_order', entityId: order.id, userId: user.sub, actionType: 'portal_rule_fill', beforeData: null, afterData: { fields: changed, customerId }, ipAddress: null }));
          return { ...identity, status: 'updated' as const, fields: changed, message: missing.length ? `已补齐空项，仍需配置：${missing.join('、')}` : '已补齐，待内部审核；人工填写保持不变' };
        });
        results.push(result);
      } catch (error) {
        results.push({ ...identity, status: 'failed', message: error instanceof Error ? error.message : '补齐失败' });
      }
    }
    return { total: results.length, updatedCount: results.filter((row) => row.status === 'updated').length, skippedCount: results.filter((row) => row.status === 'skipped').length, failedCount: results.filter((row) => row.status === 'failed').length, results };
  }
}
