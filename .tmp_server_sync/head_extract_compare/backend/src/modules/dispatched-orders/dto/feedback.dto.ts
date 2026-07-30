import { IsOptional, IsString, MaxLength } from 'class-validator';

export class FeedbackDispatchedOrderDto {
  @IsOptional()
  @IsString()
  social_insurance_result?: string;

  @IsOptional()
  @IsString()
  social_insurance_remark?: string;

  @IsOptional()
  @IsString()
  medical_insurance_result?: string;

  @IsOptional()
  @IsString()
  housing_fund_result?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  remark?: string;
}
