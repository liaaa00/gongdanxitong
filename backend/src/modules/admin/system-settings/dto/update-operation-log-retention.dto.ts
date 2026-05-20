import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateOperationLogRetentionDto {
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(3650)
  days!: number;
}
