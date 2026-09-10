import request from './request';

export interface PortalIntakeRow {
  id: string; requestNo: string; businessType: 'onboarding' | 'resignation'; workOrderId: string | null;
  status: string; createdAt: string; configurationMissing: string[]; canClaim: boolean; canReview: boolean; originalStopMonth: string | null;
}
const base = (customerId: string) => `/customer-config/customers/${customerId}/intake`;
export const getPortalIntake = (customerId: string) => request.get(base(customerId)) as Promise<PortalIntakeRow[]>;
export const claimPortalIntake = (customerId: string, id: string) => request.post(`${base(customerId)}/${id}/claim`) as Promise<{ workOrderId: string }>;
