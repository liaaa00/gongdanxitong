import { PROVINCES_27 } from 'src/common/constants/provinces';
import { PROVINCE_HANDLER_SEEDS } from 'src/database/seeds/province-handler.seed';
import { DispatchModuleCode, ModuleType, OrderType, TeamRole } from 'src/entities';

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
    for (const province of ['浙江', '青海']) {
      expect(PROVINCES_27).not.toContain(province);
      expect(PROVINCE_HANDLER_SEEDS.some((row) => row.province === province)).toBe(false);
    }
  });

  it('preserves slash order as primary then transfer-only backup', () => {
    const sheet4Dual = PROVINCE_HANDLER_SEEDS
      .filter((row) => row.mappingSource === 'sheet4' && row.handlerUsernames.length === 2)
      .map((row) => row.province)
      .sort();
    const sheet5Dual = PROVINCE_HANDLER_SEEDS
      .filter((row) => row.mappingSource === 'sheet5' && row.handlerUsernames.length === 2)
      .map((row) => row.province);

    expect(sheet4Dual).toEqual(['湖北', '江苏', '山西', '山东', '福建'].sort());
    expect(sheet5Dual).toEqual(['福建']);
    const orderedHandlers = Object.fromEntries(PROVINCE_HANDLER_SEEDS
      .filter((seed) => seed.handlerUsernames.length === 2)
      .map((row) => [`${row.mappingSource}:${row.province}`, row.handlerUsernames]));
    expect(orderedHandlers).toEqual({
      'sheet4:湖北': ['zhumin', 'daiminhua'],
      'sheet4:江苏': ['hexiaoli', 'daijunxiang'],
      'sheet4:山西': ['qianzhuoyun', 'heyitian'],
      'sheet4:山东': ['yuzheng', 'heyitian'],
      'sheet4:福建': ['yangxiaohan', 'yangjie'],
      'sheet5:福建': ['yangxiaohan', 'yangjie'],
    });
  });
});
