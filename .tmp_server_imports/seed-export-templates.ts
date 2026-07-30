import { DataSource, IsNull } from 'typeorm';
import { ExportTemplate, User } from 'src/entities';

// ⚠️ 本文件按 5 份会议表格「原样逐字复刻」生成 3 套导出模板，请勿擅自改动表头文案 / 列序 / 绑定串。
// 列模型由 export-templates.service.ts 的 resolveRichColumns 解析：
//   - field 列：{ fieldCode, header }                取 extraData[fieldCode]
//   - const 列：{ const, header }（无 fieldCode）     固定值（空串即留空）
//   - sameAs 列：{ sameAs: '另一字段码', header }      复制另一字段的值
//   - header 为数组时即多行表头，原样逐行写出（数组分支不做 trim，保留尾随空格）。

type Source =
  | { fieldCode: string }
  | { const: string }
  | { sameAs: string }
  | { fieldCode: string; formula: string; numFmt?: string };

// 公式列模板：占位符 {code} 由导出引擎解析（有对应列→单元格引用，无对应列→订单取值字面量）。
const FORMULA_GENDER =
  'IFERROR(IF(MOD(VALUE(MID({id_card_no},17,1)),2)=1,"男","女"),"")';
const FORMULA_PROBATION_END =
  'IFERROR(EDATE({probation_start_date},VALUE({probation_months}))-1,"")';
const DATE_NUM_FMT = 'yyyy/mm/dd';

interface TemplateSeed {
  templateName: string;
  moduleCode: string;
  signPlatform: string | null;
  fieldList: Array<Record<string, unknown>>;
}

// ── 3A. 入职联系导出（onboarding_contact，7 列，单行表头）──────────────────
const onboardingContactColumns: Array<[string, string]> = [
  ['employee_name', '姓名'],
  ['mobile', '联系电话'],
  ['id_card_no', '证件号码'],
  ['feedback_deadline', '需要反馈截止日期'],
  ['is_common_template', '是否为通用模板'],
  ['template_name', '模板名称'],
  ['email', '邮箱（选填）'],
  ['created_by_name', '发起人'],
];

const onboardingContactFieldList = onboardingContactColumns.map(([fieldCode, header], index) => ({
  fieldCode,
  alias: header,
  header: [header],
  order: index + 1,
}));

// ── 3B. 劳动合同-速创导出（contract / 速创，37 列，表头=字段名行+填写说明行）──
// 每行：[字段名(R2), 填写说明(R3), 取值来源]
const contractSuchuangColumns: Array<[string, string, Source]> = [
  ['客户代码', '', { fieldCode: 'customer_code' }],
  ['电脑号（与身份证号二选一填写即可）', '默认为空值即可', { const: '' }],
  ['身份证号', '', { fieldCode: 'id_card_no' }],
  ['是否电子签', '', { fieldCode: 'need_esign' }],
  ['姓名', '', { fieldCode: 'employee_name' }],
  ['签订方式', '默认为“新签”即可', { const: '新签' }],
  ['合同号（印制编号）', '默认为空值即可', { const: '' }],
  ['合同起始', '', { fieldCode: 'contract_start_date' }],
  ['合同终止', '', { fieldCode: 'contract_end_date' }],
  ['版本', '默认为“013.2021版”即可', { const: '013.2021版' }],
  ['试用期起始', '', { fieldCode: 'probation_start_date' }],
  ['试用期终止', '', { fieldCode: 'probation_end_date', formula: FORMULA_PROBATION_END, numFmt: DATE_NUM_FMT }],
  ['派遣起始', '默认为空值即可', { const: '' }],
  ['派遣终止', '默认为空值即可', { const: '' }],
  ['岗位', '', { fieldCode: 'position' }],
  ['每月工资', '', { const: '' }],
  ['工资性质', '默认为空值即可', { const: '' }],
  ['工资支付方', '默认为“甲方”即可', { const: '甲方' }],
  ['寄送地址', '取“现住地址”', { fieldCode: 'current_address' }],
  ['寄送邮编', '', { fieldCode: 'postal_code' }],
  ['寄送方式', '默认为空值即可', { const: '' }],
  ['岗位类型', '', { fieldCode: 'position_type' }],
  ['发薪日（仅支持填写数字）', '', { fieldCode: 'payroll_date' }],
  ['签订日期', '默认为空值即可', { const: '' }],
  ['合同自动延续月份', '默认为空值即可', { const: '' }],
  ['协议自动延续月份', '默认为空值即可', { const: '' }],
  ['基本工资', '', { fieldCode: 'base_salary' }],
  ['试用期基本工资', '', { fieldCode: 'probation_salary' }],
  ['户籍地址', '', { fieldCode: 'household_address' }],
  ['性别', '', { fieldCode: 'gender', formula: FORMULA_GENDER }],
  ['试用期其他工资', '', { fieldCode: 'probation_other_salary' }],
  ['其他工资', '', { fieldCode: 'other_salary' }],
  ['居住地址', '', { fieldCode: 'current_address' }],
  ['项目名称', '', { fieldCode: 'project_name' }],
  ['安排或调整工作的情况', '', { fieldCode: 'work_arrangement' }],
  ['工时制', '', { fieldCode: 'work_hour_system' }],
  ['工作地点', '', { fieldCode: 'work_city' }],
];

const contractSuchuangFieldList = contractSuchuangColumns.map(([name, instruction, source], index) => ({
  ...source,
  alias: name,
  header: [name, instruction],
  order: index + 1,
}));

// ── 3C. 劳动合同-e签宝导出（contract / E签宝，30 列，4 行表头 R1/R2/R3/R4 原样逐字复刻，数据第 5 行起）──
// 每行：[R1 文件名行, R2 字段名行, R3 绑定串行, R4 填写说明行, 取值来源]
// R2/R3 部分列尾随单个空格为原模板内容，必须保留。
const FILE_TITLE = '文件-全日制劳动合同+员工手册.pdf';
const contractEsignColumns: Array<[string, string, string, string, Source]> = [
  ['姓名-签署方2', '姓名-签署方2', '姓名-签署方2', '', { fieldCode: 'employee_name' }],
  ['手机/邮箱-签署方2', '手机/邮箱-签署方2', '手机/邮箱-签署方2', '', { fieldCode: 'mobile' }],
  ['证件号类型(选填)-签署方2', '证件号类型(选填)-签署方2', '证件号类型(选填)-签署方2', '', { fieldCode: 'id_card_type' }],
  ['证件号(选填)-签署方2', '证件号(选填)-签署方2', '证件号(选填)-签署方2', '', { fieldCode: 'id_card_no' }],
  ['合同名称（选填）-签署方2', '合同名称（选填）-签署方2', '合同名称（选填）-签署方2', '默认为空值即可', { const: '' }],
  [FILE_TITLE, '甲方名称（限43字）-签署方1', 'fe3a28926dcf4b06bcdc4ea086e175f8', '', { fieldCode: 'contract_subject' }],
  [FILE_TITLE, '甲方住所（限43字）-签署方1 ', 'edef6b09a6164b4295215fa14a0d8e79 ', '', { fieldCode: 'company_address' }],
  [FILE_TITLE, '姓名（限20字）-签署方1', '4df5ec57d6e8450792e83adfa658fd89', '员工姓名，同A列值', { sameAs: 'employee_name' }],
  [FILE_TITLE, '性别（限20字）-签署方1 ', 'a6b3c346d84540148a02c5ec59ae46eb ', '', { fieldCode: 'gender', formula: FORMULA_GENDER }],
  [FILE_TITLE, '身份证号码（限20字）-签署方1', '3d17e88a503e4462b88c4f17e470cbc2', '员工证件号码，同D列值', { sameAs: 'id_card_no' }],
  [FILE_TITLE, '户籍地址（限45字）-签署方1 ', 'c13f778aa11244d7a99ce84965fbb061 ', '', { fieldCode: 'household_address' }],
  [FILE_TITLE, '居住地址（限46字）-签署方1', 'a641292f73b441e3aae825ade3f3a840', '', { fieldCode: 'current_address' }],
  [FILE_TITLE, '联系电话（限20字）-签署方1 ', 'a9f7714971db4d4ca9db0610ef8734aa ', '员工手机号，同B列值', { sameAs: 'mobile' }],
  [FILE_TITLE, '合同起始时间（限20字）-签署方1', '21c52e1dddd94521a0e073d4b4b7fae3', '', { fieldCode: 'contract_start_date' }],
  [FILE_TITLE, '合同终止时间（限20字）-签署方1 ', '2eec9504c6bc4f64af358cf2c6a11381 ', '', { fieldCode: 'contract_end_date' }],
  [FILE_TITLE, '试用期起始时间（限20字）-签署方1', '0d70bceee0194d9fa2359da8f02985c0', '', { fieldCode: 'probation_start_date' }],
  [FILE_TITLE, '试用期终止时间（限20字）-签署方1 ', '5126656741f24f54b02b886976a93075 ', '', { fieldCode: 'probation_end_date', formula: FORMULA_PROBATION_END, numFmt: DATE_NUM_FMT }],
  [FILE_TITLE, '项目名称（限18字）-签署方1', '31df218ef0d0453392408079c48f26aa', '', { fieldCode: 'project_name' }],
  [FILE_TITLE, '岗位名称（限14字）-签署方1 ', 'db5442bbb3974f4db12efae2761d5294 ', '', { fieldCode: 'position' }],
  [FILE_TITLE, '工作地点（限10字）-签署方1', '6b8ddf1d811e43bc8d8da9af24b13be3', '', { fieldCode: 'work_city' }],
  [FILE_TITLE, '可调整的工作地点（限11字）-签署方1 ', '783c4adc2c80479e94febbf7804f3c8e ', '', { fieldCode: 'work_arrangement' }],
  [FILE_TITLE, '1标准2不定时3综合（限4字）-签署方1', 'fa56543c616a4728b9a9e92850cbe9d4', '默认为“1”即可', { const: '1' }],
  [FILE_TITLE, '发薪日（限6字）-签署方1 ', 'dd3faebf7bcb4558a1b3f0e5660ea15c ', '', { fieldCode: 'payroll_date' }],
  [FILE_TITLE, '基础工资（限10字）-签署方1', 'f4e098cd48664421ae8d3a24ff094824', '', { fieldCode: 'base_salary' }],
  [FILE_TITLE, '其他工资（限33字）-签署方1 ', 'cab1e2e8a8304e09b1db8c0555162668 ', '', { fieldCode: 'other_salary' }],
  [FILE_TITLE, '试用期基本工资（限10字）-签署方1', '1e00a7b0c9f4490388d9d31fb456dd96', '', { fieldCode: 'probation_salary' }],
  [FILE_TITLE, '试用期其他工资（限33字）-签署方1 ', '5959f6f451c1410bb7c93cd5c05b9b82 ', '', { fieldCode: 'probation_other_salary' }],
  [FILE_TITLE, '居住地址（限35字）-签署方1', '6a6a633c4b8a42709a2d19be502793f0', '同L列值', { sameAs: 'current_address' }],
  [FILE_TITLE, '邮寄邮编（限12字）-签署方1 ', 'd4685544c235401395e6f6b08d13c7fb ', '', { fieldCode: 'postal_code' }],
  [FILE_TITLE, '甲方名称（限42字）-签署方1', '92b4e8ec2d0142449150d6239e7ed8dd', '同F列值', { sameAs: 'contract_subject' }],
];

const contractEsignFieldList = contractEsignColumns.map(([r1, r2, r3, r4, source], index) => ({
  ...source,
  alias: r2.trim(),
  header: [r1, r2, r3, r4],
  order: index + 1,
}));

const templateSeeds: TemplateSeed[] = [
  {
    templateName: '入职联系批导出模板',
    moduleCode: 'onboarding_contact',
    signPlatform: null,
    fieldList: onboardingContactFieldList,
  },
  {
    templateName: '劳动合同签订批导出模板-速创',
    moduleCode: 'contract',
    signPlatform: '速创',
    fieldList: contractSuchuangFieldList,
  },
  {
    templateName: '劳动合同签订批导出模板-e签宝',
    moduleCode: 'contract',
    signPlatform: 'E签宝',
    fieldList: contractEsignFieldList,
  },
];

export async function seedExportTemplates(dataSource: DataSource): Promise<void> {
  if (!(await hasTable(dataSource, 'export_templates'))) {
    return;
  }
  const userRepo = dataSource.getRepository(User);
  const templateRepo = dataSource.getRepository(ExportTemplate);

  const admin = (await userRepo.findOne({ where: { username: 'admin' } }))
    ?? (await userRepo.findOne({ where: { isActive: true } }));
  if (!admin) return;

  for (const seed of templateSeeds) {
    // 幂等键：templateName + moduleCode + signPlatform（contract 模块同名不同平台两套）。
    const existed = await templateRepo.findOne({
      where: {
        templateName: seed.templateName,
        moduleCode: seed.moduleCode,
        signPlatform: seed.signPlatform === null ? IsNull() : seed.signPlatform,
      },
    });
    if (existed) {
      continue;
    }

    await templateRepo.save(templateRepo.create({
      templateName: seed.templateName,
      moduleCode: seed.moduleCode,
      fieldList: seed.fieldList,
      createdBy: admin.id,
      isShared: true,
      signPlatform: seed.signPlatform,
    }));
  }
}

async function hasTable(dataSource: DataSource, tableName: string): Promise<boolean> {
  const rows = await dataSource.query<Array<{ exists: boolean }>>(
    'SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1) AS exists',
    [tableName],
  );
  return Boolean(rows[0]?.exists);
}
