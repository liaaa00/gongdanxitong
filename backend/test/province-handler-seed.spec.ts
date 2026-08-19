import { PROVINCES_27 } from 'src/common/constants/provinces';
import {
  provinceHandlerAccountScope,
  provinceHandlerConfigScope,
  PROVINCE_HANDLER_SEEDS,
} from 'src/database/seeds/province-handler.seed';
import { BusinessScope, DispatchModuleCode, ModuleType, OrderType, TeamRole } from 'src/entities';

describe('province handler seed contract', () => {
  it('keeps Sheet4 and Sheet5 as two complete independent scans', () => {
    const sheet4 = PROVINCE_HANDLER_SEEDS.filter((row) => row.mappingSource === 'sheet4');
    const sheet5 = PROVINCE_HANDLER_SEEDS.filter((row) => row.mappingSource === 'sheet5');

    expect(sheet4).toHaveLength(PROVINCES_27.length);
    expect(sheet5).toHaveLength(PROVINCES_27.length);
    expect(new Set(sheet4.map((row) => row.province))).toEqual(new Set(PROVINCES_27));
    expect(new Set(sheet5.map((row) => row.province))).toEqual(new Set(PROVINCES_27));
    expect(sheet4.every((row) =>
      row.moduleCode === DispatchModuleCode.IN_SERVICE_SINGLE_BUSINESS
      && row.moduleType === ModuleType.IN_SERVICE
      && row.teamRole === TeamRole.IN_SERVICE)).toBe(true);
    expect(sheet5.every((row) =>
      row.moduleCode === DispatchModuleCode.OUT_OF_PROVINCE_DISPATCH
      && row.moduleType === ModuleType.OUT_OF_PROVINCE
      && row.teamRole === TeamRole.OUT_OF_PROVINCE
      && row.orderTypes?.join(',') === [
        OrderType.OUT_OF_PROVINCE_INCREASE,
        OrderType.OUT_OF_PROVINCE_DECREASE,
      ].join(','))).toBe(true);
  });

  it('excludes provinces outside the configured 27-province business scope', () => {
    for (const province of ['\u6d59\u6c5f', '\u9752\u6d77']) {
      expect(PROVINCES_27).not.toContain(province);
      expect(PROVINCE_HANDLER_SEEDS.some((row) => row.province === province)).toBe(false);
    }
  });

  it('uses the same single-handler mapping for Sheet4 and Sheet5', () => {
    const sheet4 = PROVINCE_HANDLER_SEEDS.filter((row) => row.mappingSource === 'sheet4');
    const sheet5ByProvince = new Map(
      PROVINCE_HANDLER_SEEDS
        .filter((row) => row.mappingSource === 'sheet5')
        .map((row) => [row.province, row.handlerUsernames]),
    );

    expect(PROVINCE_HANDLER_SEEDS.every((row) => row.handlerUsernames.length <= 1)).toBe(true);
    for (const row of sheet4) {
      expect(sheet5ByProvince.get(row.province)).toEqual(row.handlerUsernames);
      expect(row.isActive).toBe(row.handlerUsernames.length === 1);
    }
  });

  it.each([
    ['sheet4', BusinessScope.BEILUN],
    ['sheet5', BusinessScope.OUT_OF_PROVINCE],
  ] as const)('stores %s mappings in the correct config scope', (mappingSource, expectedScope) => {
    expect(provinceHandlerConfigScope(mappingSource)).toBe(expectedScope);
  });

  it.each(['sheet4', 'sheet5'] as const)('resolves %s handlers from out_of_province accounts', (mappingSource) => {
    expect(provinceHandlerAccountScope(mappingSource)).toBe(BusinessScope.OUT_OF_PROVINCE);
  });
});
