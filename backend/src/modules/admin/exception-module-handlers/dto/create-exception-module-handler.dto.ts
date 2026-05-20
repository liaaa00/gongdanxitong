import { IsEnum, IsString, IsUUID, MaxLength } from 'class-validator';
import { DispatchModuleCode } from 'src/entities';

export class CreateExceptionModuleHandlerDto {
  @IsEnum(DispatchModuleCode)
  moduleCode!: DispatchModuleCode;

  @IsString()
  @MaxLength(64)
  customerCode!: string;

  @IsUUID()
  handlerId!: string;
}
