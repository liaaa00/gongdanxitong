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
import { IsBoolean, IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { OrderType } from 'src/entities';
import { CreateDispatchRuleDto } from './dto/create-dispatch-rule.dto';
import { UpdateDispatchRuleDto } from './dto/update-dispatch-rule.dto';
import { DispatchRulesService } from './dispatch-rules.service';

class QueryDispatchRulesDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderType)
  orderType?: OrderType;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}


class SimulateDispatchRuleDto {
  @IsEnum(OrderType)
  orderType!: OrderType;

  @IsObject()
  fields!: Record<string, unknown>;

  @IsOptional()
  @IsUUID('4', { each: true })
  ruleIds?: string[];
}

@Roles('admin')
@Controller('admin/dispatch-rules')
@UseInterceptors(AuditInterceptor)
export class DispatchRulesController {
  constructor(private readonly service: DispatchRulesService) {}

  @Get()
  list(@Query() query: QueryDispatchRulesDto) {
    return this.service.getList(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  @Audit('dispatch_rules', 'create')
  create(@Body() payload: CreateDispatchRuleDto) {
    return this.service.create(payload);
  }

  @Put(':id')
  @Audit('dispatch_rules', 'update')
  update(@Param('id') id: string, @Body() payload: UpdateDispatchRuleDto) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @Audit('dispatch_rules', 'delete')
  delete(@Param('id') id: string) {
    return this.service.softDelete(id);
  }

  @Post('simulate')
  @Audit('dispatch_rules', 'simulate')
  simulate(@Body() payload: SimulateDispatchRuleDto) {
    return this.service.simulate(payload);
  }
}
