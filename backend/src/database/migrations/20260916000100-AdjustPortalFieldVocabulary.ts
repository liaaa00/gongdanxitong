import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 门户修改更新 · 批次1（2026-09-16 用户拍板口径）：
 * 1. 户籍地址 household_address：必填 → 非必填（isRequired / defaultRequired 同时置 false）。
 * 2. 现住址 current_address：编码不动；显示名"现住地址"→"现住址（文书送达地址）"；
 *    分组从"基本信息"挪到"合同与用工信息"（seed 现有组名，不新增组）；help_text 按字段表补齐；
 *    display_order 排到"合同与用工信息"组尾；条件必填规则（need_onboarding_contact=否 时必填）保持不变。
 * 3. 学历 education：6 项（含合并项"高中/职高/中专"）→ 8 项拆分；
 *    历史工单已存的合并值"高中/职高/中专"不改写，导入/展示侧兼容读取。
 * seed-fields.ts 对已存在记录是 continue，故运行时变更必须走本 migration；seed 本体同步修改保证新装环境一致。
 */
export class AdjustPortalFieldVocabulary20260916000100 implements MigrationInterface {
  name = 'AdjustPortalFieldVocabulary20260916000100';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1) 户籍地址 → 非必填（仅放开必填开关，正则/帮助文案等其余口径不动）。
    await queryRunner.query(`
      UPDATE field_configs
         SET is_required = false,
             default_required = false
       WHERE field_code = 'household_address'
    `);

    // 2) 现住址：改名 + help_text + 分组迁移 + 组内排序（条件必填 conditional_required 不动）。
    await queryRunner.query(`
      UPDATE field_configs
         SET field_name = '现住址（文书送达地址）',
             help_text = '入职材料不需要集约收集时必填。格式：X省X市X区X路X号X室。提示：如不由外服联系员工收集该信息，则需在本次收集页面填写',
             collection_group = '合同与用工信息',
             display_order = COALESCE((
               SELECT MAX(f2.display_order) + 1
                 FROM field_configs f2
                WHERE f2.collection_group = '合同与用工信息'
                  AND f2.field_code <> 'current_address'
             ), 100)
       WHERE field_code = 'current_address'
    `);

    // 3) 学历拆 8 项。历史 work_orders.extra_data 中的"高中/职高/中专"等旧值一律不动。
    await queryRunner.query(`
      UPDATE field_configs
         SET dropdown_options = '["初中及以下","高中","职高","中专","大专","大学本科","硕士","博士及以上"]'::jsonb
       WHERE field_code = 'education'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET is_required = true,
             default_required = true
       WHERE field_code = 'household_address'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET field_name = '现住地址',
             help_text = '入职材料不需要集约收集时必填。格式：X省X市X区X路X号X室。',
             collection_group = '基本信息',
             display_order = COALESCE((
               SELECT MIN(f2.display_order) - 1
                 FROM field_configs f2
                WHERE f2.collection_group = '基本信息'
                  AND f2.field_code <> 'current_address'
             ), 1)
       WHERE field_code = 'current_address'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET dropdown_options = '["初中及以下","高中/职高/中专","大专","大学本科","硕士","博士及以上"]'::jsonb
       WHERE field_code = 'education'
    `);
  }
}
