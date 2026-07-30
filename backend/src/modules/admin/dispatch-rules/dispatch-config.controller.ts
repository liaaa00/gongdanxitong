import { Body, Controller, Get, Param, Put, UseInterceptors } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { DispatchStrategy } from 'src/entities';
import { DispatchConfigResponse, DispatchRulesService } from './dispatch-rules.service';

class SaveModuleDispatchConfigDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  handlerIds!: string[];

  @IsEnum(DispatchStrategy)
  dispatchStrategy!: DispatchStrategy;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  slaHours?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  slaReminderBeforeHours?: number | null;

  @Type(() => Boolean)
  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  changeReason?: string;
}

@Roles('admin')
@Controller('admin')
@UseInterceptors(AuditInterceptor)
export class DispatchConfigController {
  constructor(private readonly service: DispatchRulesService) {}

  @Get('dispatch-config')
  getDispatchConfig(): Promise<DispatchConfigResponse> {
    return this.service.getDispatchConfig();
  }

  @Put('dispatch-config/:moduleCode')
  @Audit('dispatch_config', 'save')
  saveModuleDispatchConfig(
    @Param('moduleCode') moduleCode: string,
    @Body() payload: SaveModuleDispatchConfigDto,
  ) {
    return this.service.saveModuleDispatchConfig(moduleCode, payload);
  }
}
