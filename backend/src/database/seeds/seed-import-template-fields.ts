import { DataSource } from 'typeorm';
import { ImportTemplateField, OrderType } from 'src/entities';

// 入职模板63字段新顺序：客户必填12字段（A-L列，标黄） + 业务/后道51字段（M-BK列，不标黄）
const ONBOARDING_TEMPLATE_ORDER = [
  // === 客户必填12字段（A-L列，即Excel的B-M列，应标黄） ===
  'customer_name',        // 1. A列(Excel B列) 客户名称
  'employee_name',        // 2. B列(Excel C列) 姓名
  'id_card_type',         // 3. C列 证件类型
  'id_card_no',           // 4. D列 证件号码
  'mobile',               // 5. E列 移动电话
  'position',             // 6. F列 岗位
  'contract_start_date',  // 7. G列 合同开始日期
  'work_city',            // 8. H列 工作城市
  'base_salary',          // 9. I列 基本工资
  'social_location',      // 10. J列 参保地
  'bank_account',         // 11. K列 银行借记卡帐号
  'bank_name',            // 12. L列 开户银行信息

  // === 业务/后道51字段（M-BK列，即Excel的N-BK列，不标黄） ===
  // 客户基础信息（业务判断用）
  'customer_code',        // 13. M列 客户代码（业务判断项，不标黄）
  'outsource_type',       // 14. N列 外包类型（业务判断项，不标黄）

  // 员工详细信息
  'position_type',        // 15. O列 岗位类型
  'household_type',       // 16. P列 户籍性质
  'ethnicity',            // 17. Q列 民族
  'education',            // 18. R列 学历
  'graduation_school',    // 19. S列 毕业院校（厦门特殊字段）
  'major',                // 20. T列 专业（厦门特殊字段）
  'graduation_date',      // 21. U列 毕业时间（厦门特殊字段）
  'marital_status',       // 22. V列 婚姻状况
  'email',                // 23. W列 电子邮件
  'current_address',      // 24. X列 现住地址
  'household_address',    // 25. Y列 户籍地址
  'postal_code',          // 26. Z列 邮编

  // 合同信息
  'contract_term_type',   // 27. AA列 合同期限形式
  'contract_term',        // 28. AB列 合同期限
  'contract_end_date',    // 29. AC列 合同终止日期
  'probation_start_date', // 30. AD列 试用期开始日期
  'probation_months',     // 31. AE列 试用期（月）
  'probation_end_date',   // 32. AF列 试用期结束日期

  // 薪资信息
  'work_hour_system',     // 33. AG列 工时制
  'salary_form',          // 34. AH列 工资形式
  'other_salary',         // 35. AI列 其他工资
  'probation_salary',     // 36. AJ列 试用期工资
  'probation_other_salary', // 37. AK列 试用期其他工资
  'payroll_cycle',        // 38. AL列 发薪周期
  'payroll_date',         // 39. AM列 发薪日期

  // 社保公积金
  'start_month',          // 40. AN列 参保起始月
  'social_base',          // 41. AO列 社保基数
  'fund_base',            // 42. AP列 公积金基数
  'fund_ratio',           // 43. AQ列 公积金比例

  // 其他
  'remark',               // 44. AR列 备注

  // === 业务判断项（AS-BK列，不标黄） ===
  'business_mode',              // 45. AS列
  'employee_type',              // 46. AT列
  'need_company_contract',      // 47. AU列
  'need_esign',                 // 48. AV列
  'esign_platform',             // 49. AW列
  'contract_subject',           // 50. AX列
  'company_address',            // 51. AY列 甲方住所
  'project_name',               // 52. AZ列
  'work_arrangement',           // 53. BA列
  'contract_template',          // 54. BB列
  'need_contract_urge',         // 55. BC列
  'need_onboarding_contact',    // 56. BD列
  'feedback_deadline',          // 57. BE列
  'is_common_template',         // 58. BF列
  'template_name',              // 59. BG列
  'need_company_payroll',       // 60. BH列
  'payroll_location',           // 61. BI列
  'social_urge',                // 62. BJ列
  'special_remark',             // 63. BK列
];

export async function seedImportTemplateFields(dataSource: DataSource): Promise<void> {
  await dataSource.query('SELECT pg_advisory_lock(hashtext($1))', ['seedImportTemplateFields']);
  try {
    const repository = dataSource.getRepository(ImportTemplateField);

    // 清除现有配置
    await repository.delete({ orderType: OrderType.ONBOARDING });

    // 插入新配置
    for (let i = 0; i < ONBOARDING_TEMPLATE_ORDER.length; i++) {
      const fieldCode = ONBOARDING_TEMPLATE_ORDER[i];
      await repository.save(
        repository.create({
          orderType: OrderType.ONBOARDING,
          fieldCode,
          displayOrder: i + 1,
          headerAlias: null,
          isRequiredOverride: null,
          isActive: true,
        }),
      );
    }

    console.log(`✓ 已配置入职导入模板 ${ONBOARDING_TEMPLATE_ORDER.length} 个字段`);
  } finally {
    await dataSource.query('SELECT pg_advisory_unlock(hashtext($1))', ['seedImportTemplateFields']).catch(() => undefined);
  }
}
