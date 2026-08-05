import {
  InServiceOrderKind,
  InServiceOrderStatus,
} from 'src/entities';
import {
  getDefaultInServiceFlowDefinition,
  getInServiceFlowKey,
} from 'src/modules/in-service-orders/in-service-flow';

describe('in-service flow definitions', () => {
  it.each([
    [InServiceOrderKind.SINGLE_BUSINESS, 'single_business'],
    [InServiceOrderKind.CONTRACT_RENEWAL, 'contract_renewal'],
    [InServiceOrderKind.CERTIFICATE, 'certificate'],
  ] as const)('maps %s to its own flow key', (orderKind, flowKey) => {
    expect(getInServiceFlowKey(orderKind)).toBe(flowKey);
  });

  it('keeps the three default definitions independent', () => {
    const single = getDefaultInServiceFlowDefinition('single_business');
    const renewal = getDefaultInServiceFlowDefinition('contract_renewal');
    const certificate = getDefaultInServiceFlowDefinition('certificate');

    expect(new Set([single.name, renewal.name, certificate.name]).size).toBe(3);
    expect(single.flow_key).toBe('single_business');
    expect(renewal.flow_key).toBe('contract_renewal');
    expect(certificate.flow_key).toBe('certificate');
    expect(single.status_transitions).not.toBe(renewal.status_transitions);
    expect(renewal.status_transitions).not.toBe(certificate.status_transitions);
    expect(single.status_transitions[InServiceOrderStatus.PROCESSING]).toContain(InServiceOrderStatus.COMPLETED);
  });
});
