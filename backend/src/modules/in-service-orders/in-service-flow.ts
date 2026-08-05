import { InServiceOrderKind, InServiceOrderStatus } from 'src/entities';

export type InServiceFlowKey = 'single_business' | 'contract_renewal' | 'certificate';

export const IN_SERVICE_FLOW_KEYS: readonly InServiceFlowKey[] = [
  'single_business',
  'contract_renewal',
  'certificate',
];

export type InServiceFlowDefinition = {
  flow_key: InServiceFlowKey;
  name: string;
  status_transitions: Record<InServiceOrderStatus, readonly InServiceOrderStatus[]>;
};

const BASE_TRANSITIONS: Record<InServiceOrderStatus, readonly InServiceOrderStatus[]> = {
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

function cloneTransitions(): Record<InServiceOrderStatus, readonly InServiceOrderStatus[]> {
  return Object.fromEntries(
    Object.entries(BASE_TRANSITIONS).map(([status, next]) => [status, [...next]]),
  ) as unknown as Record<InServiceOrderStatus, readonly InServiceOrderStatus[]>;
}

const FLOW_DEFINITIONS: Record<InServiceFlowKey, InServiceFlowDefinition> = {
  single_business: {
    flow_key: 'single_business',
    name: '北仑单项业务办理流程',
    status_transitions: cloneTransitions(),
  },
  contract_renewal: {
    flow_key: 'contract_renewal',
    name: '劳动合同续签流程',
    status_transitions: cloneTransitions(),
  },
  certificate: {
    flow_key: 'certificate',
    name: '在职证明开具流程',
    status_transitions: cloneTransitions(),
  },
};

export function getInServiceFlowKey(orderKind: InServiceOrderKind): InServiceFlowKey | null {
  if (orderKind === InServiceOrderKind.SINGLE_BUSINESS) return 'single_business';
  if (orderKind === InServiceOrderKind.CONTRACT_RENEWAL) return 'contract_renewal';
  if (orderKind === InServiceOrderKind.CERTIFICATE) return 'certificate';
  return null;
}

export function getDefaultInServiceFlowDefinition(flowKey: InServiceFlowKey): InServiceFlowDefinition {
  const definition = FLOW_DEFINITIONS[flowKey];
  return {
    ...definition,
    status_transitions: cloneTransitions(),
  };
}
