export type DashboardCardsScope = 'mine' | 'team' | 'global' | 'backend_module';

export interface DashboardCardsDto {
  totalThisMonth: number;
  processing: number;
  completed: number;
  voided?: number;
  voidCount?: number;
  void_count?: number;
  myMessages: number;
  scope?: DashboardCardsScope;
}
