import { AsyncLocalStorage } from 'node:async_hooks';

export interface PortalMonitorContext { traceId: string; customerId: string; accountId: string }
export const portalMonitorContext = new AsyncLocalStorage<PortalMonitorContext>();
