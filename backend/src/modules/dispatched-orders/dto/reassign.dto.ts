import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ReassignDispatchedOrderDto {
  @IsOptional()
  @IsUUID()
  handlerId?: string;

  @IsOptional()
  @IsUUID()
  handler_id?: string;

  @IsOptional()
  @IsUUID()
  newHandlerId?: string;

  @IsOptional()
  @IsUUID()
  new_handler_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}
