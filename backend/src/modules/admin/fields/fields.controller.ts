import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ADMIN_ROLE,
  BUSINESS_LEADER_ROLES,
  BUSINESS_MEMBER_ROLES,
  SOCIAL_INSURANCE_MODULE_ROLES,
} from 'src/common/auth/role-permissions';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { FieldType, OrderType } from 'src/entities';
import { FieldsService } from './fields.service';

class QueryFieldsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  orderType?: OrderType | 'common';
}

class SaveFieldDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,63}$/)
  fieldCode!: string;

  @IsString()
  fieldName!: string;

  @IsEnum(FieldType)
  fieldType!: FieldType;

  @Type(() => Boolean)
  @IsBoolean()
  isRequired!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  defaultRequired!: boolean;

  @IsOptional()
  @IsString()
  validationRegex?: string | null;

  @IsOptional()
  @IsString()
  validationMsg?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dropdownOptions?: string[] | null;

  @IsOptional()
  @IsString()
  placeholder?: string | null;

  @IsOptional()
  @IsString()
  helpText?: string | null;

  @IsOptional()
  @IsEnum(OrderType)
  orderType?: OrderType | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

class UpdateFieldDto {
  @IsOptional()
  @IsString()
  fieldName?: string;

  @IsOptional()
  @IsEnum(FieldType)
  fieldType?: FieldType;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  defaultRequired?: boolean;

  @IsOptional()
  @IsString()
  validationRegex?: string | null;

  @IsOptional()
  @IsString()
  validationMsg?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dropdownOptions?: string[] | null;

  @IsOptional()
  @IsString()
  placeholder?: string | null;

  @IsOptional()
  @IsString()
  helpText?: string | null;

  @IsOptional()
  @IsEnum(OrderType)
  orderType?: OrderType | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

class ReorderItemDto {
  @IsString()
  id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder!: number;
}

class ReorderFieldsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}

const WORK_ORDER_FIELD_READ_ROLES = [
  ADMIN_ROLE,
  ...BUSINESS_LEADER_ROLES,
  ...BUSINESS_MEMBER_ROLES,
  ...SOCIAL_INSURANCE_MODULE_ROLES,
];

@Controller(['admin/fields', 'field-configs'])
@Roles(ADMIN_ROLE)
@UseInterceptors(AuditInterceptor)
export class FieldsController {
  constructor(private readonly service: FieldsService) {}

  @Get()
  list(@Query() query: QueryFieldsDto) {
    return this.service.list(query);
  }

  @Get('baseline')
  baseline() {
    return this.service.list({ page: 1, pageSize: 100 });
  }

  @Post()
  @Audit('field_configs', 'create')
  create(@Body() payload: SaveFieldDto) {
    return this.service.create(payload);
  }

  @Put(':id')
  @Audit('field_configs', 'update')
  update(@Param('id') id: string, @Body() payload: UpdateFieldDto) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @Audit('field_configs', 'delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('reorder')
  @Audit('field_configs', 'reorder')
  reorder(@Body() payload: ReorderFieldsDto) {
    return this.service.reorder(payload.items);
  }
}

@Controller('work-order-fields')
@Roles(...WORK_ORDER_FIELD_READ_ROLES)
export class WorkOrderFieldsController {
  constructor(private readonly service: FieldsService) {}

  @Get()
  list(@Query() query: QueryFieldsDto) {
    return this.service.list(query);
  }

  @Get('baseline')
  baseline() {
    return this.service.list({ page: 1, pageSize: 100 });
  }
}
