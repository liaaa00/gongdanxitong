import { OUT_OF_PROVINCE_ACCOUNTS } from 'src/modules/in-service-orders/out-of-province-account-data';

describe('省外账户 Sheet5 目录', () => {
  it('keeps all 149 unique rows and the source order', () => {
    expect(OUT_OF_PROVINCE_ACCOUNTS).toHaveLength(149);
    expect(new Set(OUT_OF_PROVINCE_ACCOUNTS.map((item) => item.unitName)).size).toBe(149);
    expect(OUT_OF_PROVINCE_ACCOUNTS[0]).toEqual({
      unitName: '深圳市递四方速递有限公司合肥分公司',
      province: '安徽',
      city: '合肥',
      socialHandler: '陈丽',
      businessOwner: '马玥',
    });
    expect(OUT_OF_PROVINCE_ACCOUNTS.at(-1)).toEqual({
      unitName: '共道网络科技有限公司成都分公司',
      province: '四川',
      city: '成都',
      socialHandler: '朱敏',
      businessOwner: '王艳组',
    });
    expect(OUT_OF_PROVINCE_ACCOUNTS.every((item) => Object.values(item).every(Boolean))).toBe(true);
  });
});
