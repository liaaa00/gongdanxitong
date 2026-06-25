export const isMockMode = import.meta.env.VITE_USE_MOCK === 'true' || import.meta.env.MODE === 'test';

export function mockDelay<T>(data: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

export interface PageParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  [key: string]: unknown;
}

export interface PageResult<T> {
  list: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  success: boolean;
  error?: string;
}
