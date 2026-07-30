import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BatchReassignStrategy } from 'src/modules/dispatched-orders/dto/batch-reassign.dto';

export class ExecuteUserHandoverDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  replacementUserIds!: string[];

  @IsEnum(BatchReassignStrategy)
  strategy!: BatchReassignStrategy;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  reason!: string;
}
