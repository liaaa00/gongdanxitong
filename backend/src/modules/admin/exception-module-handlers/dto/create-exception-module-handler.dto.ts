import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { BusinessScope, DispatchModuleCode } from 'src/entities';

export class CreateExceptionModuleHandlerDto {
  @IsEnum(DispatchModuleCode)
  moduleCode!: DispatchModuleCode;

  @IsString()
  @MaxLength(64)
  customerCode!: string;

  @IsUUID()
  handlerId!: string;

  @IsOptional()
  @IsEnum(BusinessScope)
  businessScope?: BusinessScope;
}
