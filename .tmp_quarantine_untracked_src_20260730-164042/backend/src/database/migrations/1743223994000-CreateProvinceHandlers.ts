import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProvinceHandlers1743223994000 implements MigrationInterface {
  name = 'CreateProvinceHandlers1743223994000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "province_handlers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "province" varchar(64) NOT NULL,
        "handler_id" uuid NOT NULL,
        "weight" int NOT NULL DEFAULT 1,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_province_handlers" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_province_handlers_province" ON "province_handlers" ("province")
    `);

    await queryRunner.query(`
      ALTER TABLE "province_handlers" ADD CONSTRAINT "FK_province_handlers_handler"
      FOREIGN KEY ("handler_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "province_handlers" DROP CONSTRAINT "FK_province_handlers_handler"
    `);
    await queryRunner.query(`DROP INDEX "IDX_province_handlers_province"`);
    await queryRunner.query(`DROP TABLE "province_handlers"`);
  }
}
