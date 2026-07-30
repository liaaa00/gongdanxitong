import { Body, Controller, Delete, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { ModuleDelegationsService } from './module-delegations.service';

class CreateModuleDelegationDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,63}$/)
  moduleCode!: string;

  @IsUUID()
  sourceHandlerId!: string;

  @IsOptional()
  @IsUUID()
  delegateHandlerId?: string | null;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  reason!: string;
}

@Roles('admin')
@Controller('admin/module-delegations')
@UseInterceptors(AuditInterceptor)
export class ModuleDelegationsController {
  constructor(private readonly service: ModuleDelegationsService) {}

  @Get()
  list(
    @Query('moduleCode') moduleCode?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.list(moduleCode, includeInactive === 'true');
  }

  @Post()
  @Audit('module_delegations', 'create')
  create(@Body() payload: CreateModuleDelegationDto, @CurrentUser() user: JwtUserPayload) {
    return this.service.create(payload, user.sub);
  }

  @Delete(':id')
  @Audit('module_delegations', 'cancel')
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }
}
