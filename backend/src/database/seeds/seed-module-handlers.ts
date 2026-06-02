import { DataSource } from 'typeorm';
import { ModuleHandler, User } from 'src/entities';

const moduleHandlerSeeds: Array<{
  moduleCode: string;
  username: string;
  weight: number;
  isBackup: boolean;
}> = [
  // 合同模块：杨纯为主处理人，江璐为共享团队负责人/备份，可查看并代理全部合同类子单。
  { moduleCode: 'contract', username: 'yangchun', weight: 10, isBackup: false },
  { moduleCode: 'contract', username: 'jianglu', weight: 1, isBackup: true },
  { moduleCode: 'renewal_contract', username: 'yangchun', weight: 10, isBackup: false },
  { moduleCode: 'renewal_contract', username: 'jianglu', weight: 1, isBackup: true },

  // 入离职模块：毛雅妮为主处理人，江璐为共享团队负责人/备份，可查看并代理全部入离职类子单。
  { moduleCode: 'onboarding_contact', username: 'maoyani', weight: 10, isBackup: false },
  { moduleCode: 'onboarding_contact', username: 'jianglu', weight: 1, isBackup: true },
  { moduleCode: 'resignation_contact', username: 'maoyani', weight: 10, isBackup: false },
  { moduleCode: 'resignation_contact', username: 'jianglu', weight: 1, isBackup: true },
  { moduleCode: 'resignation_cert', username: 'maoyani', weight: 10, isBackup: false },
  { moduleCode: 'resignation_cert', username: 'jianglu', weight: 1, isBackup: true },

  // 数据录入模块：安娜珍。
  { moduleCode: 'data_entry', username: 'annazhen', weight: 10, isBackup: false },
];

const managedModules = Array.from(new Set(moduleHandlerSeeds.map((seed) => seed.moduleCode)));
const deprecatedModules = ['social_security'];

// 0602 业务最终口径：社保公积金办理（含入职/离职拆分）与待遇申报暂不绑定负责人，
// 负责人留空，不强行绑定付倩文/杨纯/江璐。任何遗留绑定都需置为 inactive，
// 保证后端不会把这些模块的可操作人权限分配给共享团队（含江璐）。
const vacatedModules = [
  'social_insurance',
  'onboarding_social_insurance',
  'resignation_social_insurance',
  'benefit_apply',
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

  // 0602 最终口径：社保公积金/待遇申报负责人留空。将任何遗留的处理人绑定置为 inactive，
  // 确保后端权限兜底不会把这些模块的可操作人权限发放给共享团队（含江璐）。
  await moduleHandlerRepo
    .createQueryBuilder()
    .update(ModuleHandler)
    .set({ isActive: false })
    .where('module_code IN (:...moduleCodes)', { moduleCodes: vacatedModules })
    .execute();
}
