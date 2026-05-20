import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export class QueryNotificationsDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isRead?: boolean;

  /** Frontend compatibility: unread=true means isRead=false. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unread?: boolean;

  @IsOptional()
  @IsString()
  bizType?: string;

  @IsOptional()
  @IsString()
  biz_type?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsIn(['biz_type'])
  groupBy?: 'biz_type';

  @IsOptional()
  @IsIn(['biz_type'])
  group_by?: 'biz_type';
}
