import { Workbook } from 'exceljs';
import {
  CONTRACT_SUBJECT_FUND_RULES,
  PAYROLL_LOCATIONS,
} from 'src/common/constants/contract-subject-fund';
import { getAllowedFundRatios } from 'src/modules/contract-subjects/contract-subjects.service';
import { ImportTemplateService } from 'src/modules/imports/import-template.service';

describe('contract subject fund rules', () => {
  it('keeps the workbook-backed subject and payroll counts', () => {
    expect(CONTRACT_SUBJECT_FUND_RULES).toHaveLength(54);
    expect(PAYROLL_LOCATIONS).toHaveLength(67);
    expect(PAYROLL_LOCATIONS).toContain('北仑总发薪');
    expect(CONTRACT_SUBJECT_FUND_RULES.find((item) => item.socialCreditCode === '91440104MAEWCWHD91')).toMatchObject({
      fundRatioMode: 'separate',
      fundRatioOptions: expect.arrayContaining(['5%+5%', '12%+12%']),
    });
    expect(CONTRACT_SUBJECT_FUND_RULES.find((item) => item.socialCreditCode === '91310101MAEQEP1150')).toMatchObject({
      supplementaryFundRatioOptions: ['2%+2%', '3%+3%'],
    });
    expect(CONTRACT_SUBJECT_FUND_RULES.find((item) => item.socialCreditCode === '91310101MAK9940Q47')).toMatchObject({
      fundRatioOptions: ['7%+7%'],
      supplementaryFundRatioOptions: ['5%+5%'],
    });
    expect(CONTRACT_SUBJECT_FUND_RULES.find((item) => item.socialCreditCode === '91320303MAKBHGHWXE')?.fundRatioOptions)
      .toEqual(['5%+5%', '6%+6%', '7%+7%', '8%+8%', '9%+9%', '10%+10%', '11%+11%', '12%+12%']);
    expect(getAllowedFundRatios({
      id: 'gz',
      subjectName: '广州',
      socialCreditCode: '91440104MAEWCWHD91',
      province: '广东',
      city: '广州',
      registeredAddress: '地址',
      fundRatioOptions: ['5%+5%', '6%+6%', '7%+7%', '8%+8%', '9%+9%', '10%+10%', '11%+11%', '12%+12%'],
      supplementaryFundRatioOptions: [],
      fundRatioMode: 'separate',
      isActive: true,
    })).toHaveLength(64);
  });

  it('writes dependent Excel validations for subject, address and fund fields', async () => {
    const fields = ['contract_subject', 'company_address', 'social_location', 'fund_ratio', 'supplementary_fund_ratio'].map((fieldCode, index) => ({
      fieldCode,
      fieldName: fieldCode,
      fieldType: ['contract_subject', 'company_address', 'social_location'].includes(fieldCode) ? 'text' : 'dropdown',
      isRequired: false,
      defaultRequired: false,
      conditionalRequired: null,
      dropdownOptions: null,
      placeholder: null,
      helpText: null,
      orderType: 'onboarding',
      displayOrder: index + 1,
      isActive: true,
      headerAlias: fieldCode === 'company_address' ? '劳动合同主体注册地' : null,
      isRequiredOverride: null,
    }));
    const service = new ImportTemplateService(
      { list: jest.fn().mockResolvedValue(fields) } as any,
      {
        list: jest.fn().mockResolvedValue([{
          id: 'subject-1',
          subjectName: '上海主体',
          socialCreditCode: '91310101MAEQEP1150',
          province: '上海',
          city: '上海',
          registeredAddress: '上海地址',
          fundRatioOptions: ['5%+5%'],
          supplementaryFundRatioOptions: ['2%+2%', '3%+3%'],
          fundRatioMode: 'same',
          isActive: true,
        }]),
        listFundLocationRules: jest.fn().mockResolvedValue([{
          id: 'location:上海/上海',
          subjectName: '上海/上海',
          socialCreditCode: null,
          province: '上海',
          city: '上海',
          registeredAddress: '',
          fundRatioOptions: ['5%+5%'],
          supplementaryFundRatioOptions: ['2%+2%', '3%+3%'],
          fundRatioMode: 'same',
          isActive: true,
        }]),
      } as any,
    );

    const result = await service.generate('onboarding' as any);
    const workbook = new Workbook();
    await workbook.xlsx.load(result.buffer as never);
    const sheet = workbook.getWorksheet('当前字段配置')!;
    const options = workbook.getWorksheet('__options')!;
    expect(options.getCell('CB1').value).toBe('上海主体');
    expect(options.getCell('CC1').value).toBe('上海地址');
    expect(options.getCell('CD1').value).toBe('上海');
    expect(sheet.getCell('B6').dataValidation?.formulae?.[0]).toContain('__options');
    expect(sheet.getCell('C6').dataValidation?.formulae?.[0]).toContain('MATCH(B6');
    expect(sheet.getCell('D6').dataValidation?.formulae?.[0]).toContain('__options');
    expect(sheet.getCell('D6').dataValidation?.error).toContain('有效的缴纳地城市');
    expect(sheet.getCell('E6').dataValidation?.formulae?.[0]).toContain('D6');
    expect(sheet.getCell('E6').dataValidation?.error).toContain('缴纳地');
    expect(sheet.getCell('F6').dataValidation?.formulae?.[0]).toContain('D6');
    expect(sheet.getCell('F6').dataValidation?.error).toContain('缴纳地');
  });
});
