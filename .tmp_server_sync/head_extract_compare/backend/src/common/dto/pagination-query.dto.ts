import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

function normalizePositiveInt(value: unknown, fallback: number, max?: number): number {
  const numeric = Number(value);
  const integer = Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
  const boundedMin = Math.max(1, integer);
  return typeof max === 'number' ? Math.min(max, boundedMin) : boundedMin;
}

export function normalizePageSize(value: unknown): number {
  return normalizePositiveInt(value, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
}

export class PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => normalizePositiveInt(value, DEFAULT_PAGE))
  @IsInt()
  @Min(1)
  page = DEFAULT_PAGE;

  /**
   * Ant Design ProTable sends `current` as the current page number.
   * Keep accepting `page` as the canonical backend parameter while allowing
   * `current` to pass whitelist validation for real frontend requests.
   */
  @IsOptional()
  @Transform(({ value }) => normalizePositiveInt(value, DEFAULT_PAGE))
  @IsInt()
  @Min(1)
  current?: number;

  @IsOptional()
  @Transform(({ value }) => normalizePageSize(value))
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize = DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  sort?: string;
}
