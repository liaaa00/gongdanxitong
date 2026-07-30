import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PROVINCES_27, isValidProvince } from 'src/common/constants/provinces';
import {
  DispatchModuleCode,
  ModuleHandler,
  ModuleType,
  OrderType,
  TeamRole,
  User,
} from 'src/entities';

export type ProvinceMappingSource = 'sheet4' | 'sheet5';

export interface ProvinceHandlerSeed {
  mappingSource: ProvinceMappingSource;
  moduleCode: DispatchModuleCode;
  moduleType: ModuleType;
  teamRole: TeamRole;
  province: string;
  handlerText: string;
  handlerUsernames: readonly string[];
  orderTypes?: readonly OrderType[];
  rowOrder: number;
  isActive: boolean;
}

const logger = new Logger('ProvinceHandlerSeed');

// 配置表：单项业务省份映射（5 个双人省份，前者主办、后者备选）
const SHEET4_MAPPING: Record<string, string> = {
  广东: 'chenli', 安徽: 'chenli', 黑龙江: 'yangyi', 重庆: 'daijunxiang',
  湖北: 'zhumin/daiminhua', 江西: 'fangzhiying', 云南: 'fangzhiying', 吉林: 'fangzhiying',
  江苏: 'hexiaoli/daijunxiang', 山西: 'qianzhuoyun/heyitian', 山东: 'yuzheng/heyitian',
  北京: 'xuxiaofen', 陕西: 'xuxiaofen', 辽宁: 'xuxiaofen', 天津: 'yangxiaohan',
  福建: 'yangxiaohan/yangjie', 上海: 'yangjie', 湖南: 'yangjie', 河南: 'yangjie',
  河北: 'yangyi', 贵州: 'yangyi', 四川: 'zhumin', 广西: 'zhumin',
  甘肃: 'fangzhiying', 新疆: 'heyitian', 宁夏: 'yangjie', 海南: 'zhumin',
};

// Sheet5: 省外派单映射（1个双人省份：福建）
const SHEET5_MAPPING: Record<string, string> = {
  广东: 'chenli', 安徽: 'chenli', 黑龙江: 'yangyi', 重庆: 'daijunxiang',
  湖北: 'zhumin', 江西: 'fangzhiying', 云南: 'fangzhiying', 吉林: 'fangzhiying',
  江苏: 'daijunxiang', 山西: 'heyitian', 山东: 'heyitian',
  北京: 'xuxiaofen', 陕西: 'xuxiaofen', 辽宁: 'xuxiaofen', 天津: 'yangxiaohan',
  福建: 'yangxiaohan/yangjie', 上海: 'yangjie', 湖南: 'yangjie', 河南: 'yangjie',
  河北: 'yangyi', 贵州: 'yangyi', 四川: 'zhumin', 广西: 'zhumin',
  甘肃: 'fangzhiying', 新疆: 'heyitian', 宁夏: 'yangjie', 海南: 'zhumin',
};

export const PROVINCE_HANDLER_SEEDS: readonly ProvinceHandlerSeed[] = [
  ...PROVINCES_27.map((province, index) => {
    const handlerText = SHEET4_MAPPING[province] ?? '';
    return {
      mappingSource: 'sheet4' as const,
      moduleCode: DispatchModuleCode.IN_SERVICE_SINGLE_BUSINESS,
      moduleType: ModuleType.IN_SERVICE,
      teamRole: TeamRole.IN_SERVICE,
      province,
      handlerText,
      handlerUsernames: parseHandlerUsernames(handlerText),
      rowOrder: index + 1,
      isActive: handlerText.trim().length > 0,
    };
  }),
  ...PROVINCES_27.map((province, index) => {
    const handlerText = SHEET5_MAPPING[province] ?? '';
    return {
      mappingSource: 'sheet5' as const,
      moduleCode: DispatchModuleCode.OUT_OF_PROVINCE_DISPATCH,
      moduleType: ModuleType.OUT_OF_PROVINCE,
      teamRole: TeamRole.OUT_OF_PROVINCE,
      province,
      handlerText,
      handlerUsernames: parseHandlerUsernames(handlerText),
      orderTypes: [
        OrderType.OUT_OF_PROVINCE_INCREASE,
        OrderType.OUT_OF_PROVINCE_DECREASE,
      ],
      rowOrder: index + 1,
      isActive: handlerText.trim().length > 0,
    };
  }),
];

export async function seedProvinceHandlers(dataSource: DataSource): Promise<void> {
  validateSheet(PROVINCE_HANDLER_SEEDS, 'sheet4');
  validateSheet(PROVINCE_HANDLER_SEEDS, 'sheet5');
  const activeRows = PROVINCE_HANDLER_SEEDS.filter((row) => row.isActive);

  const userRepository = dataSource.getRepository(User);
  const moduleHandlerRepository = dataSource.getRepository(ModuleHandler);

  for (const row of activeRows.sort((left, right) =>
    left.mappingSource.localeCompare(right.mappingSource) || left.rowOrder - right.rowOrder)) {
    const namespacedModuleCode = `${row.moduleCode}__${row.province}`;
    for (const [index, username] of row.handlerUsernames.entries()) {
      const handler = await userRepository.findOne({ where: { username, isActive: true } });
      if (!handler) {
        logger.warn({
          mappingSource: row.mappingSource,
          province: row.province,
          username,
          reason: 'handler account not found',
        });
        continue;
      }

      const weight = index === 0 ? 100 : 1;
      const isBackup = index > 0;
      const existed = await moduleHandlerRepository.findOne({
        where: { moduleCode: namespacedModuleCode, handlerId: handler.id },
      });
      if (existed) {
        if (existed.weight !== weight || existed.isBackup !== isBackup) {
          await moduleHandlerRepository.save({ ...existed, weight, isBackup });
        }
        continue;
      }

      await moduleHandlerRepository.save(moduleHandlerRepository.create({
        moduleCode: namespacedModuleCode,
        handlerId: handler.id,
        weight,
        isBackup,
        isActive: true,
      }));
    }
  }
}

function parseHandlerUsernames(handlerText: string): string[] {
  return handlerText.split('/').map((value) => value.trim()).filter(Boolean);
}

function validateSheet(rows: readonly ProvinceHandlerSeed[], mappingSource: ProvinceMappingSource): void {
  const sheetRows = rows.filter((row) => row.mappingSource === mappingSource);
  const seen = new Set<string>();
  const expectedModuleCode = mappingSource === 'sheet4'
    ? DispatchModuleCode.IN_SERVICE_SINGLE_BUSINESS
    : DispatchModuleCode.OUT_OF_PROVINCE_DISPATCH;
  const expectedModuleType = mappingSource === 'sheet4' ? ModuleType.IN_SERVICE : ModuleType.OUT_OF_PROVINCE;
  const expectedTeamRole = mappingSource === 'sheet4' ? TeamRole.IN_SERVICE : TeamRole.OUT_OF_PROVINCE;

  for (const row of sheetRows) {
    if (
      row.moduleCode !== expectedModuleCode
      || row.moduleType !== expectedModuleType
      || row.teamRole !== expectedTeamRole
    ) {
      throw new Error(`${mappingSource} row ${row.rowOrder}: mapping metadata mismatch`);
    }
    if (!isValidProvince(row.province)) {
      throw new Error(`${mappingSource} row ${row.rowOrder}: invalid province ${row.province}`);
    }
    const key = `${row.moduleCode}__${row.province}`;
    if (seen.has(key)) {
      throw new Error(`${mappingSource} row ${row.rowOrder}: duplicate mapping ${key}`);
    }
    seen.add(key);

    if (!row.isActive) continue;

    const usernames = parseHandlerUsernames(row.handlerText);
    if (
      usernames.length === 0
      || usernames.length > 2
      || usernames.join('/') !== row.handlerUsernames.join('/')
    ) {
      throw new Error(`${mappingSource} row ${row.rowOrder}: expected one or two ordered handlers`);
    }
  }

  if (seen.size !== PROVINCES_27.length) {
    throw new Error(`${mappingSource}: expected ${PROVINCES_27.length} province mappings, received ${seen.size}`);
  }
}
