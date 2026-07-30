export type DashboardCardsScope = 'mine' | 'team' | 'global' | 'backend_module';

export interface DashboardCardsDto {
  totalThisMonth: number;
  processing: number;
  pendingTotal?: number;
  pending_total?: number;
  totalPending?: number;
  total_pending?: number;
  pendingThisMonth?: number;
  pending_this_month?: number;
  monthPending?: number;
  month_pending?: number;
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

