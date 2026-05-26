import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export const REQUIRED_WORK_ORDER_STATUS_ENUM_VALUES = [
  'withdraw_pending',
  'void_pending',
  'void',
] as const;

export const REQUIRED_DISPATCHED_ORDER_STATUS_ENUM_VALUES = [
  'withdraw_pending',
  'withdrawn',
  'void_pending',
  'void',
] as const;

export const REQUIRED_WORK_ORDER_MODULE_COLUMNS = [
  { name: 'sla_hours', ddl: 'ALTER TABLE work_order_modules ADD COLUMN sla_hours integer NULL' },
  { name: 'sla_reminder_before_hours', ddl: 'ALTER TABLE work_order_modules ADD COLUMN sla_reminder_before_hours integer NULL' },
] as const;

export const REQUIRED_DISPATCHED_ORDER_COLUMNS = [
  { name: 'due_at', ddl: 'ALTER TABLE dispatched_orders ADD COLUMN due_at timestamptz NULL' },
  { name: 'sla_hours', ddl: 'ALTER TABLE dispatched_orders ADD COLUMN sla_hours integer NULL' },
  { name: 'sla_reminder_before_hours', ddl: 'ALTER TABLE dispatched_orders ADD COLUMN sla_reminder_before_hours integer NULL' },
  { name: 'void_at', ddl: 'ALTER TABLE dispatched_orders ADD COLUMN void_at timestamptz NULL' },
] as const;

type RequiredColumn = { readonly name: string; readonly ddl: string };

export async function ensureWorkflowRuntimeSchema(dataSource: DataSource, logger?: Logger): Promise<void> {
  await ensureEnumValues(dataSource, 'work_order_status_enum', REQUIRED_WORK_ORDER_STATUS_ENUM_VALUES, logger);
  await ensureEnumValues(dataSource, 'dispatched_order_status_enum', REQUIRED_DISPATCHED_ORDER_STATUS_ENUM_VALUES, logger);
  await ensureColumns(dataSource, 'work_order_modules', REQUIRED_WORK_ORDER_MODULE_COLUMNS, logger);
  await ensureColumns(dataSource, 'dispatched_orders', REQUIRED_DISPATCHED_ORDER_COLUMNS, logger);
  await tryRunDdl(dataSource, 'CREATE INDEX IF NOT EXISTS idx_dispatched_orders_due_at ON dispatched_orders(due_at)', '创建子工单办理时限索引', logger);
}

async function ensureEnumValues(
  dataSource: DataSource,
  enumName: string,
  requiredValues: readonly string[],
  logger?: Logger,
): Promise<void> {
  const rows = await dataSource.query<Array<{ enumlabel: string }>>(
    `
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = current_schema()
        AND t.typname = $1
      ORDER BY e.enumsortorder
    `,
    [enumName],
  );

  if (rows.length === 0) {
    logger?.warn(`数据库枚举 ${enumName} 不存在，可能基础迁移尚未执行，跳过启动兜底检查`);
    return;
  }

  const existing = new Set(rows.map((row) => row.enumlabel));
  for (const value of requiredValues) {
    if (existing.has(value)) continue;
    await tryRunDdl(dataSource, `ALTER TYPE ${enumName} ADD VALUE IF NOT EXISTS '${value}'`, `补齐枚举 ${enumName}.${value}`, logger);
  }
}

async function ensureColumns(
  dataSource: DataSource,
  tableName: string,
  requiredColumns: readonly RequiredColumn[],
  logger?: Logger,
): Promise<void> {
  const rows = await dataSource.query<Array<{ column_name: string }>>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
    `,
    [tableName],
  );

  if (rows.length === 0) {
    logger?.warn(`数据库表 ${tableName} 不存在，可能基础迁移尚未执行，跳过启动兜底检查`);
    return;
  }

  const existing = new Set(rows.map((row) => row.column_name));
  for (const column of requiredColumns) {
    if (existing.has(column.name)) continue;
    await tryRunDdl(dataSource, column.ddl, `补齐字段 ${tableName}.${column.name}`, logger);
  }
}

async function tryRunDdl(dataSource: DataSource, sql: string, label: string, logger?: Logger): Promise<void> {
  try {
    await dataSource.query(sql);
    logger?.log(`${label} 完成`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} 失败：${message}。请先执行数据库迁移，或使用表/枚举 owner 账号运行 npm run seed。`);
  }
}
