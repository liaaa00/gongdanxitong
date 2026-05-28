export type DashboardCardsScope = 'mine' | 'team' | 'global' | 'backend_module';

export interface DashboardCardsDto {
  totalThisMonth: number;
  processing: number;
  completed: number;
  // completed / (totalThisMonth - voided); returns 0 when denominator <= 0.
  completionRate?: number;
  completion_rate?: number;
  voided?: number;
  voidCount?: number;
  void_count?: number;
  myMessages: number;
  scope?: DashboardCardsScope;
}
