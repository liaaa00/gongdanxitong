import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
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

/**
 * 退回类型：initial_review 为受理阶段「初审不通过」（内部材料审核不通过），
 * authority_review 为办理阶段「审核退回」（政府部门反馈材料有问题）。
 */
export enum InServiceReturnType {
  INITIAL_REVIEW = 'initial_review',
  AUTHORITY_REVIEW = 'authority_review',
}

export class ReasonInServiceOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  reason!: string;

  @IsOptional()
  @IsEnum(InServiceReturnType)
  returnType?: InServiceReturnType;
}

export enum InServiceCancelAction {
  WITHDRAW = 'withdraw',
  VOID = 'void',
}

export class CancelInServiceOrderDto extends ReasonInServiceOrderDto {
  @IsOptional()
  @IsEnum(InServiceCancelAction)
  action: InServiceCancelAction = InServiceCancelAction.VOID;
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
  @IsObject()
  extraData?: Record<string, unknown>;

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
