export interface PageResult<T> {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  list: T[];
}

export function toPageResult<T>(
  page: number,
  pageSize: number,
  total: number,
  list: T[],
): PageResult<T> {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    list,
  };
}
