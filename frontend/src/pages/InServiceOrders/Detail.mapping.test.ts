import { describe, expect, it } from 'vitest';
import { IN_SERVICE_ORDER_KINDS } from '@/constants/inService';
import { getInServiceDetailModuleCode } from './Detail';

describe('in-service detail template module mapping', () => {
  it('keeps Beilun and Zhejiang self-sign single-business templates isolated', () => {
    expect(getInServiceDetailModuleCode(IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS, 'beilun'))
      .toBe('in_service_single_business');
    expect(getInServiceDetailModuleCode(IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS, 'out_of_province'))
      .toBe('out_of_province_single_business');
  });

  it('maps each independent detail page to its own backend module', () => {
    expect(getInServiceDetailModuleCode(IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL, 'beilun'))
      .toBe('renewal_contract');
    expect(getInServiceDetailModuleCode(IN_SERVICE_ORDER_KINDS.CERTIFICATE, 'beilun'))
      .toBe('in_service_certificate');
    expect(getInServiceDetailModuleCode(IN_SERVICE_ORDER_KINDS.RESIGNATION_CERTIFICATE, 'beilun'))
      .toBe('resignation_certificate');
    expect(getInServiceDetailModuleCode(IN_SERVICE_ORDER_KINDS.OUT_OF_PROVINCE_INCREASE, 'out_of_province'))
      .toBe('out_of_province_increase');
    expect(getInServiceDetailModuleCode(IN_SERVICE_ORDER_KINDS.OUT_OF_PROVINCE_DECREASE, 'out_of_province'))
      .toBe('out_of_province_decrease');
  });
});
