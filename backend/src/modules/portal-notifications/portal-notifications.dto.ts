import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { NOTIFICATION_KINDS, PortalNotificationKind } from './portal-notification.config';

export class SavePortalNotificationSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() accountNoticeEnabled?: boolean;
  @IsOptional() @IsBoolean() monthlyEnabled?: boolean;
  @IsOptional() @IsBoolean() reminderEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(23) sendHour?: number;
  @IsOptional() @IsString() @MaxLength(500) portalUrl?: string;
  @IsOptional() @IsString() @MaxLength(1000) signature?: string;
  // The service validates template names, exact subject/body keys and variables.
  @IsOptional() @IsObject() templates?: Record<string, { subject: string; body: string }>;
}
export class CalendarDayDto {
  @IsString() date!: string;
  @IsBoolean() isWorkday!: boolean;
  @IsOptional() @IsString() @MaxLength(100) label?: string;
}
export class SavePortalCalendarDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(366) @ValidateNested({ each: true }) @Type(() => CalendarDayDto)
  days!: CalendarDayDto[];
}
export class CalendarYearQueryDto {
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year = new Date().getFullYear();
}
export class PortalNotificationQueueQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsIn(['pending', 'sending', 'sent', 'failed', 'cancelled']) status?: string;
}
export class PortalNotificationPreviewDto {
  @IsIn(NOTIFICATION_KINDS) kind!: PortalNotificationKind;
  @IsObject() variables!: Record<string, string>;
}
export class PortalSchedulePreviewDto {
  @IsString() date!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(28) billingDay!: number;
  @IsOptional() @IsIn(['current', 'previous']) payrollMonthMode: 'current' | 'previous' = 'current';
}
