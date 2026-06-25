import request from './request';

export interface OperationLogRetentionSetting {
  days: number;
}

const OPERATION_LOG_RETENTION_URL = '/admin/system-settings/operation-log-retention';

export function getOperationLogRetention(): Promise<OperationLogRetentionSetting> {
  return request.get(OPERATION_LOG_RETENTION_URL) as Promise<OperationLogRetentionSetting>;
}

export function updateOperationLogRetention(days: number): Promise<OperationLogRetentionSetting> {
  return request.put(OPERATION_LOG_RETENTION_URL, { days }) as Promise<OperationLogRetentionSetting>;
}
