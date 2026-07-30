import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class BatchDeleteWorkOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids!: string[];
}
