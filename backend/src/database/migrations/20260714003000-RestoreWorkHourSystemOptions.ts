import { MigrationInterface, QueryRunner } from 'typeorm';

const workHourSystemOptions = JSON.stringify(['标准工时制', '综合工时制', '不定时工时制']);
const previousWorkHourSystemOptions = JSON.stringify(['标准工时制']);

export class RestoreWorkHourSystemOptions20260714003000 implements MigrationInterface {
  name = 'RestoreWorkHourSystemOptions20260714003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET dropdown_options = $1::jsonb,
             help_text = NULL
       WHERE field_code = 'work_hour_system'
    `, [workHourSystemOptions]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET dropdown_options = $1::jsonb,
             help_text = $2
       WHERE field_code = 'work_hour_system'
    `, [previousWorkHourSystemOptions, '目前只保留标准工时制。']);
  }
}
