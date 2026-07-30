import { DataSource, Repository } from 'typeorm';
import {
  BusinessType,
  DispatchModuleCode,
  IN_SERVICE_BUSINESS_TYPE_MAPPING,
  IN_SERVICE_PROCESS_TYPE_MAPPING,
  ProcessType,
  RequirementType,
  WorkOrderModuleConfig,
} from 'src/entities';

const businessTypeNames: Record<BusinessType, string> = {
  [BusinessType.REGISTRATION]: '参保登记类',
  [BusinessType.BENEFIT]: '待遇类',
  [BusinessType.SUBSIDY]: '补贴类',
  [BusinessType.OTHER]: '其他',
};

const processTypeNames: Record<ProcessType, string> = {
  [ProcessType.ENTERPRISE_ACCOUNT]: '企业开户',
  [ProcessType.STAFF_CHANGE]: '增减员',
  [ProcessType.SUPPLEMENTARY_PAYMENT]: '补缴',
  [ProcessType.BASE_ADJUSTMENT]: '调基',
  [ProcessType.REFUND]: '退费',
  [ProcessType.INFORMATION_CHANGE]: '信息变更',
  [ProcessType.RETIREMENT_SERVICE]: '退休代办',
  [ProcessType.DISABILITY_ALLOWANCE]: '病残津贴申请',
  [ProcessType.ONE_TIME_WITHDRAWAL]: '一次性支取',
  [ProcessType.MATERNITY_BENEFIT]: '生育待遇申请',
  [ProcessType.WORK_INJURY_RECOGNITION]: '工伤认定',
  [ProcessType.WORK_INJURY_REMOTE_FILING]: '工伤异地备案',
  [ProcessType.LABOR_CAPACITY_ASSESSMENT]: '劳动能力鉴定',
  [ProcessType.WORK_INJURY_BENEFIT]: '工伤待遇申请',
  [ProcessType.UNEMPLOYMENT_BENEFIT]: '失业金申领',
  [ProcessType.PERSONAL_SUBSIDY]: '个人补贴',
  [ProcessType.ENTERPRISE_SUBSIDY]: '企业补贴',
  [ProcessType.PROVIDENT_FUND_TRANSFER]: '公积金转移',
  [ProcessType.PROFESSIONAL_TITLE_RECOGNITION]: '职称认定',
};

const requirementTypeNames: Record<RequirementType, string> = {
  [RequirementType.UNPAID_SUPPLEMENT]: '应缴未缴补缴',
  [RequirementType.BASE_DIFFERENCE_SUPPLEMENT]: '基数调整差额补缴',
  [RequirementType.LATE_REDUCTION_REFUND]: '迟办减少退费',
  [RequirementType.BASE_ADJUSTMENT_REFUND]: '基数调整退费',
  [RequirementType.PERSONAL_INFORMATION_CHANGE]: '个人信息变更',
  [RequirementType.COMPANY_INFORMATION_CHANGE]: '单位信息变更',
};

export async function seedInServiceCategories(dataSource: DataSource): Promise<void> {
  if (!(await hasTable(dataSource, 'work_order_modules'))) return;

  const repository = dataSource.getRepository(WorkOrderModuleConfig);
  for (const [businessIndex, businessType] of Object.values(BusinessType).entries()) {
    const level1Code = `isc_l1_${businessType}`;
    await ensureCategory(repository, {
      moduleCode: level1Code,
      moduleName: businessTypeNames[businessType],
      moduleType: 'in_service_category_level_1',
      parentModuleCode: DispatchModuleCode.IN_SERVICE_SINGLE_BUSINESS,
      displayOrder: businessIndex + 1,
    });

    for (const [processIndex, processType] of IN_SERVICE_BUSINESS_TYPE_MAPPING[businessType].entries()) {
      const level2Code = `isc_l2_${processType}`;
      await ensureCategory(repository, {
        moduleCode: level2Code,
        moduleName: processTypeNames[processType],
        moduleType: 'in_service_category_level_2',
        parentModuleCode: level1Code,
        displayOrder: processIndex + 1,
      });

      for (const [requirementIndex, requirementType] of IN_SERVICE_PROCESS_TYPE_MAPPING[processType].entries()) {
        await ensureCategory(repository, {
          moduleCode: `isc_l3_${requirementType}`,
          moduleName: requirementTypeNames[requirementType],
          moduleType: 'in_service_category_level_3',
          parentModuleCode: level2Code,
          displayOrder: requirementIndex + 1,
        });
      }
    }
  }
}

async function ensureCategory(
  repository: Repository<WorkOrderModuleConfig>,
  seed: Pick<
    WorkOrderModuleConfig,
    'moduleCode' | 'moduleName' | 'moduleType' | 'parentModuleCode' | 'displayOrder'
  >,
): Promise<void> {
  const existing = await repository.findOne({ where: { moduleCode: seed.moduleCode } });
  await repository.save(repository.create({
    ...existing,
    ...seed,
    description: '配置表：单项业务三级分类',
    isActive: true,
    slaHours: existing?.slaHours ?? null,
    slaReminderBeforeHours: existing?.slaReminderBeforeHours ?? null,
  }));
}

async function hasTable(dataSource: DataSource, tableName: string): Promise<boolean> {
  const rows = await dataSource.query<Array<{ exists: boolean }>>(
    'SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1) AS exists',
    [tableName],
  );
  return Boolean(rows[0]?.exists);
}
