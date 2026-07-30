import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { InServiceHandleChannel } from 'src/entities';

export class ApproveInServiceOrderDto {
  @IsOptional()
  @IsUUID()
  handlerId?: string;
}

export class ReasonInServiceOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  reason!: string;
}

export class TransferInServiceOrderDto {
  @IsUUID()
  handlerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}

export class StartInServiceProcessingDto {
  @IsEnum(InServiceHandleChannel)
  handleChannel!: InServiceHandleChannel;
}

export class CompleteInServiceOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  attachments?: string[];
}

export class CloseInServiceOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}
