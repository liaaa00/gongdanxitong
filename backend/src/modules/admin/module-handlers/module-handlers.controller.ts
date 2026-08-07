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
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { BusinessScope } from 'src/entities';
import { ModuleHandlersService } from './module-handlers.service';

class SaveModuleHandlerDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,63}$/)
  moduleCode!: string;

  @IsUUID()
  handlerId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weight?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isBackup?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Matches(/^(beilun|out_of_province)$/)
  businessScope?: BusinessScope;
}

@Roles('admin')
@Controller('admin/module-handlers')
@UseInterceptors(AuditInterceptor)
export class ModuleHandlersController {
  constructor(private readonly service: ModuleHandlersService) {}

  @Get()
  list(
    @Query('moduleCode') moduleCode?: string,
    @Query('isActive') isActive?: string,
    @Query('businessScope') businessScope?: BusinessScope,
  ) {
    const activeFilter = isActive === undefined ? undefined : isActive === 'true';
    return this.service.list(moduleCode, activeFilter, businessScope);
  }

  @Post()
  @Audit('module_handlers', 'create')
  create(@Body() payload: SaveModuleHandlerDto, @Query('businessScope') businessScope?: BusinessScope) {
    return this.service.create({ ...payload, businessScope: payload.businessScope ?? businessScope });
  }

  @Put(':id')
  @Audit('module_handlers', 'update')
  update(@Param('id') id: string, @Body() payload: Partial<SaveModuleHandlerDto>, @Query('businessScope') businessScope?: BusinessScope) {
    return this.service.update(id, { ...payload, businessScope: payload.businessScope ?? businessScope });
  }

  @Delete(':id')
  @Audit('module_handlers', 'delete')
  remove(@Param('id') id: string, @Query('businessScope') businessScope?: BusinessScope) {
    return this.service.remove(id, businessScope);
  }
}
