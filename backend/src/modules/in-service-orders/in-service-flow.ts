import { InServiceOrderKind, InServiceOrderStatus } from 'src/entities';

export type InServiceFlowKey = 'single_business' | 'contract_renewal' | 'certificate';

export const IN_SERVICE_FLOW_KEYS: readonly InServiceFlowKey[] = [
  'single_business',
  'contract_renewal',
  'certificate',
];

export type InServiceTransitionMap = Record<
  InServiceOrderStatus,
  readonly InServiceOrderStatus[]
>;

export type InServiceFlowDefinition = {
  flow_key: InServiceFlowKey;
  name: string;
  status_transitions: InServiceTransitionMap;
};

const SINGLE_BUSINESS_TRANSITIONS: InServiceTransitionMap = {
  [InServiceOrderStatus.DRAFT]: [
    InServiceOrderStatus.DISPATCHED,
    InServiceOrderStatus.CANCELLED,
    InServiceOrderStatus.ARCHIVED,
  ],
  [InServiceOrderStatus.DISPATCHED]: [
    InServiceOrderStatus.ACCEPTED,
    InServiceOrderStatus.CANCELLED,
  ],
  [InServiceOrderStatus.ACCEPTED]: [
    InServiceOrderStatus.READY,
    InServiceOrderStatus.PENDING_INFO,
    InServiceOrderStatus.DISPATCHED,
    InServiceOrderStatus.CANCELLED,
  ],
  [InServiceOrderStatus.READY]: [
    InServiceOrderStatus.PROCESSING,
    InServiceOrderStatus.CANCELLED,
  ],
  [InServiceOrderStatus.PROCESSING]: [
    InServiceOrderStatus.PENDING_INFO,
    InServiceOrderStatus.COMPLETED,
    InServiceOrderStatus.FAILED,
    InServiceOrderStatus.CANCELLED,
  ],
  [InServiceOrderStatus.PENDING_INFO]: [
    InServiceOrderStatus.DISPATCHED,
    InServiceOrderStatus.ACCEPTED,
    InServiceOrderStatus.PROCESSING,
    InServiceOrderStatus.CANCELLED,
  ],
  [InServiceOrderStatus.COMPLETED]: [InServiceOrderStatus.ARCHIVED],
  [InServiceOrderStatus.FAILED]: [InServiceOrderStatus.ARCHIVED],
  [InServiceOrderStatus.CANCELLED]: [InServiceOrderStatus.ARCHIVED],
  [InServiceOrderStatus.ARCHIVED]: [],
};

const BEILUN_CHILD_ORDER_TRANSITIONS: InServiceTransitionMap = {
  [InServiceOrderStatus.DRAFT]: [
    InServiceOrderStatus.DISPATCHED,
    InServiceOrderStatus.CANCELLED,
    InServiceOrderStatus.ARCHIVED,
  ],
  [InServiceOrderStatus.DISPATCHED]: [
    InServiceOrderStatus.ACCEPTED,
    InServiceOrderStatus.PENDING_INFO,
    InServiceOrderStatus.CANCELLED,
  ],
  [InServiceOrderStatus.ACCEPTED]: [
    InServiceOrderStatus.PENDING_INFO,
    InServiceOrderStatus.COMPLETED,
    InServiceOrderStatus.CANCELLED,
  ],
  // Historical direct orders may already use these statuses. They retain only
  // the equivalent Beilun child-order return and completion actions.
  [InServiceOrderStatus.READY]: [
    InServiceOrderStatus.PENDING_INFO,
    InServiceOrderStatus.COMPLETED,
    InServiceOrderStatus.CANCELLED,
  ],
  [InServiceOrderStatus.PROCESSING]: [
    InServiceOrderStatus.PENDING_INFO,
    InServiceOrderStatus.COMPLETED,
    InServiceOrderStatus.CANCELLED,
  ],
  [InServiceOrderStatus.PENDING_INFO]: [
    InServiceOrderStatus.DISPATCHED,
    InServiceOrderStatus.ACCEPTED,
    InServiceOrderStatus.READY,
    InServiceOrderStatus.PROCESSING,
    InServiceOrderStatus.CANCELLED,
  ],
  [InServiceOrderStatus.COMPLETED]: [InServiceOrderStatus.ARCHIVED],
  [InServiceOrderStatus.FAILED]: [InServiceOrderStatus.ARCHIVED],
  [InServiceOrderStatus.CANCELLED]: [InServiceOrderStatus.ARCHIVED],
  [InServiceOrderStatus.ARCHIVED]: [],
};

const CERTIFICATE_TRANSITIONS: InServiceTransitionMap = {
  [InServiceOrderStatus.DRAFT]: [
    InServiceOrderStatus.DISPATCHED,
    InServiceOrderStatus.CANCELLED,
    InServiceOrderStatus.ARCHIVED,
  ],
  [InServiceOrderStatus.DISPATCHED]: [
    InServiceOrderStatus.PROCESSING,
    InServiceOrderStatus.CANCELLED,
  ],
  [InServiceOrderStatus.ACCEPTED]: [
    InServiceOrderStatus.PROCESSING,
    InServiceOrderStatus.PENDING_INFO,
    InServiceOrderStatus.COMPLETED,
    InServiceOrderStatus.CANCELLED,
  ],
  [InServiceOrderStatus.READY]: [
    InServiceOrderStatus.PROCESSING,
    InServiceOrderStatus.COMPLETED,
    InServiceOrderStatus.CANCELLED,
  ],
  [InServiceOrderStatus.PROCESSING]: [
    InServiceOrderStatus.PENDING_INFO,
    InServiceOrderStatus.COMPLETED,
    InServiceOrderStatus.CANCELLED,
  ],
  [InServiceOrderStatus.PENDING_INFO]: [
    InServiceOrderStatus.ACCEPTED,
    InServiceOrderStatus.PROCESSING,
    InServiceOrderStatus.CANCELLED,
  ],
  [InServiceOrderStatus.COMPLETED]: [InServiceOrderStatus.ARCHIVED],
  [InServiceOrderStatus.FAILED]: [InServiceOrderStatus.ARCHIVED],
  [InServiceOrderStatus.CANCELLED]: [InServiceOrderStatus.ARCHIVED],
  [InServiceOrderStatus.ARCHIVED]: [],
};

function cloneTransitions(source: InServiceTransitionMap): InServiceTransitionMap {
  return Object.fromEntries(
    Object.entries(source).map(([status, next]) => [status, [...next]]),
  ) as unknown as InServiceTransitionMap;
}

const FLOW_DEFINITIONS: Record<InServiceFlowKey, InServiceFlowDefinition> = {
  single_business: {
    flow_key: 'single_business',
    name: '北仑单项业务办理流程',
    status_transitions: SINGLE_BUSINESS_TRANSITIONS,
  },
  contract_renewal: {
    flow_key: 'contract_renewal',
    name: '劳动合同续签流程',
    status_transitions: BEILUN_CHILD_ORDER_TRANSITIONS,
  },
  certificate: {
    flow_key: 'certificate',
    name: '在职证明开具流程',
    status_transitions: CERTIFICATE_TRANSITIONS,
  },
};

export function getInServiceFlowKey(orderKind: InServiceOrderKind): InServiceFlowKey | null {
  if (orderKind === InServiceOrderKind.SINGLE_BUSINESS) return 'single_business';
  if (orderKind === InServiceOrderKind.CONTRACT_RENEWAL) return 'contract_renewal';
  if (orderKind === InServiceOrderKind.CERTIFICATE) return 'certificate';
  return null;
}

export function usesBeilunChildOrderFlow(orderKind: InServiceOrderKind): boolean {
  return orderKind === InServiceOrderKind.CONTRACT_RENEWAL
    || orderKind === InServiceOrderKind.OUT_OF_PROVINCE_INCREASE
    || orderKind === InServiceOrderKind.OUT_OF_PROVINCE_DECREASE;
}

export function getDefaultInServiceFlowDefinition(flowKey: InServiceFlowKey): InServiceFlowDefinition {
  const definition = FLOW_DEFINITIONS[flowKey];
  return {
    ...definition,
    status_transitions: cloneTransitions(definition.status_transitions),
  };
}

export function getDefaultInServiceOrderTransitions(
  orderKind: InServiceOrderKind,
): InServiceTransitionMap {
  const flowKey = getInServiceFlowKey(orderKind);
  if (flowKey) return getDefaultInServiceFlowDefinition(flowKey).status_transitions;
  if (
    orderKind === InServiceOrderKind.OUT_OF_PROVINCE_INCREASE
    || orderKind === InServiceOrderKind.OUT_OF_PROVINCE_DECREASE
  ) {
    return cloneTransitions(BEILUN_CHILD_ORDER_TRANSITIONS);
  }
  return cloneTransitions(SINGLE_BUSINESS_TRANSITIONS);
}
