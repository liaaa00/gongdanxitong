import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VoidWorkOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  reason!: string;
}
