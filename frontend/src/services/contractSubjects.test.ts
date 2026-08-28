import { describe, expect, it } from 'vitest';
import { findFundRuleForLocation, getFundLocations, getFundRulesByLocation, type ContractSubjectItem } from './contractSubjects';

const rules: ContractSubjectItem[] = [
  {
    id: 'hangzhou',
    subjectName: '浙江/杭州',
    socialCreditCode: null,
    province: '浙江',
    city: '杭州',
    registeredAddress: '',
    fundRatioOptions: ['5%+5%'],
    supplementaryFundRatioOptions: [],
    fundRatioMode: 'same',
    isActive: true,
  },
  {
    id: 'suzhou-park',
    subjectName: '江苏/苏州工业园区',
    socialCreditCode: null,
    province: '江苏',
    city: '苏州工业园区',
    registeredAddress: '',
    fundRatioOptions: ['12%+12%'],
    supplementaryFundRatioOptions: [],
    fundRatioMode: 'same',
    isActive: true,
  },
];

describe('contract subject fund rule location matching', () => {
  it('matches common province/city suffix variants', () => {
    expect(findFundRuleForLocation(rules, '杭州市')?.id).toBe('hangzhou');
    expect(findFundRuleForLocation(rules, '浙江省/杭州市')?.id).toBe('hangzhou');
  });

  it('matches the Suzhou industrial park short name', () => {
    expect(findFundRuleForLocation(rules, '苏州园区')?.id).toBe('suzhou-park');
  });

  it('provides contract subject cities as payment locations in mock mode', async () => {
    await expect(getFundLocations()).resolves.toEqual(['杭州', '宁波市']);
  });

  it('returns no rules when no payment location is supplied', async () => {
    await expect(getFundRulesByLocation()).resolves.toEqual([]);
  });

  it('provides location-linked fund rules in mock mode', async () => {
    const result = await getFundRulesByLocation('宁波');
    expect(result[0]?.city).toBe('宁波市');
    expect(result[0]?.fundRatioOptions).toContain('12%+12%');
  });
});
