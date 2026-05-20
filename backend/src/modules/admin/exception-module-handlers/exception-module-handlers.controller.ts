import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { DispatchModuleCode } from 'src/entities';
import { CreateExceptionModuleHandlerDto } from './dto/create-exception-module-handler.dto';
import { UpdateExceptionModuleHandlerDto } from './dto/update-exception-module-handler.dto';
import { ExceptionModuleHandlersService } from './exception-module-handlers.service';

class ListExceptionModuleHandlersQueryDto {
  @IsOptional()
  @IsEnum(DispatchModuleCode)
  moduleCode?: DispatchModuleCode;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerCode?: string;
}

@Roles('admin')
@Controller('admin/exception-module-handlers')
@UseInterceptors(AuditInterceptor)
export class ExceptionModuleHandlersController {
  constructor(private readonly service: ExceptionModuleHandlersService) {}

  @Get()
  list(@Query() query: ListExceptionModuleHandlersQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @Audit('exception_module_handlers', 'create')
  create(@Body() payload: CreateExceptionModuleHandlerDto) {
    return this.service.create(payload);
  }

  @Patch(':id')
  @Audit('exception_module_handlers', 'update')
  patch(@Param('id') id: string, @Body() payload: UpdateExceptionModuleHandlerDto) {
    return this.service.update(id, payload);
  }

  @Put(':id')
  @Audit('exception_module_handlers', 'update')
  update(@Param('id') id: string, @Body() payload: UpdateExceptionModuleHandlerDto) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @Audit('exception_module_handlers', 'delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
