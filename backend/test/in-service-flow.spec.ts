import {
  InServiceOrderKind,
  InServiceOrderStatus,
} from 'src/entities';
import {
  getDefaultInServiceFlowDefinition,
  getDefaultInServiceOrderTransitions,
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

  it('keeps single business, renewal and certificate transitions independent', () => {
    const single = getDefaultInServiceFlowDefinition('single_business');
    const renewal = getDefaultInServiceFlowDefinition('contract_renewal');
    const certificate = getDefaultInServiceFlowDefinition('certificate');

    expect(new Set([single.name, renewal.name, certificate.name]).size).toBe(3);
    expect(single.status_transitions[InServiceOrderStatus.ACCEPTED]).toContain(InServiceOrderStatus.READY);
    expect(single.status_transitions[InServiceOrderStatus.PROCESSING]).toContain(InServiceOrderStatus.FAILED);

    expect(renewal.status_transitions[InServiceOrderStatus.DISPATCHED]).toEqual(expect.arrayContaining([
      InServiceOrderStatus.ACCEPTED,
      InServiceOrderStatus.PENDING_INFO,
    ]));
    expect(renewal.status_transitions[InServiceOrderStatus.ACCEPTED]).toEqual(expect.arrayContaining([
      InServiceOrderStatus.PENDING_INFO,
      InServiceOrderStatus.COMPLETED,
    ]));
    expect(renewal.status_transitions[InServiceOrderStatus.ACCEPTED]).not.toContain(InServiceOrderStatus.DISPATCHED);
    expect(renewal.status_transitions[InServiceOrderStatus.ACCEPTED]).not.toContain(InServiceOrderStatus.READY);
    expect(renewal.status_transitions[InServiceOrderStatus.PROCESSING]).not.toContain(InServiceOrderStatus.FAILED);

    expect(certificate.status_transitions[InServiceOrderStatus.DISPATCHED]).toContain(InServiceOrderStatus.PROCESSING);
    expect(certificate.status_transitions[InServiceOrderStatus.PROCESSING]).toContain(InServiceOrderStatus.COMPLETED);
    expect(certificate.status_transitions[InServiceOrderStatus.PROCESSING]).not.toContain(InServiceOrderStatus.FAILED);
  });

  it.each([
    InServiceOrderKind.OUT_OF_PROVINCE_INCREASE,
    InServiceOrderKind.OUT_OF_PROVINCE_DECREASE,
  ])('reuses the Beilun social-insurance accept-and-complete flow for %s', (orderKind) => {
    const transitions = getDefaultInServiceOrderTransitions(orderKind);

    expect(transitions[InServiceOrderStatus.DISPATCHED]).toEqual(expect.arrayContaining([
      InServiceOrderStatus.ACCEPTED,
      InServiceOrderStatus.PENDING_INFO,
    ]));
    expect(transitions[InServiceOrderStatus.ACCEPTED]).toEqual(expect.arrayContaining([
      InServiceOrderStatus.PENDING_INFO,
      InServiceOrderStatus.COMPLETED,
    ]));
    expect(transitions[InServiceOrderStatus.ACCEPTED]).not.toContain(InServiceOrderStatus.DISPATCHED);
    expect(transitions[InServiceOrderStatus.ACCEPTED]).not.toContain(InServiceOrderStatus.READY);
    expect(transitions[InServiceOrderStatus.ACCEPTED]).not.toContain(InServiceOrderStatus.PROCESSING);
    expect(transitions[InServiceOrderStatus.PROCESSING]).not.toContain(InServiceOrderStatus.FAILED);
  });
});
