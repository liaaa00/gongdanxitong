import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { DispatchedOrderStatus } from 'src/entities';

type MultiQueryValue = string | string[];

function normalizeMultiQueryValue(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const values = Array.isArray(value) ? value : [value];
  const normalized = values
    .flatMap((item) => String(item ?? '').split(','))
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

export class ListDispatchedOrderQueryDto extends PaginationQueryDto {
  @IsOptional()
  moduleCode?: MultiQueryValue;

  @IsOptional()
  module_code?: MultiQueryValue;

  @IsOptional()
  @IsString()
  moduleName?: string;

  @IsOptional()
  @IsString()
  nodeType?: string;

  @IsOptional()
  @IsString()
  pool?: string;

  /**
   * Dashboard list fallback sends a scope hint (mine/team) when it builds matrix
   * rows from /dispatched-orders. The list endpoint already applies user scope
   * from JWT roles, so this field is accepted only to satisfy the global
   * whitelist validation contract and avoid a 400 during dashboard bootstrap.
   */
  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  handlerId?: MultiQueryValue;

  @IsOptional()
  handler_id?: MultiQueryValue;

  /** Alias used by some table filters for handler/assignee multi-select. */
  @IsOptional()
  assignee?: MultiQueryValue;

  @IsOptional()
  assigneeId?: MultiQueryValue;

  @IsOptional()
  assignee_id?: MultiQueryValue;

  @IsOptional()
  @Transform(({ value }) => normalizeMultiQueryValue(value))
  @IsString({ each: true })
  status?: DispatchedOrderStatus[] | string[];

  /** Comma-separated or repeated status list, e.g. pending,processing. */
  @IsOptional()
  @Transform(({ value }) => normalizeMultiQueryValue(value))
  @IsString({ each: true })
  statuses?: MultiQueryValue;

  /** Alias for statuses, kept for compatibility with table/query helpers. */
  @IsOptional()
  @Transform(({ value }) => normalizeMultiQueryValue(value))
  @IsString({ each: true })
  statusIn?: MultiQueryValue;

  @IsOptional()
  orderType?: MultiQueryValue;

  @IsOptional()
  order_type?: MultiQueryValue;

  /** Alias used by generic table filters for work order type. */
  @IsOptional()
  type?: MultiQueryValue;

  @IsOptional()
  departmentId?: MultiQueryValue;

  @IsOptional()
  department_id?: MultiQueryValue;

  @IsOptional()
  department?: MultiQueryValue;

  @IsOptional()
  @IsString()
  orderNo?: string;

  @IsOptional()
  @IsString()
  order_no?: string;

  @IsOptional()
  @IsString()
  customerCode?: string;

  @IsOptional()
  @IsString()
  customer_code?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customer_name?: string;

  @IsOptional()
  @IsString()
  employeeName?: string;

  @IsOptional()
  @IsString()
  employee_name?: string;

  @IsOptional()
  @IsString()
  idCardNo?: string;

  @IsOptional()
  @IsString()
  employeeIdCard?: string;

  @IsOptional()
  @IsString()
  employee_id_card?: string;

  @IsOptional()
  @IsString()
  orderMonth?: string;

  @IsOptional()
  @IsString()
  order_month?: string;

  @IsOptional()
  @IsString()
  dispatchedFrom?: string;

  @IsOptional()
  @IsString()
  dispatchedTo?: string;

  @IsOptional()
  @IsString()
  completedFrom?: string;

  @IsOptional()
  @IsString()
  completedTo?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeReturned?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  onlyPool?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  onlyUnclaimed?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  onlyDirty?: boolean;
}
