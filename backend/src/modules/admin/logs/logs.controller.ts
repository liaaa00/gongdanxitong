import { Controller, Get, Param, Query } from '@nestjs/common';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { LogsService } from './logs.service';

class QueryLogsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entity_type?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  entity_id?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  operatorId?: string;

  @IsOptional()
  @IsString()
  actionCode?: string;

  @IsOptional()
  @IsString()
  actionType?: string;

  @IsOptional()
  @IsString()
  action_type?: string;

  @IsOptional()
  @IsString()
  startAt?: string;

  @IsOptional()
  @IsString()
  endAt?: string;
}

@Roles('admin')
@Controller('admin/logs')
export class LogsController {
  constructor(private readonly service: LogsService) {}

  @Get()
  list(@Query() query: QueryLogsDto) {
    return this.service.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }
}

@Controller('operation-logs')
export class OperationLogsController {
  constructor(private readonly service: LogsService) {}

  @Get()
  list(@Query() query: QueryLogsDto) {
    return this.service.list(query);
  }
}
