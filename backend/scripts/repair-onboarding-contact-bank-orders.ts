import AppDataSource from '../src/database/data-source';

type RepairCandidate = {
  parent_id: string;
  order_no: string;
  parent_status: string;
  created_by: string;
  employee_name: string;
  child_id: string;
  child_status: string;
  handler_id: string | null;
  accepted_at: string | null;
  missing_fields: string[];
  extra_data: Record<string, unknown>;
};

type RepairOptions = {
  date: string;
  businessScope?: string;
  apply: boolean;
  confirmProduction: boolean;
};

const BANK_FIELDS: Array<{ code: string; name: string }> = [
  { code: 'bank_name', name: '开户银行' },
  { code: 'bank_account', name: '银行卡号' },
  { code: 'bank_location', name: '开户地' },
  { code: 'payroll_location', name: '发薪地' },
];

function parseOptions(argv: string[]): RepairOptions {
  const dateArg = argv.find((arg) => arg.startsWith('--date='));
  const date = dateArg?.slice('--date='.length) ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('必须指定 --date=YYYY-MM-DD');
  }
  const scopeArg = argv.find((arg) => arg.startsWith('--business-scope='));
  return {
    date,
    businessScope: scopeArg?.slice('--business-scope='.length) || undefined,
    apply: argv.includes('--apply'),
    confirmProduction: argv.includes('--confirm-production'),
  };
}

function missingFields(extraData: Record<string, unknown>): string[] {
  return BANK_FIELDS
    .filter(({ code }) => String(extraData[code] ?? '').trim() === '')
    .map(({ name }) => name);
}

async function findCandidates(options: RepairOptions): Promise<RepairCandidate[]> {
  const params: unknown[] = [options.date];
  const queryLines = [
    'SELECT wo.id AS parent_id, wo.order_no, wo.status AS parent_status,',
    '       wo.created_by, wo.employee_name, child.id AS child_id,',
    '       child.status AS child_status, child.handler_id, child.accepted_at, wo.extra_data',
    'FROM work_orders wo',
    'INNER JOIN dispatched_orders child',
    "  ON child.parent_order_id = wo.id AND child.module_code = 'onboarding_contact'",
    "WHERE wo.order_type = 'onboarding'",
    "  AND wo.created_at >= ($1::date AT TIME ZONE 'Asia/Shanghai')",
    "  AND wo.created_at < (($1::date + 1) AT TIME ZONE 'Asia/Shanghai')",
  ];
  if (options.businessScope) {
    params.push(options.businessScope);
    queryLines.push('  AND wo.business_scope = $2');
  }
  queryLines.push(
    "  AND wo.status IN ('pending', 'processing', 'returned')",
    "  AND LOWER(BTRIM(COALESCE(wo.extra_data ->> 'need_payroll_slip', ''))) IN ('是', '1是', '1.是', 'yes', 'y', 'true', '1')",
    "  AND LOWER(BTRIM(COALESCE(wo.extra_data ->> 'need_onboarding_contact', ''))) IN ('否', '2', '2否', '2.否', 'no', 'n', 'false', '0')",
    "  AND (NULLIF(BTRIM(wo.extra_data ->> 'bank_name'), '') IS NULL",
    "    OR NULLIF(BTRIM(wo.extra_data ->> 'bank_account'), '') IS NULL",
    "    OR NULLIF(BTRIM(wo.extra_data ->> 'bank_location'), '') IS NULL",
    "    OR NULLIF(BTRIM(wo.extra_data ->> 'payroll_location'), '') IS NULL)",
    'ORDER BY wo.created_at ASC, wo.order_no ASC',
  );

  const rows = await AppDataSource.query(queryLines.join('\n'), params) as RepairCandidate[];
  return rows.map((row) => ({
    ...row,
    missing_fields: missingFields(row.extra_data ?? {}),
  }));
}

async function applyRepair(candidate: RepairCandidate, date: string): Promise<boolean> {
  return AppDataSource.transaction(async (manager) => {
    const childRows = await manager.query(
      'SELECT id, status, handler_id, accepted_at FROM dispatched_orders WHERE id = $1 FOR UPDATE',
      [candidate.child_id],
    ) as Array<Record<string, unknown>>;
    const child = childRows[0];
    if (!child || child.status !== 'pending' || child.handler_id !== null || child.accepted_at !== null) {
      return false;
    }

    const reason = '历史错误派发修复：' + date + ' 导入时未集约收集但银行卡资料不完整';
    await manager.query(
      "UPDATE dispatched_orders SET status = 'void', void_at = NOW(), completed_at = COALESCE(completed_at, NOW()), return_reason = $2, updated_at = NOW() WHERE id = $1",
      [candidate.child_id, reason],
    );
    await manager.query(
      "UPDATE work_orders SET status = CASE WHEN status IN ('pending', 'processing') THEN 'returned' ELSE status END, completed_at = NULL, updated_at = NOW() WHERE id = $1",
      [candidate.parent_id],
    );
    await manager.query(
      "INSERT INTO operation_logs (entity_type, entity_id, user_id, action_type, before_data, after_data, ip_address) VALUES ('dispatched_order', $1, NULL, 'historical_wrong_onboarding_contact_repair', $2::jsonb, $3::jsonb, 'repair-script')",
      [
        candidate.child_id,
        JSON.stringify({ parentId: candidate.parent_id, parentStatus: candidate.parent_status, childStatus: child.status, missingFields: candidate.missing_fields }),
        JSON.stringify({ parentStatus: 'returned', childStatus: 'void', reason }),
      ],
    );
    await manager.query(
      "INSERT INTO notifications (user_id, biz_type, title, content, link, payload, is_read, read_at) VALUES ($1, 'historical_data_repair', '入职工单需要补齐银行卡资料', $2, $3, $4::jsonb, false, NULL)",
      [
        candidate.created_by,
        '工单 ' + candidate.order_no + ' 的工资单银行卡资料不完整，错误的入职联系子工单已作废，请补齐开户银行、银行卡号、开户地和发薪地后重新提交。',
        '/work-orders/' + candidate.parent_id,
        JSON.stringify({ type: 'historical_wrong_onboarding_contact_repair', parentOrderId: candidate.parent_id, childOrderId: candidate.child_id, missingFields: candidate.missing_fields }),
      ],
    );
    return true;
  });
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production' && options.apply && !options.confirmProduction) {
    throw new Error('production 环境执行 --apply 必须同时提供 --confirm-production');
  }

  await AppDataSource.initialize();
  try {
    const matched = await findCandidates(options);
    const candidates = matched.filter((item) => (
      item.child_status === 'pending'
      && item.handler_id === null
      && item.accepted_at === null
    ));
    const manualReview = matched.filter((item) => !candidates.includes(item));
    console.log('匹配错误工单：' + matched.length + ' 条；可自动修复：' + candidates.length + ' 条；需人工复核：' + manualReview.length + ' 条（日期 ' + options.date + (options.businessScope ? '，账套 ' + options.businessScope : '') + '）');
    for (const candidate of matched) {
      console.log(JSON.stringify({
        disposition: candidates.includes(candidate) ? 'auto_repair' : 'manual_review',
        orderNo: candidate.order_no,
        parentId: candidate.parent_id,
        childId: candidate.child_id,
        parentStatus: candidate.parent_status,
        childStatus: candidate.child_status,
        handlerId: candidate.handler_id,
        acceptedAt: candidate.accepted_at,
        missingFields: candidate.missing_fields,
      }));
    }
    if (!options.apply || candidates.length === 0) {
      console.log(options.apply ? '没有可自动修复的候选。' : '只读盘点完成；如确认 auto_repair 清单无误，再追加 --apply 执行修复。');
      return;
    }

    let repaired = 0;
    for (const candidate of candidates) {
      if (await applyRepair(candidate, options.date)) repaired += 1;
    }
    console.log('已修复 ' + repaired + ' 条；每条均已将父单退回创建人、作废错误入职联系子单并写入日志/通知。');
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

main().catch(async (error: unknown) => {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  console.error('历史入职联系修复失败，事务已回滚。');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
