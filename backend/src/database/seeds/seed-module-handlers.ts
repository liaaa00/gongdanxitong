import { DataSource } from 'typeorm';
import { BusinessScope, ModuleHandler, User } from 'src/entities';

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

  // 在职证明改走 9 名福保专员的省市映射，不再保留固定人员。

  // 离职证明共同池：江璐、杨纯均可看到未认领工单，先接单者锁定办理。
  { moduleCode: 'resignation_cert', username: 'yangchun', weight: 10, isBackup: false },
  { moduleCode: 'resignation_cert', username: 'jianglu', weight: 10, isBackup: false },

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
const strictlyManagedModules = ['resignation_cert', 'in_service_certificate'];
const deprecatedModules = [
  'social_security',
  'onboarding_social_insurance',
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

    const businessScope = user.businessScope ?? BusinessScope.BEILUN;
    activeHandlerKeys.add(`${seed.moduleCode}:${user.id}:${businessScope}`);
    const existed = await moduleHandlerRepo.findOne({ where: { moduleCode: seed.moduleCode, handlerId: user.id, businessScope } });
    if (existed) {
      if (existed.weight !== seed.weight || existed.isBackup !== seed.isBackup || !existed.isActive) {
        existed.weight = seed.weight;
        existed.isBackup = seed.isBackup;
        existed.isActive = true;
        await moduleHandlerRepo.save(existed);
      }
      continue;
    }

    await moduleHandlerRepo.save(moduleHandlerRepo.create({
      moduleCode: seed.moduleCode,
      handlerId: user.id,
      weight: seed.weight,
      isBackup: seed.isBackup,
      isActive: true,
      businessScope,
    }));
  }

  for (const moduleCode of strictlyManagedModules) {
    const rows = await moduleHandlerRepo.find({ where: { moduleCode, businessScope: BusinessScope.BEILUN } });
    for (const row of rows) {
      const shouldBeActive = activeHandlerKeys.has(`${moduleCode}:${row.handlerId}:${BusinessScope.BEILUN}`);
      if (row.isActive !== shouldBeActive) {
        row.isActive = shouldBeActive;
        await moduleHandlerRepo.save(row);
      }
    }
  }

  void managedModules;
  void deprecatedModules;
  // 其他模块保留后台人工调整；仅最新业务明确指定的证明模块做精确收敛。
}
