import { IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { BusinessScope } from 'src/entities';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsEnum(BusinessScope)
  businessScope?: BusinessScope;
}
