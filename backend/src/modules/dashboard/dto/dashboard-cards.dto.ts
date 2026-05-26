export type DashboardCardsScope = 'mine' | 'team' | 'global' | 'backend_module';

export interface DashboardCardsDto {
  totalThisMonth: number;
  processing: number;
  completed: number;
  myMessages: number;
  scope?: DashboardCardsScope;
}
