import { describe, expect, it } from 'vitest';
import { IN_SERVICE_ORDER_KINDS, getInServiceStatusMeta } from '@/constants/inService';
import {
  getInServiceClosureActions,
  getInServiceFlowUiPolicy,
  isCertificateTemplateOrder,
} from './Detail';

describe('independent in-service flow presentation', () => {
  it('allows certificate downloads only for active and resignation certificate orders', () => {
    expect(isCertificateTemplateOrder(IN_SERVICE_ORDER_KINDS.CERTIFICATE)).toBe(true);
    expect(isCertificateTemplateOrder(IN_SERVICE_ORDER_KINDS.RESIGNATION_CERTIFICATE)).toBe(true);
    expect(isCertificateTemplateOrder(IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL)).toBe(false);
    expect(isCertificateTemplateOrder(IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS)).toBe(false);
  });

  it('maps certificate, renewal and province statuses to their own business labels', () => {
    expect(getInServiceStatusMeta(IN_SERVICE_ORDER_KINDS.CERTIFICATE, 'dispatched').label).toBe('待开具');
    expect(getInServiceStatusMeta(IN_SERVICE_ORDER_KINDS.CERTIFICATE, 'processing').label).toBe('开具中');
    expect(getInServiceStatusMeta(IN_SERVICE_ORDER_KINDS.CERTIFICATE, 'completed').label).toBe('已完成');

    expect(getInServiceStatusMeta(IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL, 'dispatched').label).toBe('未接单');
    expect(getInServiceStatusMeta(IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL, 'accepted').label).toBe('已接单');
    expect(getInServiceStatusMeta(IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL, 'completed').label).toBe('已完成');

    expect(getInServiceStatusMeta(IN_SERVICE_ORDER_KINDS.OUT_OF_PROVINCE_INCREASE, 'dispatched').label).toBe('未接单');
    expect(getInServiceStatusMeta(IN_SERVICE_ORDER_KINDS.OUT_OF_PROVINCE_DECREASE, 'accepted').label).toBe('已接单');
    expect(getInServiceStatusMeta(IN_SERVICE_ORDER_KINDS.OUT_OF_PROVINCE_INCREASE, 'completed').label).toBe('已完成');
  });

  it('only single business exposes material confirmation, channel choice and failure', () => {
    expect(getInServiceFlowUiPolicy(IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS)).toMatchObject({
      acceptLabel: '受理',
      completeLabel: '办理成功',
      showMaterialConfirmation: true,
      showChannelSelection: true,
      allowFailure: true,
      allowTransfer: true,
      allowPendingReturn: false,
    });
    expect(getInServiceFlowUiPolicy(IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL)).toMatchObject({
      acceptLabel: '接单',
      completeLabel: '完成',
      progressItems: ['未接单', '已接单', '已完成'],
      showMaterialConfirmation: false,
      showChannelSelection: false,
      allowFailure: false,
      allowTransfer: false,
      allowPendingReturn: true,
    });
    expect(getInServiceFlowUiPolicy(IN_SERVICE_ORDER_KINDS.CERTIFICATE)).toMatchObject({
      acceptLabel: '开始开具',
      completeLabel: '完成开具',
      showMaterialConfirmation: false,
      showChannelSelection: false,
      allowFailure: false,
      allowTransfer: true,
      allowPendingReturn: false,
    });
    expect(getInServiceFlowUiPolicy(IN_SERVICE_ORDER_KINDS.OUT_OF_PROVINCE_INCREASE)).toMatchObject({
      acceptLabel: '接单',
      completeLabel: '完成',
      progressItems: ['未接单', '已接单', '已完成'],
      showMaterialConfirmation: false,
      showChannelSelection: false,
      allowFailure: false,
      allowTransfer: false,
      allowPendingReturn: true,
    });
  });

  it('uses existing cancellation state for distinct renewal and certificate withdrawal commands', () => {
    expect(getInServiceClosureActions(IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL, true))
      .toEqual(['withdraw', 'void']);
    expect(getInServiceClosureActions(IN_SERVICE_ORDER_KINDS.CERTIFICATE, true))
      .toEqual(['withdraw', 'void']);
    expect(getInServiceClosureActions(IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS, true))
      .toEqual(['void']);
    expect(getInServiceClosureActions(IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL, false))
      .toEqual([]);
  });
});
