import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PROVINCES_27, isValidProvince } from 'src/common/constants/provinces';
import {
  BusinessScope,
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
  city?: string;
  handlerText: string;
  handlerUsernames: readonly string[];
  orderTypes?: readonly OrderType[];
  rowOrder: number;
  isActive: boolean;
}

const logger = new Logger('ProvinceHandlerSeed');

// 2026-08-04 用户确认：省外增员、减员、单项业务与在职证明统一由这 9 名福保专员按省份办理。
const UNIFIED_PROVINCE_MAPPING: Record<string, string> = {
  广东: 'chenli',
  安徽: 'chenli',
  黑龙江: 'yangyi',
  河北: 'yangyi',
  贵州: 'yangyi',
  重庆: 'daijunxiang',
  江苏: 'daijunxiang',
  湖北: 'zhumin',
  四川: 'zhumin',
  广西: 'zhumin',
  海南: 'zhumin',
  江西: 'fangzhiying',
  云南: 'fangzhiying',
  吉林: 'fangzhiying',
  甘肃: 'fangzhiying',
  山西: 'heyitian',
  山东: 'heyitian',
  新疆: 'heyitian',
  北京: 'xuxiaofen',
  陕西: 'xuxiaofen',
  辽宁: 'xuxiaofen',
  天津: 'yangxiaohan',
  福建: 'yangxiaohan',
  上海: 'yangjie',
  湖南: 'yangjie',
  河南: 'yangjie',
  宁夏: 'yangjie',
};

function buildProvinceRows(
  mappingSource: ProvinceMappingSource,
  moduleCode: DispatchModuleCode,
  moduleType: ModuleType,
  teamRole: TeamRole,
  orderTypes?: readonly OrderType[],
): ProvinceHandlerSeed[] {
  return PROVINCES_27.map((province, index) => {
    const handlerText = UNIFIED_PROVINCE_MAPPING[province] ?? '';
    return {
      mappingSource,
      moduleCode,
      moduleType,
      teamRole,
      province,
      handlerText,
      handlerUsernames: parseHandlerUsernames(handlerText),
      orderTypes,
      rowOrder: index + 1,
      isActive: handlerText.length > 0,
    };
  });
}

export const PROVINCE_HANDLER_SEEDS: readonly ProvinceHandlerSeed[] = [
  ...buildProvinceRows(
    'sheet4',
    DispatchModuleCode.IN_SERVICE_SINGLE_BUSINESS,
    ModuleType.IN_SERVICE,
    TeamRole.IN_SERVICE,
  ),
  ...buildProvinceRows(
    'sheet5',
    DispatchModuleCode.OUT_OF_PROVINCE_DISPATCH,
    ModuleType.OUT_OF_PROVINCE,
    TeamRole.OUT_OF_PROVINCE,
    [OrderType.OUT_OF_PROVINCE_INCREASE, OrderType.OUT_OF_PROVINCE_DECREASE],
  ),
];

// 福建不是主办/备份：厦门固定杨杰，其余福建城市固定羊晓焓。
export const PROVINCE_CITY_HANDLER_SEEDS: readonly ProvinceHandlerSeed[] = [
  {
    mappingSource: 'sheet4',
    moduleCode: DispatchModuleCode.IN_SERVICE_SINGLE_BUSINESS,
    moduleType: ModuleType.IN_SERVICE,
    teamRole: TeamRole.IN_SERVICE,
    province: '福建',
    city: '厦门',
    handlerText: 'yangjie',
    handlerUsernames: ['yangjie'],
    rowOrder: 1,
    isActive: true,
  },
  {
    mappingSource: 'sheet5',
    moduleCode: DispatchModuleCode.OUT_OF_PROVINCE_DISPATCH,
    moduleType: ModuleType.OUT_OF_PROVINCE,
    teamRole: TeamRole.OUT_OF_PROVINCE,
    province: '福建',
    city: '厦门',
    handlerText: 'yangjie',
    handlerUsernames: ['yangjie'],
    orderTypes: [OrderType.OUT_OF_PROVINCE_INCREASE, OrderType.OUT_OF_PROVINCE_DECREASE],
    rowOrder: 1,
    isActive: true,
  },
];

export function provinceHandlerNamespace(
  moduleCode: string,
  province: string,
  city?: string,
): string {
  return [moduleCode, province, city].filter(Boolean).join('__');
}

export function provinceHandlerConfigScope(mappingSource: ProvinceMappingSource): BusinessScope {
  return mappingSource === 'sheet5' ? BusinessScope.OUT_OF_PROVINCE : BusinessScope.BEILUN;
}

export function provinceHandlerAccountScope(_mappingSource: ProvinceMappingSource): BusinessScope {
  return BusinessScope.OUT_OF_PROVINCE;
}

export async function seedProvinceHandlers(dataSource: DataSource): Promise<void> {
  validateSheet(PROVINCE_HANDLER_SEEDS, 'sheet4');
  validateSheet(PROVINCE_HANDLER_SEEDS, 'sheet5');
  validateCityRows(PROVINCE_CITY_HANDLER_SEEDS);

  const userRepository = dataSource.getRepository(User);
  const moduleHandlerRepository = dataSource.getRepository(ModuleHandler);
  const rows = [...PROVINCE_HANDLER_SEEDS, ...PROVINCE_CITY_HANDLER_SEEDS]
    .filter((row) => row.isActive)
    .sort((left, right) => (
      left.mappingSource.localeCompare(right.mappingSource)
      || left.rowOrder - right.rowOrder
      || String(left.city ?? '').localeCompare(String(right.city ?? ''))
    ));

  for (const row of rows) {
    const moduleCode = provinceHandlerNamespace(row.moduleCode, row.province, row.city);
    const configScope = provinceHandlerConfigScope(row.mappingSource);
    const accountScope = provinceHandlerAccountScope(row.mappingSource);
    const expectedHandlers: Array<{ user: User; weight: number }> = [];

    for (const username of row.handlerUsernames) {
      const user = await userRepository.findOne({ where: { username, isActive: true, businessScope: accountScope } });
      if (!user) {
        logger.warn({ mappingSource: row.mappingSource, province: row.province, city: row.city, username, reason: 'handler account not found' });
        continue;
      }
      expectedHandlers.push({ user, weight: 100 });
    }

    const expectedIds = new Set(expectedHandlers.map(({ user }) => user.id));
    const existingRows = await moduleHandlerRepository.find({ where: { moduleCode, businessScope: configScope } });
    for (const existing of existingRows) {
      const shouldBeActive = expectedIds.has(existing.handlerId);
      if (
        existing.isActive !== shouldBeActive
        || (shouldBeActive && (existing.isBackup || existing.weight !== 100))
      ) {
        existing.isActive = shouldBeActive;
        if (shouldBeActive) {
          existing.isBackup = false;
          existing.weight = 100;
        }
        await moduleHandlerRepository.save(existing);
      }
    }

    for (const { user, weight } of expectedHandlers) {
      const existing = existingRows.find((item) => item.handlerId === user.id);
      if (existing) continue;
      await moduleHandlerRepository.save(moduleHandlerRepository.create({
        moduleCode,
        businessScope: configScope,
        handlerId: user.id,
        weight,
        isBackup: false,
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
    if (row.moduleCode !== expectedModuleCode || row.moduleType !== expectedModuleType || row.teamRole !== expectedTeamRole) {
      throw new Error(`${mappingSource} row ${row.rowOrder}: mapping metadata mismatch`);
    }
    if (!isValidProvince(row.province) || row.city) {
      throw new Error(`${mappingSource} row ${row.rowOrder}: invalid province mapping ${row.province}`);
    }
    const key = provinceHandlerNamespace(row.moduleCode, row.province);
    if (seen.has(key)) throw new Error(`${mappingSource} row ${row.rowOrder}: duplicate mapping ${key}`);
    seen.add(key);

    if (!row.isActive) continue;
    if (row.handlerUsernames.length !== 1 || row.handlerUsernames[0] !== row.handlerText) {
      throw new Error(`${mappingSource} row ${row.rowOrder}: expected exactly one primary handler`);
    }
  }

  if (seen.size !== PROVINCES_27.length) {
    throw new Error(`${mappingSource}: expected ${PROVINCES_27.length} province mappings, received ${seen.size}`);
  }
}

function validateCityRows(rows: readonly ProvinceHandlerSeed[]): void {
  for (const row of rows) {
    if (
      row.province !== '福建'
      || row.city !== '厦门'
      || row.handlerUsernames.length !== 1
      || row.handlerUsernames[0] !== 'yangjie'
    ) {
      throw new Error(`invalid city mapping: ${row.mappingSource}/${row.province}/${row.city ?? ''}`);
    }
  }
}
