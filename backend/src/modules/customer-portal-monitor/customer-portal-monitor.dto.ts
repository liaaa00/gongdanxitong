import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';

export const MONITOR_ACTIONS = ['onboarding.create_draft', 'resignation.create_draft', 'salary.submit', 'onboarding.import_confirm', 'resignation.import_confirm', 'portal.progress'] as const;
export const MONITOR_STAGES = ['gateway_received', 'connector_received', 'backend_responded', 'portal_responded', 'failed', 'timeout'] as const;
export const MONITOR_FAILURES = ['CONNECTOR_OFFLINE', 'CONNECTOR_TIMEOUT', 'RELAY_FAILED', 'BACKEND_REJECTED', 'GATEWAY_RESTARTED', 'CLIENT_DISCONNECTED'] as const;
export const MONITOR_STATUSES = ['awaiting_receipt', 'processing', 'completed', 'returned', 'failed', 'timeout', 'missing_receipt'] as const;
export type MonitorStatus = typeof MONITOR_STATUSES[number];

export class PortalMonitorEventDto {
  @IsUUID() id!: string;
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) sequence!: number;
  @IsUUID() traceId!: string;
  @Matches(/^[a-f0-9]{64}$/) requestKey!: string;
  @IsIn(MONITOR_ACTIONS) action!: typeof MONITOR_ACTIONS[number];
  @IsIn(MONITOR_STAGES) stage!: typeof MONITOR_STAGES[number];
  @IsOptional() @IsIn(['onboarding', 'resignation', 'salary']) businessType?: string | null;
  @IsISO8601({ strict: true }) at!: string;
  @IsOptional() @IsIn(MONITOR_FAILURES) failureCode?: typeof MONITOR_FAILURES[number] | null;
}
export class CollectPortalMonitorDto {
  @IsUUID() journalId!: string;
  @IsBoolean() connectorConnected!: boolean;
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PortalMonitorEventDto) events!: PortalMonitorEventDto[];
}
export class PortalMonitorQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsIn(MONITOR_STATUSES) status?: MonitorStatus;
  @IsOptional() @IsIn(['onboarding', 'resignation', 'salary']) businessType?: string;
}
