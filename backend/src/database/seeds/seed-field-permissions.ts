import { DataSource, Repository } from 'typeorm';
import { BusinessScope, DetailViewTemplate, FieldConfig, FieldPermission, FieldPermissionMode, OrderType, Role } from 'src/entities';
import { getDetailViewFieldCodes } from 'src/modules/admin/detail-view-templates/detail-view-template-fields';

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
  'dispatched:resignation_social_insurance',
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
  'welfare_specialist',
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
  ...BUSINESS_MEMBER_ROLE_CODES,
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
  ...BUSINESS_MEMBER_ROLE_CODES,
];

// 各子工单可见字段严格按《浙江企服服务外包增员信息表》「涉及工单」标注重建（杭州 sheet）。
// 反馈类字段（contract_feedback/onboarding_feedback/data_entry_feedback）不在导入表列中，按口径不显示。
const CONTRACT_VISIBLE = new Set([
  'customer_name','customer_code','outsource_type','position','position_type','employee_name','id_card_type','id_card_no','gender','mobile','email','current_address','household_address','contract_term_type','contract_term','contract_start_date','contract_end_date','probation_start_date','probation_months','probation_end_date','work_city','work_hour_system','salary_form','base_salary','other_salary','probation_salary','probation_other_salary','payroll_cycle','payroll_date','bank_name','bank_account','business_mode','employee_type','need_company_contract','need_esign','esign_platform','contract_subject','company_address','project_name','work_arrangement','contract_template','need_contract_urge',
]);
const CONTRACT_EDITABLE = new Set(['contract_feedback', 'special_remark']);

const ONBOARDING_VISIBLE = new Set([
  'customer_name','customer_code','employee_name','id_card_no','mobile','email',
  'education','graduation_school','major','graduation_date',
  'need_onboarding_contact','feedback_deadline','is_common_template','template_name','social_urge','special_remark',
]);
const ONBOARDING_EDITABLE = new Set([
  'education', 'graduation_school', 'major', 'graduation_date',
  'bank_name', 'bank_account', 'onboarding_feedback', 'special_remark',
]);

const DATA_ENTRY_VISIBLE = new Set([
  'customer_name','customer_code','outsource_type','position','position_type','employee_name','id_card_type','id_card_no','gender','birth_date','age','household_type','ethnicity','education','graduation_school','major','graduation_date','marital_status','mobile','email','current_address','household_address','postal_code','social_location','start_month','social_base','fund_base','fund_ratio','bank_name','bank_account','remark','business_mode','need_company_payroll','payroll_location',
]);
const DATA_ENTRY_EDITABLE = new Set(['data_entry_feedback']);
const HANDLING_FEEDBACK_FIELDS = [
  'social_insurance_result', 'social_insurance_remark',
  'medical_insurance_result',
  'housing_fund_result',
];
const SOCIAL_INSURANCE_VISIBLE = new Set([
  'customer_name','customer_code','outsource_type','position','position_type','employee_name','id_card_type','id_card_no','gender','birth_date','age','household_type','ethnicity',
  'education','graduation_school','major','graduation_date','marital_status',
  'mobile','email','current_address','household_address','postal_code',
  'social_location','start_month','social_base','fund_base','fund_ratio',
  'bank_name','bank_account',
  'social_urge','special_remark','remark',
  ...HANDLING_FEEDBACK_FIELDS,
]);
const SOCIAL_INSURANCE_EDITABLE = new Set([
  'social_location','start_month','social_base','fund_base','fund_ratio','special_remark',
  ...HANDLING_FEEDBACK_FIELDS,
]);

const RENEWAL_EDITABLE = new Set(['renewal_feedback', 'renewal_remark']);

// 离职减员表 10 列严格按《外包减员表》「涉及工单」标注重建。
// 前 6 列（姓名/身份证号/缴纳地区/停保月/离职原因/离职日期）+ 共享收集流转至 离职材料收集/数据录入/社保公积金减员 三单；
// feedback_deadline/is_common_template/template_name 仅离职材料收集可见。
// need_resignation_cert/cert_delivery_address 用于离职证明自动流转触发和邮寄地址。
const RESIGNATION_CORE_VISIBLE = [
  'employee_name', 'id_card_no', 'social_pay_region', 'social_stop_month',
  'resignation_reason', 'resignation_date', 'need_resignation_share',
  'need_resignation_cert', 'cert_delivery_address',
];
const RESIGNATION_CONTACT_VISIBLE = new Set([
  'customer_name', 'customer_code', 'mobile', 'email',
  ...RESIGNATION_CORE_VISIBLE, 'feedback_deadline', 'is_common_template', 'template_name',
]);
const RESIGNATION_CERT_VISIBLE = RESIGNATION_CONTACT_VISIBLE;
const RESIGNATION_CONTACT_EDITABLE = new Set<string>([]);
const RESIGNATION_CERT_EDITABLE = new Set<string>([]);
const DATA_ENTRY_RESIGN_VISIBLE = new Set([
  'customer_name', 'customer_code', 'mobile', 'email', ...RESIGNATION_CORE_VISIBLE,
]);
const DATA_ENTRY_RESIGN_EDITABLE = new Set<string>([]);
// 社保公积金减员：核心字段可见，办理结果/备注由社保岗反馈。
const RESIGNATION_SOCIAL_VISIBLE = new Set([
  'customer_name', 'customer_code', 'mobile', 'email',
  ...RESIGNATION_CORE_VISIBLE,
  ...HANDLING_FEEDBACK_FIELDS,
]);
const RESIGNATION_SOCIAL_EDITABLE = new Set<string>(HANDLING_FEEDBACK_FIELDS);

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
  // Keep the same matrix in two independent rows; later seeds must never rewrite one account into the other.
  for (const businessScope of [BusinessScope.BEILUN, BusinessScope.OUT_OF_PROVINCE]) {
    const existed = await repo.findOne({ where: { roleId, fieldCode, scenario, businessScope } });
    if (existed) {
      if (existed.permission !== permission) {
        existed.permission = permission;
        await repo.save(existed);
      }
      continue;
    }
    await repo.save(repo.create({ roleId, fieldCode, scenario, permission, businessScope }));
  }
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
  businessCanEditVisibleFields = false,
): FieldPermissionMode {
  if (!belongsAny(field, targets)) return HIDDEN;
  if (visibleFields && !visibleFields.has(field.fieldCode)) return HIDDEN;
  if (roleCode === 'admin') return VISIBLE;
  if (BUSINESS_ROLE_CODES.includes(roleCode)) {
    return businessCanEditVisibleFields && BUSINESS_MEMBER_ROLE_CODES.includes(roleCode) ? VISIBLE : READONLY;
  }
  if (!handlerRoleCodes.includes(roleCode)) return HIDDEN;
  return editableFields.has(field.fieldCode) ? VISIBLE : READONLY;
}

export async function seedFieldPermissions(dataSource: DataSource): Promise<void> {
  const roleRepo = dataSource.getRepository(Role);
  const permRepo = dataSource.getRepository(FieldPermission);
  const fieldRepo = dataSource.getRepository(FieldConfig);
  const detailViewTemplateRepo = dataSource.getRepository(DetailViewTemplate);

  const allRoles = await roleRepo.find();
  const allFields = await fieldRepo.find({ order: { displayOrder: 'ASC' } });
  const activeContractTemplate = await detailViewTemplateRepo.findOne({
    where: { moduleCode: 'contract', isActive: true },
    order: { createdAt: 'DESC' },
  });
  const configuredContractFields = new Set(getDetailViewFieldCodes(activeContractTemplate?.fieldList));
  const contractVisibleFields = configuredContractFields.size > 0 ? configuredContractFields : CONTRACT_VISIBLE;

  void LEGACY_SCENARIOS_TO_DELETE;

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
        dispatchedPermission(role.code, field, [OrderType.ONBOARDING], CONTRACT_ROLE_CODES, CONTRACT_EDITABLE, contractVisibleFields, true),
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
        dispatchedPermission(role.code, field, [OrderType.ONBOARDING], DATA_ENTRY_ROLE_CODES, DATA_ENTRY_EDITABLE, DATA_ENTRY_VISIBLE),
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
        dispatchedPermission(role.code, field, [OrderType.RESIGNATION], RESIGNATION_ROLE_CODES, RESIGNATION_CONTACT_EDITABLE, RESIGNATION_CONTACT_VISIBLE),
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
      await upsertPermission(
        permRepo,
        role.id,
        field.fieldCode,
        'dispatched:resignation_social_insurance',
        dispatchedPermission(role.code, field, [OrderType.RESIGNATION], SOCIAL_INSURANCE_ROLE_CODES, RESIGNATION_SOCIAL_EDITABLE, RESIGNATION_SOCIAL_VISIBLE),
      );
    }
  }
}
