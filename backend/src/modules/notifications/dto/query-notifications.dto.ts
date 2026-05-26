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
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeDispatch?: boolean;

  @IsOptional()
  @IsString()
  priority?: string;

  /** 按 bucket 分类过滤（与 countUnreadByBucket 口径一致）。 */
  @IsOptional()
  @IsString()
  bucket?: string;

  @IsOptional()
  @IsIn(['biz_type'])
  groupBy?: 'biz_type';

  @IsOptional()
  @IsIn(['biz_type'])
  group_by?: 'biz_type';
}
