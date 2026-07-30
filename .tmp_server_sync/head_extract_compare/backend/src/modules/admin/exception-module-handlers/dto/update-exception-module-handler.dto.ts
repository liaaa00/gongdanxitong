import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DispatchModuleCode } from 'src/entities';

export class UpdateExceptionModuleHandlerDto {
  @IsOptional()
  @IsEnum(DispatchModuleCode)
  moduleCode?: DispatchModuleCode;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerCode?: string;

  @IsOptional()
  @IsUUID()
  handlerId?: string;
}
