import { ContractSubject } from 'src/entities';
import { ContractSubjectsService } from 'src/modules/contract-subjects/contract-subjects.service';

function subject(overrides: Partial<ContractSubject>): ContractSubject {
  return {
    id: 'subject-1',
    subjectName: '主体',
    socialCreditCode: null,
    province: '浙江',
    city: '杭州',
    registeredAddress: '杭州地址',
    fundRatioOptions: ['5%+5%'],
    supplementaryFundRatioOptions: [],
    fundRatioMode: 'same',
    isActive: true,
    ...overrides,
  } as ContractSubject;
}

describe('ContractSubjectsService location fund rules', () => {
  it('aggregates ratio options by insured location instead of subject identity', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([
        subject({ id: 'a', subjectName: '主体A', fundRatioOptions: ['5%+5%'], supplementaryFundRatioOptions: ['2%+2%'] }),
        subject({ id: 'b', subjectName: '主体B', fundRatioOptions: ['8%+8%'], fundRatioMode: 'separate' }),
        subject({ id: 'c', province: '江苏', city: '南京市', fundRatioOptions: ['7%+7%'] }),
        subject({ id: 'd', province: '江苏', city: '苏州工业园区', fundRatioOptions: ['12%+12%'] }),
      ]),
    } as any;
    const service = new ContractSubjectsService(repository);

    await expect(service.findFundRuleByLocation('浙江省/杭州市')).resolves.toMatchObject({
      id: 'location:浙江/杭州',
      subjectName: '浙江/杭州',
      fundRatioOptions: ['5%+5%', '8%+8%'],
      supplementaryFundRatioOptions: ['2%+2%'],
      fundRatioMode: 'separate',
    });
    await expect(service.findFundRuleByLocation('杭州市')).resolves.toMatchObject({
      subjectName: '浙江/杭州',
    });
    await expect(service.findFundRuleByLocation('苏州园区')).resolves.toMatchObject({
      subjectName: '江苏/苏州工业园区',
      fundRatioOptions: ['12%+12%'],
    });
    await expect(service.listFundLocations()).resolves.toEqual(['杭州', '南京市', '苏州工业园区']);
    expect(repository.find).toHaveBeenCalledTimes(5);
  });
});
