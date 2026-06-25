import { DataSource } from 'typeorm';
import {
  ActionConfig,
  DispatchStrategy,
  ExportTemplate,
  FieldConfig,
  ModuleField,
  ModuleSupervisor,
  User,
  WorkOrderModuleConfig,
} from 'src/entities';

const modules: Array<Partial<WorkOrderModuleConfig>> = [
  { moduleCode: 'onboarding_management', moduleName: '入职管理', moduleType: 'business_module', parentModuleCode: null, displayOrder: 10, description: '第一阶段开放：入职主工单及子单配置' },
  { moduleCode: 'employment_management', moduleName: '在职管理', moduleType: 'business_module', parentModuleCode: null, displayOrder: 20, description: '后台配置保留，第一阶段接口/界面隐藏' },
  { moduleCode: 'resignation_management', moduleName: '离职管理', moduleType: 'business_module', parentModuleCode: null, displayOrder: 30, description: '第一阶段开放：离职办理事项配置' },
  { moduleCode: 'onboarding_contact', moduleName: '入职联系', moduleType: 'sub_module', parentModuleCode: 'onboarding_management', displayOrder: 11, description: '按是否需要入职联系条件生成' },
  { moduleCode: 'contract', moduleName: '劳动合同新签', moduleType: 'sub_module', parentModuleCode: 'onboarding_management', displayOrder: 12, description: '按是否企服发起劳动合同条件生成' },
  { moduleCode: 'data_entry', moduleName: '增员报岗录入', moduleType: 'sub_module', parentModuleCode: 'onboarding_management', displayOrder: 13, description: '入职工单必生成' },
  { moduleCode: 'social_insurance', moduleName: '社保公积金增员', moduleType: 'sub_module', parentModuleCode: 'onboarding_management', displayOrder: 14, description: '入职社保公积金增员，负责人傅倩雯' },
  { moduleCode: 'renewal_contract', moduleName: '劳动合同续签', moduleType: 'sub_module', parentModuleCode: 'employment_management', displayOrder: 21, description: '续签合同办理；第一阶段隐藏' },
  { moduleCode: 'benefit_apply', moduleName: '待遇申报', moduleType: 'sub_module', parentModuleCode: 'employment_management', displayOrder: 22, description: '在职待遇申报办理；第一阶段隐藏' },
  { moduleCode: 'social_insurance_change', moduleName: '社保公积金变更', moduleType: 'sub_module', parentModuleCode: 'employment_management', displayOrder: 23, description: '在职社保公积金变更；第一阶段隐藏' },
  { moduleCode: 'resignation_contact', moduleName: '离职材料收集', moduleType: 'sub_module', parentModuleCode: 'resignation_management', displayOrder: 31, description: '离职材料收集办理' },
  { moduleCode: 'data_entry_resign', moduleName: '减员报岗录入', moduleType: 'sub_module', parentModuleCode: 'resignation_management', displayOrder: 32, description: '离职减员报岗录入' },
  { moduleCode: 'resignation_social_insurance', moduleName: '社保公积金减员', moduleType: 'sub_module', parentModuleCode: 'resignation_management', displayOrder: 33, description: '离职社保公积金减员，负责人傅倩雯' },
  { moduleCode: 'resignation_cert', moduleName: '离职材料收集（历史兼容）', moduleType: 'sub_module', parentModuleCode: 'resignation_management', displayOrder: 99, description: '历史兼容配置，第一阶段不在可见列表展示' },
];

const defaultSlaByModule: Record<string, { slaHours: number; reminderBeforeHours: number }> = {
  data_entry: { slaHours: 24, reminderBeforeHours: 4 },
  onboarding_contact: { slaHours: 24, reminderBeforeHours: 4 },
  contract: { slaHours: 48, reminderBeforeHours: 8 },
  social_insurance: { slaHours: 48, reminderBeforeHours: 8 },
  renewal_contract: { slaHours: 48, reminderBeforeHours: 8 },
  benefit: { slaHours: 48, reminderBeforeHours: 8 },
  benefit_apply: { slaHours: 48, reminderBeforeHours: 8 },
  social_insurance_change: { slaHours: 48, reminderBeforeHours: 8 },
  resignation_contact: { slaHours: 24, reminderBeforeHours: 4 },
  resignation_cert: { slaHours: 24, reminderBeforeHours: 4 },
  data_entry_resign: { slaHours: 24, reminderBeforeHours: 4 },
  resignation_social_insurance: { slaHours: 48, reminderBeforeHours: 8 },
};

const onboardingContactFields = [
  'customer_name', 'customer_code', 'employee_name', 'id_card_no',
  'mobile', 'email',
  'bank_name', 'bank_account',
  'need_onboarding_contact', 'onboarding_feedback',
];

const contractFields = [
  'customer_name', 'customer_code', 'outsource_type', 'position',
  'employee_name', 'id_card_no', 'gender',
  'mobile', 'email', 'current_address', 'household_address',
  'contract_term_type', 'contract_term', 'contract_start_date', 'contract_end_date',
  'probation_start_date', 'probation_months', 'probation_end_date',
  'work_city', 'work_hour_system', 'work_cycle', 'salary_form',
  'base_salary', 'other_salary', 'probation_salary',
  'payroll_cycle', 'payroll_date',
  'business_mode', 'employee_type',
  'need_company_contract', 'contract_subject', 'contract_template', 'need_contract_urge',
  'contract_feedback',
];

const onboardingSocialFields = [
  'customer_name', 'customer_code', 'employee_name', 'id_card_no',
  'social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio',
];

// 离职减员表 10 字段：前 7 字段 → 三单可见；后 3 字段（feedback_deadline/is_common_template/template_name）→ 仅离职材料收集。
const resignationCoreFields = [
  'employee_name', 'id_card_no', 'social_pay_region', 'social_stop_month',
  'resignation_reason', 'resignation_date', 'need_resignation_share',
];

const resignationContactFields = [
  'customer_name', 'customer_code', 'mobile', 'position',
  ...resignationCoreFields,
  'feedback_deadline', 'is_common_template', 'template_name',
];

const dataEntryResignFields = [
  'customer_name', 'customer_code', 'mobile', 'position',
  ...resignationCoreFields,
];

const resignationSocialFields = [
  'customer_name', 'customer_code', 'mobile',
  ...resignationCoreFields,
];

const moduleFields: Record<string, string[]> = {
  onboarding_contact: onboardingContactFields,
  contract: contractFields,
  data_entry: [
    'customer_name', 'customer_code', 'outsource_type', 'position',
    'employee_name', 'id_card_no', 'gender',
    'birth_date', 'age', 'household_type', 'ethnicity',
    'mobile', 'email', 'current_address', 'household_address', 'postal_code',
    'social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio',
    'bank_name', 'bank_account', 'remark',
    'business_mode',
    'need_company_payroll', 'payroll_location',
    'data_entry_feedback',
  ],
  social_insurance: onboardingSocialFields,
  renewal_contract: contractFields,
  benefit_apply: [],
  social_insurance_change: onboardingSocialFields,
  resignation_contact: resignationContactFields,
  data_entry_resign: dataEntryResignFields,
  resignation_social_insurance: resignationSocialFields,
  resignation_cert: resignationContactFields,
};

const supervisorSeeds: Array<{ moduleCode: string; usernames: string[] }> = [
  { moduleCode: 'onboarding_contact', usernames: ['jianglu', 'socialsup01'] },
  { moduleCode: 'contract', usernames: ['jianglu', 'contractsup01'] },
  { moduleCode: 'renewal_contract', usernames: ['jianglu', 'contractsup01'] },
  { moduleCode: 'resignation_contact', usernames: ['jianglu', 'onboardsup01'] },
  { moduleCode: 'data_entry', usernames: ['annazhen', 'dataentrysup01'] },
  { moduleCode: 'data_entry_resign', usernames: ['annazhen', 'dataentrysup01'] },
  { moduleCode: 'social_insurance', usernames: ['fuqianwen'] },
  { moduleCode: 'resignation_social_insurance', usernames: ['fuqianwen'] },
];

const actionSeeds: Array<Partial<ActionConfig>> = [
  { moduleCode: 'onboarding_contact', actionCode: 'complete', actionName: '完成', remarkRequired: false, formSchema: null },
  { moduleCode: 'contract', actionCode: 'complete', actionName: '完成', remarkRequired: false, formSchema: null },
  { moduleCode: 'data_entry', actionCode: 'complete', actionName: '完成', remarkRequired: false, formSchema: null },
  { moduleCode: 'social_insurance', actionCode: 'complete', actionName: '完成', remarkRequired: true, formSchema: { fields: [{ fieldCode: 'remark', label: '办理备注', required: true }] } },
  { moduleCode: 'resignation_contact', actionCode: 'complete', actionName: '完成', remarkRequired: false, formSchema: null },
  { moduleCode: 'data_entry_resign', actionCode: 'complete', actionName: '完成', remarkRequired: false, formSchema: null },
  { moduleCode: 'resignation_social_insurance', actionCode: 'complete', actionName: '完成', remarkRequired: true, formSchema: { fields: [{ fieldCode: 'remark', label: '办理备注', required: true }] } },
  { moduleCode: 'social_insurance', actionCode: 'batch_complete', actionName: '社保批量完成', remarkRequired: true, formSchema: { fields: [{ fieldCode: 'remark', label: '批量完成备注', required: true, helpText: '请填写月份、基数、操作类型等追溯信息' }] } },
  { moduleCode: 'resignation_social_insurance', actionCode: 'batch_complete', actionName: '社保批量完成', remarkRequired: true, formSchema: { fields: [{ fieldCode: 'remark', label: '批量完成备注', required: true, helpText: '请填写月份、基数、操作类型等追溯信息' }] } },
  ...['onboarding_contact', 'contract', 'data_entry', 'social_insurance', 'resignation_contact', 'data_entry_resign', 'resignation_social_insurance'].map((moduleCode) => ({ moduleCode, actionCode: 'confirm_read', actionName: '确认已阅', remarkRequired: false, formSchema: null })),
  ...['onboarding_contact', 'contract', 'data_entry', 'social_insurance', 'resignation_contact', 'data_entry_resign', 'resignation_social_insurance'].map((moduleCode) => ({ moduleCode, actionCode: 'return_completed', actionName: '退回已完成子单', remarkRequired: true, formSchema: { fields: [{ fieldCode: 'returnReason', label: '退回原因', required: true }] } })),
];

export async function seedModuleConfigs(dataSource: DataSource): Promise<void> {
  if (!(await hasTable(dataSource, 'work_order_modules'))) {
    return;
  }
  await ensureDispatchSlaColumns(dataSource);

  const moduleRepo = dataSource.getRepository(WorkOrderModuleConfig);
  const moduleFieldRepo = dataSource.getRepository(ModuleField);
  const fieldRepo = dataSource.getRepository(FieldConfig);
  const supervisorRepo = dataSource.getRepository(ModuleSupervisor);
  const userRepo = dataSource.getRepository(User);
  const actionRepo = dataSource.getRepository(ActionConfig);
  const exportTemplateRepo = dataSource.getRepository(ExportTemplate);

  for (const seed of modules) {
    const defaults = defaultSlaByModule[seed.moduleCode!];
    const existed = await moduleRepo.findOne({ where: { moduleCode: seed.moduleCode! } });
    if (existed) {
      continue;
    }

    await moduleRepo.save(moduleRepo.create({
      ...seed,
      isActive: true,
      slaHours: defaults?.slaHours ?? null,
      slaReminderBeforeHours: defaults?.reminderBeforeHours ?? null,
    }));
  }

  await backfillDispatchedOrderDueAt(dataSource);

  for (const [moduleCode, fieldCodes] of Object.entries(moduleFields)) {
    // Non-destructive seed: do not deactivate module fields omitted from defaults.

    for (let index = 0; index < fieldCodes.length; index += 1) {
      const fieldCode = fieldCodes[index];
      const field = await fieldRepo.findOne({ where: { fieldCode, isActive: true } });
      if (!field) continue;
      const existed = await moduleFieldRepo.findOne({ where: { moduleCode, fieldCode } });
      const payload: Partial<ModuleField> = {
        moduleCode,
        fieldCode,
        groupName: defaultGroupName(moduleCode),
        displayOrder: index + 1,
        isActive: true,
      };
      if (existed) {
        continue;
      }
      await moduleFieldRepo.save(moduleFieldRepo.create(payload));
    }
  }

  for (const seed of supervisorSeeds) {
    for (const username of seed.usernames) {
      const user = await userRepo.findOne({ where: { username, isActive: true } });
      if (!user) continue;
      const existed = await supervisorRepo.findOne({ where: { moduleCode: seed.moduleCode, supervisorId: user.id } });
      if (existed) {
        continue;
      }
      await supervisorRepo.save(supervisorRepo.create({ moduleCode: seed.moduleCode, supervisorId: user.id, isActive: true }));
    }
  }

  for (const seed of actionSeeds) {
    const existed = await actionRepo.findOne({ where: { moduleCode: seed.moduleCode!, actionCode: seed.actionCode! } });
    if (existed) {
      continue;
    }
    await actionRepo.save(actionRepo.create({ ...seed, isActive: true }));
  }

  const admin = await userRepo.findOne({ where: { username: 'admin' } }) ?? await userRepo.findOne({ where: { isActive: true } });
  if (admin) {
    for (const moduleCode of ['social_insurance', 'resignation_social_insurance']) {
      const templateName = moduleCode === 'social_insurance' ? '社保公积金增员导出模板' : '社保公积金减员导出模板';
      const existed = await exportTemplateRepo.findOne({ where: { templateName, moduleCode } });
      const fieldList = (moduleFields[moduleCode] ?? []).map((fieldCode, order) => ({ fieldCode, alias: fieldCode, order }));
      if (existed) {
        continue;
      }
      await exportTemplateRepo.save(exportTemplateRepo.create({
        templateName,
        moduleCode,
        fieldList,
        createdBy: admin.id,
        isShared: true,
      }));
    }
  }
}

async function hasTable(dataSource: DataSource, tableName: string): Promise<boolean> {
  const rows = await dataSource.query<Array<{ exists: boolean }>>(
    'SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1) AS exists',
    [tableName],
  );
  return Boolean(rows[0]?.exists);
}

async function ensureDispatchSlaColumns(dataSource: DataSource): Promise<void> {
  const rows = await dataSource.query<Array<{ table_name: string; column_name: string }>>(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name IN ('work_order_modules', 'dispatched_orders')
        AND column_name IN ('sla_hours', 'sla_reminder_before_hours', 'due_at')
    `,
  );
  const existingColumns = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));

  if (!existingColumns.has('work_order_modules.sla_hours')) {
    await dataSource.query('ALTER TABLE work_order_modules ADD COLUMN sla_hours integer NULL');
  }
  if (!existingColumns.has('work_order_modules.sla_reminder_before_hours')) {
    await dataSource.query('ALTER TABLE work_order_modules ADD COLUMN sla_reminder_before_hours integer NULL');
  }
  if (!existingColumns.has('dispatched_orders.due_at')) {
    await dataSource.query('ALTER TABLE dispatched_orders ADD COLUMN due_at timestamptz NULL');
  }
  if (!existingColumns.has('dispatched_orders.sla_hours')) {
    await dataSource.query('ALTER TABLE dispatched_orders ADD COLUMN sla_hours integer NULL');
  }
  if (!existingColumns.has('dispatched_orders.sla_reminder_before_hours')) {
    await dataSource.query('ALTER TABLE dispatched_orders ADD COLUMN sla_reminder_before_hours integer NULL');
  }
  await ensureOptionalIndex(dataSource, 'CREATE INDEX IF NOT EXISTS idx_dispatched_orders_due_at ON dispatched_orders(due_at)', 'idx_dispatched_orders_due_at');
}

async function ensureOptionalIndex(dataSource: DataSource, sql: string, label: string): Promise<void> {
  try {
    await dataSource.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.warn(`${label} skipped: ${message}`);
  }
}

async function backfillDispatchedOrderDueAt(dataSource: DataSource): Promise<void> {
  await dataSource.query(`
    UPDATE dispatched_orders d
       SET sla_hours = COALESCE(d.sla_hours, m.sla_hours),
           sla_reminder_before_hours = COALESCE(d.sla_reminder_before_hours, m.sla_reminder_before_hours),
           due_at = COALESCE(d.due_at, COALESCE(d.dispatched_at, d.created_at) + (m.sla_hours || ' hours')::interval)
      FROM work_order_modules m
     WHERE d.module_code = m.module_code
       AND m.sla_hours IS NOT NULL
       AND (d.due_at IS NULL OR d.sla_hours IS NULL OR d.sla_reminder_before_hours IS NULL)
  `);
}

function defaultGroupName(moduleCode: string): string {
  const map: Record<string, string> = {
    onboarding_contact: '入职联系字段',
    contract: '劳动合同字段',
    data_entry: '增员报岗录入字段',
    social_insurance: '社保公积金增员字段',
    renewal_contract: '劳动合同续签字段',
    benefit_apply: '待遇申报字段',
    social_insurance_change: '社保公积金变更字段',
    resignation_contact: '离职材料收集字段',
    data_entry_resign: '减员报岗录入字段',
    resignation_social_insurance: '社保公积金减员字段',
  };
  return map[moduleCode] ?? '基础字段';
}
