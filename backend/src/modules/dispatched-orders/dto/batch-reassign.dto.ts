import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum BatchReassignStrategy {
  SINGLE = 'single',
  ROUND_ROBIN = 'round_robin',
  LOAD_BALANCE = 'load_balance',
}

export class BatchReassignDispatchedOrdersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  handlerIds!: string[];

  @IsEnum(BatchReassignStrategy)
  strategy!: BatchReassignStrategy;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  reason!: string;
}
