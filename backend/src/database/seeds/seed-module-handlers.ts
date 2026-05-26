import { DataSource } from 'typeorm';
import { DispatchedOrder, ModuleHandler, User } from 'src/entities';

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

  // 社保公积金办理：由福利保障部傅倩雯负责，不再归共享团队处理。
  { moduleCode: 'social_insurance', username: 'fuqianwen', weight: 10, isBackup: false },

  // 福利/社保模块统一使用 benefit_apply，不再使用 social_security。
  { moduleCode: 'benefit_apply', username: 'yangchun', weight: 10, isBackup: false },
  { moduleCode: 'benefit_apply', username: 'jianglu', weight: 1, isBackup: true },

  // 数据录入模块：安娜珍。
  { moduleCode: 'data_entry', username: 'annazhen', weight: 10, isBackup: false },
];

const managedModules = Array.from(new Set(moduleHandlerSeeds.map((seed) => seed.moduleCode)));
const deprecatedModules = ['social_security'];

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

  const welfareOwner = await userRepo.findOne({ where: { username: 'fuqianwen' } });
  if (welfareOwner) {
    await dataSource.getRepository(DispatchedOrder)
      .createQueryBuilder()
      .update(DispatchedOrder)
      .set({ handlerId: welfareOwner.id })
      .where('module_code = :moduleCode', { moduleCode: 'social_insurance' })
      .andWhere('status IN (:...statuses)', { statuses: ['pending', 'processing', 'returned'] })
      .execute();
  }
}
