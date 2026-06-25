import { QueryRunner } from 'typeorm';
import { WorkOrderStatus, WORK_ORDER_TERMINAL_STATUSES } from 'src/entities/enums';
import { WorkOrderStatusExtend20260520000000 } from 'src/database/migrations/20260520000000-WorkOrderStatusExtend';

describe('WorkOrderStatus extension', () => {
  it('defines withdraw/void pending statuses and void terminal status', () => {
    expect(WorkOrderStatus.WITHDRAW_PENDING).toBe('withdraw_pending');
    expect(WorkOrderStatus.VOID_PENDING).toBe('void_pending');
    expect(WorkOrderStatus.VOID).toBe('void');
  });

  it('exports reusable terminal statuses', () => {
    expect(WORK_ORDER_TERMINAL_STATUSES).toEqual([
      WorkOrderStatus.COMPLETED,
      WorkOrderStatus.WITHDRAWN,
      WorkOrderStatus.VOID,
    ]);
  });

  it('upgrades PostgreSQL enum with separate ADD VALUE statements', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
    } as unknown as QueryRunner;

    await new WorkOrderStatusExtend20260520000000().up(queryRunner);

    expect(queries).toEqual([
      "ALTER TYPE work_order_status_enum ADD VALUE IF NOT EXISTS 'withdraw_pending'",
      "ALTER TYPE work_order_status_enum ADD VALUE IF NOT EXISTS 'void_pending'",
      "ALTER TYPE work_order_status_enum ADD VALUE IF NOT EXISTS 'void'",
    ]);
  });

  it('keeps down migration intentionally irreversible', async () => {
    const queryRunner = {
      query: jest.fn(),
    } as unknown as QueryRunner;

    await new WorkOrderStatusExtend20260520000000().down(queryRunner);

    expect(queryRunner.query).not.toHaveBeenCalled();
  });
});
