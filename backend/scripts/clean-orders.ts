import AppDataSource from '../src/database/data-source';

interface CleanTarget {
  table: string;
  description: string;
}

const CLEAN_TARGETS: CleanTarget[] = [
  { table: 'import_jobs', description: 'Excel 导入任务记录' },
  { table: 'notifications', description: '通知记录' },
  { table: 'operation_logs', description: '操作日志记录' },
  { table: 'work_orders', description: '主工单（会级联清理 dispatched_orders / dirty_marks / attachments / stages / supplements / return_records）' },
];

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function tableExists(schema: string, table: string): Promise<boolean> {
  const rows = (await AppDataSource.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2
     ) AS exists`,
    [schema, table],
  )) as Array<{ exists: boolean }>;
  return Boolean(rows[0]?.exists);
}

async function deleteAllRows(schema: string, table: string): Promise<number> {
  const qualifiedTable = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
  const rows = (await AppDataSource.query(
    `WITH deleted AS (
       DELETE FROM ${qualifiedTable}
       RETURNING 1
     )
     SELECT COUNT(*)::int AS deleted_count FROM deleted`,
  )) as Array<{ deleted_count: number | string }>;
  return Number(rows[0]?.deleted_count ?? 0);
}

async function cleanOrders(): Promise<void> {
  if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') {
    console.error('❌ 拒绝在 production 环境执行 db:clean-orders。');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  if (!args.includes('--confirm')) {
    console.error('⚠ 未提供 --confirm 参数。这是一个清理脚本，会删除所有工单、导入、通知和相关操作流水数据。');
    console.error('执行方法：npm run db:clean-orders -- --confirm');
    process.exit(1);
  }

  const schema = process.env.DB_SCHEMA ?? 'public';
  const cleaned: Array<{ table: string; deleted: number; description: string }> = [];
  const skipped: string[] = [];

  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async () => {
      for (const target of CLEAN_TARGETS) {
        if (!(await tableExists(schema, target.table))) {
          skipped.push(target.table);
          console.log(`- SKIP ${target.table}: 表不存在`);
          continue;
        }

        const deleted = await deleteAllRows(schema, target.table);
        cleaned.push({ table: target.table, deleted, description: target.description });
        console.log(`- DELETE ${target.table}: ${deleted} 行（${target.description}）`);
      }
    });

    const total = cleaned.reduce((sum, item) => sum + item.deleted, 0);
    console.log('');
    console.log(`✅ 工单数据已清理，共删除 ${total} 行。`);
    console.log('已保留底数据：customers/branches、departments/teams、users/user_roles、field_configs/field_permissions、module_handlers/dispatch_rules/exception_module_handlers、module_configs、system_settings/ai_settings。');
    if (skipped.length > 0) {
      console.log(`跳过不存在的兼容表：${skipped.join(', ')}`);
    }
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

cleanOrders().catch(async (error: unknown) => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  console.error('❌ 工单数据清理失败，事务已回滚。');
  console.error(error);
  process.exit(1);
});
