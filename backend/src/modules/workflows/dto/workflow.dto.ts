import { Transform } from 'class-transformer';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { BusinessScope, OrderType } from 'src/entities';
import { WorkflowDefinitionStatus } from '../workflow.entity';

export class CreateWorkflowDto {
  @IsString()
  @MaxLength(128)
  name!: string;

  @ValidateIf((dto: CreateWorkflowDto) => dto.order_type === undefined && !dto.flowKey)
  @IsEnum(OrderType)
  orderType?: OrderType;

  @ValidateIf((dto: CreateWorkflowDto) => dto.orderType === undefined && !dto.flowKey)
  @IsEnum(OrderType)
  order_type?: OrderType;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string | null;

  @ValidateIf((dto: CreateWorkflowDto) => dto.definition_json === undefined)
  @IsObject()
  definitionJson?: Record<string, unknown>;

  @ValidateIf((dto: CreateWorkflowDto) => dto.definitionJson === undefined)
  @IsObject()
  definition_json?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(BusinessScope)
  businessScope?: BusinessScope;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  flowKey?: string;
}

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsEnum(OrderType)
  orderType?: OrderType;

  @IsOptional()
  @IsEnum(OrderType)
  order_type?: OrderType;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string | null;

  @IsOptional()
  @IsObject()
  definitionJson?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  definition_json?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(BusinessScope)
  businessScope?: BusinessScope;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  flowKey?: string;
}

export class PublishWorkflowDto extends UpdateWorkflowDto {}

export class ListWorkflowQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderType)
  orderType?: OrderType;

  @IsOptional()
  @IsEnum(OrderType)
  order_type?: OrderType;

  @IsOptional()
  @IsEnum(WorkflowDefinitionStatus)
  status?: WorkflowDefinitionStatus;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  keyword?: string;

  @IsOptional()
  @IsEnum(BusinessScope)
  businessScope?: BusinessScope;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  flowKey?: string;
}
