import { DataSource, Repository } from 'typeorm';
import { FieldConfig, FieldPermission, FieldPermissionMode, OrderType, Role } from 'src/entities';

/**
 * 字段权限矩阵 seed。
 *
 * 目标：与前端 DEFAULT_SCENARIOS 保持 12 个配置态场景一致，避免后台权限页出现无后端数据的兜底场景。
 * 运行时仍由 FieldPermissionService 对 main / dispatched:benefit_apply 等历史场景做 alias 兼容。
 */
export const FIELD_PERMISSION_SCENARIOS = [
  'create:onboarding',
  'create:in_service',
  'create:resignation',
  'dispatched:data_entry',
  'dispatched:social_insurance',
  'dispatched:onboarding_contact',
  'dispatched:contract',
  'dispatched:renewal_contract',
  'dispatched:benefit',
  'dispatched:resignation_contact',
  'dispatched:resignation_cert',
  'dispatched:data_entry_resign',
] as const;

const VISIBLE = FieldPermissionMode.VISIBLE;
const READONLY = FieldPermissionMode.READONLY;
const HIDDEN = FieldPermissionMode.HIDDEN;

const ACTIVE_ROLE_CODES = [
  'admin',
  'business_owner',
  'business_group_leader',
  'business_group_member',
  'data_entry_leader',
  'shared_team_owner',
  'labor_contract_member',
  'onboarding_resignation_member',
  'social_insurance_specialist',
];

// 兼容历史角色代码；seed 会为新旧角色都生成矩阵行。
const OLD_BUSINESS_ROLES = ['biz_manager', 'biz_leader', 'biz_member'];
const OLD_SHARED_ROLES = ['shared_leader', 'contract_specialist', 'onboarding_specialist'];
const ALL_RECOGNIZED_CODES = new Set([
  ...ACTIVE_ROLE_CODES,
  ...OLD_BUSINESS_ROLES,
  ...OLD_SHARED_ROLES,
]);

const BUSINESS_MEMBER_ROLE_CODES = ['business_group_member', 'biz_member'];
const BUSINESS_MANAGER_ROLE_CODES = ['business_owner', 'business_group_leader', 'biz_manager', 'biz_leader'];
const BUSINESS_ROLE_CODES = [...BUSINESS_MEMBER_ROLE_CODES, ...BUSINESS_MANAGER_ROLE_CODES];
const CONTRACT_ROLE_CODES = [
  'labor_contract_member',
  'shared_team_owner',
  'contract_specialist',
  'shared_leader',
  'admin',
  ...BUSINESS_MANAGER_ROLE_CODES,
];
const ONBOARDING_ROLE_CODES = [
  'onboarding_resignation_member',
  'shared_team_owner',
  'onboarding_specialist',
  'shared_leader',
  'admin',
  ...BUSINESS_MANAGER_ROLE_CODES,
];
const DATA_ENTRY_ROLE_CODES = [
  'data_entry_leader',
  'admin',
  ...BUSINESS_MANAGER_ROLE_CODES,
];
const RESIGNATION_ROLE_CODES = [
  'onboarding_resignation_member',
  'shared_team_owner',
  'onboarding_specialist',
  'shared_leader',
  'admin',
  ...BUSINESS_MANAGER_ROLE_CODES,
];
const SOCIAL_INSURANCE_ROLE_CODES = [
  'social_insurance_specialist',
  'data_entry_leader',
  'admin',
  ...BUSINESS_MANAGER_ROLE_CODES,
];

const CONTRACT_VISIBLE = new Set([
  'customer_name','customer_code','outsource_type','position','employee_name','id_card_no','gender','birth_date','age','household_type','ethnicity','mobile','email','current_address','household_address','postal_code','contract_term_type','contract_term','contract_start_date','contract_end_date','probation_start_date','probation_months','probation_end_date','work_city','work_hour_system','work_cycle','salary_form','base_salary','other_salary','probation_salary','business_mode','employee_type','need_company_contract','contract_subject','contract_template','need_contract_urge','contract_feedback','special_remark',
]);
const CONTRACT_EDITABLE = new Set(['contract_feedback', 'special_remark']);

const ONBOARDING_VISIBLE = new Set([
  'customer_name','customer_code','position','employee_name','id_card_no','gender','birth_date','ethnicity','mobile','email','current_address','household_address','postal_code','bank_name','bank_account','need_onboarding_contact','onboarding_feedback','special_remark',
]);
const ONBOARDING_EDITABLE = new Set(['bank_name', 'bank_account', 'onboarding_feedback', 'special_remark']);

const DATA_ENTRY_EDITABLE = new Set(['data_entry_feedback']);
const SOCIAL_INSURANCE_VISIBLE = new Set([
  'customer_name','customer_code','employee_name','id_card_no',
  'social_location','start_month','social_base','fund_base','fund_ratio','special_remark',
]);
const SOCIAL_INSURANCE_EDITABLE = new Set([
  'social_location','start_month','social_base','fund_base','fund_ratio','special_remark',
]);

const RENEWAL_EDITABLE = new Set(['renewal_feedback', 'renewal_remark']);

const RESIGNATION_CERT_VISIBLE = new Set([
  'customer_name','customer_code','employee_name','id_card_no','mobile','position',
  'resignation_type','last_work_date','contract_terminate_date','need_resignation_cert',
  'cert_delivery_address','resignation_cert_status','resignation_remark',
]);
const RESIGNATION_CONTACT_EDITABLE = new Set(['resignation_contact_feedback', 'handover_person']);
const RESIGNATION_CERT_EDITABLE = new Set(['resignation_cert_status', 'cert_delivery_address']);
const DATA_ENTRY_RESIGN_VISIBLE = new Set([
  'customer_name','customer_code','employee_name','id_card_no','mobile','position',
  'resignation_type','last_work_date','contract_terminate_date','social_handover_done',
  'final_salary_settled','resignation_remark',
]);
const DATA_ENTRY_RESIGN_EDITABLE = new Set(['social_handover_done', 'final_salary_settled', 'resignation_remark']);

const BENEFIT_EDITABLE = new Set([
  'benefit_review_status',
  'benefit_review_remark',
  'benefit_result',
  'benefit_result_date',
  'benefit_payout_date',
  'benefit_payout_amount',
  'benefit_materials_received',
  'benefit_materials_collected',
  'benefit_submit_date',
  'benefit_submit_office',
  'benefit_stamp_no',
  'benefit_stamp_confirmed',
  'benefit_return_reason',
]);

const LEGACY_SCENARIOS_TO_DELETE = [
  'main',
  'dispatched:benefit_apply',
  'dispatched:social_security',
];

function belongs(field: FieldConfig, target: OrderType): boolean {
  if (field.businessContext && field.businessContext.length > 0) {
    return field.businessContext.includes(target);
  }
  return field.orderType === target;
}

function belongsAny(field: FieldConfig, targets: OrderType[]): boolean {
  return targets.some((target) => belongs(field, target));
}

async function upsertPermission(
  repo: Repository<FieldPermission>,
  roleId: string,
  fieldCode: string,
  scenario: string,
  permission: FieldPermissionMode,
): Promise<void> {
  const existed = await repo.findOne({ where: { roleId, fieldCode, scenario } });
  if (existed) {
    existed.permission = permission;
    await repo.save(existed);
    return;
  }
  await repo.save(repo.create({ roleId, fieldCode, scenario, permission }));
}

function createPermission(roleCode: string, field: FieldConfig, targets: OrderType[]): FieldPermissionMode {
  if (!belongsAny(field, targets)) return HIDDEN;
  if (roleCode === 'admin') return VISIBLE;
  if (BUSINESS_ROLE_CODES.includes(roleCode)) return VISIBLE;
  return READONLY;
}

function dispatchedPermission(
  roleCode: string,
  field: FieldConfig,
  targets: OrderType[],
  handlerRoleCodes: string[],
  editableFields: Set<string>,
  visibleFields?: Set<string>,
): FieldPermissionMode {
  if (!belongsAny(field, targets)) return HIDDEN;
  if (visibleFields && !visibleFields.has(field.fieldCode)) return HIDDEN;
  if (roleCode === 'admin') return VISIBLE;
  if (!handlerRoleCodes.includes(roleCode)) return HIDDEN;
  if (BUSINESS_MANAGER_ROLE_CODES.includes(roleCode)) return READONLY;
  return editableFields.has(field.fieldCode) ? VISIBLE : READONLY;
}

export async function seedFieldPermissions(dataSource: DataSource): Promise<void> {
  const roleRepo = dataSource.getRepository(Role);
  const permRepo = dataSource.getRepository(FieldPermission);
  const fieldRepo = dataSource.getRepository(FieldConfig);

  const allRoles = await roleRepo.find();
  const allFields = await fieldRepo.find({ order: { displayOrder: 'ASC' } });

  await permRepo
    .createQueryBuilder()
    .delete()
    .where('scenario IN (:...scenarios)', { scenarios: LEGACY_SCENARIOS_TO_DELETE })
    .execute();

  for (const role of allRoles) {
    if (!ALL_RECOGNIZED_CODES.has(role.code)) continue;

    for (const field of allFields) {
      await upsertPermission(
        permRepo,
        role.id,
        field.fieldCode,
        'create:onboarding',
        createPermission(role.code, field, [OrderType.ONBOARDING]),
      );
      await upsertPermission(
        permRepo,
        role.id,
        field.fieldCode,
        'create:in_service',
        createPermission(role.code, field, [OrderType.RENEWAL, OrderType.BENEFIT]),
      );
      await upsertPermission(
        permRepo,
        role.id,
        field.fieldCode,
        'create:resignation',
        createPermission(role.code, field, [OrderType.RESIGNATION]),
      );

      await upsertPermission(
        permRepo,
        role.id,
        field.fieldCode,
        'dispatched:contract',
        dispatchedPermission(role.code, field, [OrderType.ONBOARDING], CONTRACT_ROLE_CODES, CONTRACT_EDITABLE, CONTRACT_VISIBLE),
      );
      await upsertPermission(
        permRepo,
        role.id,
        field.fieldCode,
        'dispatched:onboarding_contact',
        dispatchedPermission(role.code, field, [OrderType.ONBOARDING], ONBOARDING_ROLE_CODES, ONBOARDING_EDITABLE, ONBOARDING_VISIBLE),
      );
      await upsertPermission(
        permRepo,
        role.id,
        field.fieldCode,
        'dispatched:data_entry',
        dispatchedPermission(role.code, field, [OrderType.ONBOARDING], DATA_ENTRY_ROLE_CODES, DATA_ENTRY_EDITABLE),
      );
      await upsertPermission(
        permRepo,
        role.id,
        field.fieldCode,
        'dispatched:social_insurance',
        dispatchedPermission(role.code, field, [OrderType.ONBOARDING], SOCIAL_INSURANCE_ROLE_CODES, SOCIAL_INSURANCE_EDITABLE, SOCIAL_INSURANCE_VISIBLE),
      );
      await upsertPermission(
        permRepo,
        role.id,
        field.fieldCode,
        'dispatched:renewal_contract',
        dispatchedPermission(role.code, field, [OrderType.RENEWAL], CONTRACT_ROLE_CODES, RENEWAL_EDITABLE),
      );
      await upsertPermission(
        permRepo,
        role.id,
        field.fieldCode,
        'dispatched:benefit',
        dispatchedPermission(role.code, field, [OrderType.BENEFIT], CONTRACT_ROLE_CODES, BENEFIT_EDITABLE),
      );
      await upsertPermission(
        permRepo,
        role.id,
        field.fieldCode,
        'dispatched:resignation_contact',
        dispatchedPermission(role.code, field, [OrderType.RESIGNATION], RESIGNATION_ROLE_CODES, RESIGNATION_CONTACT_EDITABLE),
      );
      await upsertPermission(
        permRepo,
        role.id,
        field.fieldCode,
        'dispatched:resignation_cert',
        dispatchedPermission(role.code, field, [OrderType.RESIGNATION], RESIGNATION_ROLE_CODES, RESIGNATION_CERT_EDITABLE, RESIGNATION_CERT_VISIBLE),
      );
      await upsertPermission(
        permRepo,
        role.id,
        field.fieldCode,
        'dispatched:data_entry_resign',
        dispatchedPermission(role.code, field, [OrderType.RESIGNATION], DATA_ENTRY_ROLE_CODES, DATA_ENTRY_RESIGN_EDITABLE, DATA_ENTRY_RESIGN_VISIBLE),
      );
    }
  }
}
