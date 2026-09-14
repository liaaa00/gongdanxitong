import request from './request';

export interface PortalIntakeWorkbenchRow {
  id: string; requestNo: string; customerId: string; customerName: string; customerCode: string;
  businessType: 'onboarding' | 'resignation'; workOrderId: string | null;
  employeeName: string; employeeIdCard: string; createdAt: string; status: string; reviewStatus: string;
  configurationMissing: string[]; correctionReason: string; correctionFields: string[];
  claimedBy: string; canClaim: boolean; canReview: boolean; originalStopMonth: string | null;
}
export interface PortalIntakeWorkbenchQuery { customerId?: string; businessType?: 'onboarding' | 'resignation'; status?: string; search?: string; page?: number; pageSize?: number }
export interface PortalIntakeWorkbenchResult { items: PortalIntakeWorkbenchRow[]; total: number; page: number; pageSize: number }
export const getPortalIntakeWorkbench = (params: PortalIntakeWorkbenchQuery = {}) => request.get('/customer-config/intake-review', { params }) as Promise<PortalIntakeWorkbenchResult>;
