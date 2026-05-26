import { DataSource } from 'typeorm';
import {
  ensureWorkflowRuntimeSchema,
  REQUIRED_DISPATCHED_ORDER_STATUS_ENUM_VALUES,
  REQUIRED_WORK_ORDER_STATUS_ENUM_VALUES,
} from 'src/database/seeds/database-schema-guard';

function makeDataSource(responses: unknown[][]) {
  const query = jest.fn(async (sql: string) => {
    if (/^\s*(ALTER|CREATE)\b/i.test(sql)) return [];
    return responses.shift() ?? [];
  });
  return { query } as unknown as DataSource & { query: jest.Mock };
}

describe('database schema guard', () => {
  it('repairs workflow runtime enum values, columns and due_at index', async () => {
    const dataSource = makeDataSource([
      [{ enumlabel: 'draft' }, { enumlabel: 'pending' }, { enumlabel: 'processing' }, { enumlabel: 'completed' }, { enumlabel: 'returned' }, { enumlabel: 'withdrawn' }],
      [{ enumlabel: 'pending' }, { enumlabel: 'processing' }, { enumlabel: 'completed' }, { enumlabel: 'returned' }],
      [{ column_name: 'sla_hours' }],
      [{ column_name: 'due_at' }],
    ]);

    await ensureWorkflowRuntimeSchema(dataSource);

    const ddl = dataSource.query.mock.calls.map((call) => call[0]).filter((sql: string) => /^(ALTER|CREATE)\b/i.test(sql));
    expect(ddl).toEqual([
      "ALTER TYPE work_order_status_enum ADD VALUE IF NOT EXISTS 'withdraw_pending'",
      "ALTER TYPE work_order_status_enum ADD VALUE IF NOT EXISTS 'void_pending'",
      "ALTER TYPE work_order_status_enum ADD VALUE IF NOT EXISTS 'void'",
      "ALTER TYPE dispatched_order_status_enum ADD VALUE IF NOT EXISTS 'withdraw_pending'",
      "ALTER TYPE dispatched_order_status_enum ADD VALUE IF NOT EXISTS 'withdrawn'",
      "ALTER TYPE dispatched_order_status_enum ADD VALUE IF NOT EXISTS 'void_pending'",
      "ALTER TYPE dispatched_order_status_enum ADD VALUE IF NOT EXISTS 'void'",
      'ALTER TABLE work_order_modules ADD COLUMN sla_reminder_before_hours integer NULL',
      'ALTER TABLE dispatched_orders ADD COLUMN sla_hours integer NULL',
      'ALTER TABLE dispatched_orders ADD COLUMN sla_reminder_before_hours integer NULL',
      'ALTER TABLE dispatched_orders ADD COLUMN void_at timestamptz NULL',
      'CREATE INDEX IF NOT EXISTS idx_dispatched_orders_due_at ON dispatched_orders(due_at)',
    ]);
  });

  it('does not alter existing enum values and columns except idempotent index creation', async () => {
    const dataSource = makeDataSource([
      REQUIRED_WORK_ORDER_STATUS_ENUM_VALUES.map((enumlabel) => ({ enumlabel })),
      REQUIRED_DISPATCHED_ORDER_STATUS_ENUM_VALUES.map((enumlabel) => ({ enumlabel })),
      [{ column_name: 'sla_hours' }, { column_name: 'sla_reminder_before_hours' }],
      [{ column_name: 'due_at' }, { column_name: 'sla_hours' }, { column_name: 'sla_reminder_before_hours' }, { column_name: 'void_at' }],
    ]);

    await ensureWorkflowRuntimeSchema(dataSource);

    const ddl = dataSource.query.mock.calls.map((call) => call[0]).filter((sql: string) => /^(ALTER|CREATE)\b/i.test(sql));
    expect(ddl).toEqual(['CREATE INDEX IF NOT EXISTS idx_dispatched_orders_due_at ON dispatched_orders(due_at)']);
  });

  it('reports a business-friendly error when the database user cannot repair schema', async () => {
    const dataSource = {
      query: jest.fn(async (sql: string) => {
        if (/^\s*SELECT/i.test(sql)) return [{ enumlabel: 'pending' }];
        throw new Error('must be owner of type work_order_status_enum');
      }),
    } as unknown as DataSource;

    await expect(ensureWorkflowRuntimeSchema(dataSource)).rejects.toThrow('请先执行数据库迁移');
  });
});
