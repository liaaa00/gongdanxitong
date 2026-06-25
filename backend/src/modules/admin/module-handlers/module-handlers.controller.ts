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
}

@Roles('admin')
@Controller('admin/module-handlers')
@UseInterceptors(AuditInterceptor)
export class ModuleHandlersController {
  constructor(private readonly service: ModuleHandlersService) {}

  @Get()
  list(@Query('moduleCode') moduleCode?: string, @Query('isActive') isActive?: string) {
    const activeFilter = isActive === undefined ? undefined : isActive === 'true';
    return this.service.list(moduleCode, activeFilter);
  }

  @Post()
  @Audit('module_handlers', 'create')
  create(@Body() payload: SaveModuleHandlerDto) {
    return this.service.create(payload);
  }

  @Put(':id')
  @Audit('module_handlers', 'update')
  update(@Param('id') id: string, @Body() payload: Partial<SaveModuleHandlerDto>) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @Audit('module_handlers', 'delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
