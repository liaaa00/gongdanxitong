import { DataSource } from 'typeorm';
import { DispatchRule, DispatchStrategy, OrderType } from 'src/entities';

const yesCondition = (field: string): Record<string, unknown> => ({
  op: 'AND',
  children: [{ field, op: 'EQ', value: '是' }],
});

const dispatchRuleSeeds: Array<{
  name: string;
  orderType: OrderType;
  triggerConditions: Record<string, unknown> | null;
  targetModule: string;
  strategy: DispatchStrategy;
  priority: number;
}> = [
  {
    name: 'onboarding-default-data-entry',
    orderType: OrderType.ONBOARDING,
    triggerConditions: null,
    targetModule: 'data_entry',
    strategy: DispatchStrategy.FIXED,
    priority: 10,
  },
  {
    name: 'onboarding-default-social-insurance',
    orderType: OrderType.ONBOARDING,
    triggerConditions: null,
    targetModule: 'social_insurance',
    strategy: DispatchStrategy.FIXED,
    priority: 20,
  },
  {
    name: 'onboarding-contact-when-needed',
    orderType: OrderType.ONBOARDING,
    triggerConditions: yesCondition('need_onboarding_contact'),
    targetModule: 'onboarding_contact',
    strategy: DispatchStrategy.FIXED,
    priority: 30,
  },
  {
    name: 'onboarding-contract-when-needed',
    orderType: OrderType.ONBOARDING,
    triggerConditions: yesCondition('need_company_contract'),
    targetModule: 'contract',
    strategy: DispatchStrategy.FIXED,
    priority: 40,
  },
  {
    name: 'renewal-default-contract',
    orderType: OrderType.RENEWAL,
    triggerConditions: null,
    targetModule: 'renewal_contract',
    strategy: DispatchStrategy.FIXED,
    priority: 10,
  },
  {
    name: 'resignation-default-contact',
    orderType: OrderType.RESIGNATION,
    triggerConditions: yesCondition('need_resignation_share'),
    targetModule: 'resignation_contact',
    strategy: DispatchStrategy.FIXED,
    priority: 10,
  },
  {
    name: 'resignation-default-data-entry',
    orderType: OrderType.RESIGNATION,
    triggerConditions: null,
    targetModule: 'data_entry_resign',
    strategy: DispatchStrategy.FIXED,
    priority: 20,
  },
  {
    name: 'resignation-default-social-insurance',
    orderType: OrderType.RESIGNATION,
    triggerConditions: null,
    targetModule: 'resignation_social_insurance',
    strategy: DispatchStrategy.FIXED,
    priority: 30,
  },
  {
    name: 'benefit-default-apply',
    orderType: OrderType.BENEFIT,
    triggerConditions: null,
    targetModule: 'benefit_apply',
    strategy: DispatchStrategy.FIXED,
    priority: 10,
  },
];

export async function seedDispatchRules(dataSource: DataSource): Promise<void> {
  const repository = dataSource.getRepository(DispatchRule);

  for (const seed of dispatchRuleSeeds) {
    const existed = await repository.findOne({ where: { ruleName: seed.name } });

    if (existed) {
      existed.orderType = seed.orderType;
      existed.triggerConditions = seed.triggerConditions;
      existed.targetModule = seed.targetModule;
      existed.dispatchStrategy = seed.strategy;
      existed.priority = seed.priority;
      existed.isActive = true;
      await repository.save(existed);
      continue;
    }

    await repository.save(
      repository.create({
        ruleName: seed.name,
        orderType: seed.orderType,
        triggerConditions: seed.triggerConditions,
        targetModule: seed.targetModule,
        dispatchStrategy: seed.strategy,
        priority: seed.priority,
        isActive: true,
      }),
    );
  }

  await repository
    .createQueryBuilder()
    .update(DispatchRule)
    .set({ isActive: false })
    .where('target_module = :moduleCode', { moduleCode: 'social_security' })
    .execute();

  // 第一期离职流程按会议口径固定生成：离职材料收集、减员报岗录入、社保公积金减员。
  // 旧的“是否需要离职证明”独立子单只保留历史兼容，不再参与自动派发，避免多生成一个离职材料子单。
  await repository
    .createQueryBuilder()
    .update(DispatchRule)
    .set({ isActive: false })
    .where('rule_name = :ruleName', { ruleName: 'resignation-cert-when-needed' })
    .execute();
}
