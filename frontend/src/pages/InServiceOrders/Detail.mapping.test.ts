import { describe, expect, it } from 'vitest';
import { IN_SERVICE_ORDER_KINDS, getInServiceStatusMeta } from '@/constants/inService';
import { getInServiceClosureActions, isCertificateTemplateOrder } from './Detail';

describe('in-service detail certificate template access', () => {
  it('allows certificate downloads only for active and resignation certificate orders', () => {
    expect(isCertificateTemplateOrder(IN_SERVICE_ORDER_KINDS.CERTIFICATE)).toBe(true);
    expect(isCertificateTemplateOrder(IN_SERVICE_ORDER_KINDS.RESIGNATION_CERTIFICATE)).toBe(true);
    expect(isCertificateTemplateOrder(IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL)).toBe(false);
    expect(isCertificateTemplateOrder(IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS)).toBe(false);
  });

  it('maps internal certificate statuses to the four business labels', () => {
    expect(getInServiceStatusMeta(IN_SERVICE_ORDER_KINDS.CERTIFICATE, 'dispatched').label).toBe('待开具');
    expect(getInServiceStatusMeta(IN_SERVICE_ORDER_KINDS.CERTIFICATE, 'accepted').label).toBe('开具中');
    expect(getInServiceStatusMeta(IN_SERVICE_ORDER_KINDS.CERTIFICATE, 'ready').label).toBe('开具中');
    expect(getInServiceStatusMeta(IN_SERVICE_ORDER_KINDS.CERTIFICATE, 'completed').label).toBe('已完成');
    expect(getInServiceStatusMeta(IN_SERVICE_ORDER_KINDS.CERTIFICATE, 'failed').label).toBe('已退回');
    expect(getInServiceStatusMeta(IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL, 'accepted').label)
      .toBe('已受理，待材料初审');
  });

  it('uses existing cancellation state for distinct renewal withdrawal and void commands', () => {
    expect(getInServiceClosureActions(IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL, true))
      .toEqual(['withdraw', 'void']);
    expect(getInServiceClosureActions(IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS, true))
      .toEqual(['void']);
    expect(getInServiceClosureActions(IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL, false))
      .toEqual([]);
  });
});
