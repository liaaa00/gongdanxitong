import { DataSource } from 'typeorm';
import { ModuleHandler, User } from 'src/entities';

const moduleHandlerSeeds: Array<{
  moduleCode: string;
  username: string;
  weight: number;
  isBackup: boolean;
}> = [
  // 劳动合同：杨纯主办，江璐为共享负责人/备份；江璐可看到杨纯合同类合集。
  { moduleCode: 'contract', username: 'yangchun', weight: 10, isBackup: false },
  { moduleCode: 'contract', username: 'jianglu', weight: 1, isBackup: true },
  { moduleCode: 'renewal_contract', username: 'yangchun', weight: 10, isBackup: false },
  { moduleCode: 'renewal_contract', username: 'jianglu', weight: 1, isBackup: true },

  // 入离职联系/材料收集：毛雅妮主办，江璐为共享负责人/备份；江璐可看到毛雅妮联系类合集。
  { moduleCode: 'onboarding_contact', username: 'maoyani', weight: 10, isBackup: false },
  { moduleCode: 'onboarding_contact', username: 'jianglu', weight: 1, isBackup: true },
  { moduleCode: 'resignation_contact', username: 'maoyani', weight: 10, isBackup: false },
  { moduleCode: 'resignation_contact', username: 'jianglu', weight: 1, isBackup: true },

  // 报岗录入：安娜祯负责增员/减员报岗录入。
  { moduleCode: 'data_entry', username: 'annazhen', weight: 10, isBackup: false },
  { moduleCode: 'data_entry_resign', username: 'annazhen', weight: 10, isBackup: false },

  // 社保公积金：会议口径指定傅倩雯负责增员/减员；账号 username 仍为历史兼容拼音 fuqianwen，realName 为傅倩雯。
  { moduleCode: 'social_insurance', username: 'fuqianwen', weight: 10, isBackup: false },
  { moduleCode: 'resignation_social_insurance', username: 'fuqianwen', weight: 10, isBackup: false },
];

const managedModules = Array.from(new Set(moduleHandlerSeeds.map((seed) => seed.moduleCode)));
const deprecatedModules = [
  'social_security',
  'onboarding_social_insurance',
  'resignation_cert',
];

export async function seedModuleHandlers(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const moduleHandlerRepo = dataSource.getRepository(ModuleHandler);
  const activeHandlerKeys = new Set<string>();

  for (const seed of moduleHandlerSeeds) {
    const user = await userRepo.findOne({ where: { username: seed.username } });
    if (!user) {
      // 负责人账号可后续通过后台配置补充；缺失时不阻断 seed，子单将进入 handler_id=null 的模块池/待指派状态。
      continue;
    }

    activeHandlerKeys.add(`${seed.moduleCode}:${user.id}`);

    const existed = await moduleHandlerRepo.findOne({ where: { moduleCode: seed.moduleCode, handlerId: user.id } });

    if (existed) {
      existed.weight = seed.weight;
      existed.isBackup = seed.isBackup;
      existed.isActive = true;
      await moduleHandlerRepo.save(existed);
      continue;
    }

    await moduleHandlerRepo.save(moduleHandlerRepo.create({
      moduleCode: seed.moduleCode,
      handlerId: user.id,
      weight: seed.weight,
      isBackup: seed.isBackup,
      isActive: true,
    }));
  }

  const managedHandlers = await moduleHandlerRepo.find({ where: managedModules.map((moduleCode) => ({ moduleCode })) });
  for (const handler of managedHandlers) {
    if (activeHandlerKeys.has(`${handler.moduleCode}:${handler.handlerId}`)) continue;
    handler.isActive = false;
    await moduleHandlerRepo.save(handler);
  }

  await moduleHandlerRepo
    .createQueryBuilder()
    .update(ModuleHandler)
    .set({ isActive: false })
    .where('module_code IN (:...moduleCodes)', { moduleCodes: deprecatedModules })
    .execute();

  // 第一阶段在职模块后台配置可保留，但不把社保变更/待遇申报暴露给后道处理人。
  await moduleHandlerRepo
    .createQueryBuilder()
    .update(ModuleHandler)
    .set({ isActive: false })
    .where('module_code IN (:...moduleCodes)', { moduleCodes: ['benefit_apply', 'social_insurance_change'] })
    .execute();
}
