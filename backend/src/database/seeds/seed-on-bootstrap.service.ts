import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { seedCustomers } from './seed-customers';
import { seedDepartments } from './seed-departments';
import { seedDispatchRules } from './seed-dispatch-rules';
import { seedExportTemplates } from './seed-export-templates';
import { seedFieldPermissions } from './seed-field-permissions';
import { seedFields } from './seed-fields';
import { seedModuleConfigs } from './seed-module-configs';
import { seedModuleHandlers } from './seed-module-handlers';
import { seedInServiceCategories } from './in-service-category.seed';
import { seedProvinceHandlers } from './province-handler.seed';
import { seedNotificationTemplates } from './seed-notification-templates';
import { seedRoles } from './seed-roles';
import { seedUsers } from './seed-users';
import { ensureWorkflowRuntimeSchema } from './database-schema-guard';
import { seedImportTemplateFields } from './seed-import-template-fields';

@Injectable()
export class SeedOnBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedOnBootstrapService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    const enabled = (process.env.AUTO_SEED ?? process.env.SEED_ON_BOOT ?? 'true').toLowerCase() !== 'false';
    if (!enabled) {
      this.logger.log('Startup seed skipped because AUTO_SEED/SEED_ON_BOOT is false');
      return;
    }

    await this.ensureStageAUserColumns();
    await ensureWorkflowRuntimeSchema(this.dataSource, this.logger);

    await seedRoles(this.dataSource);
    await seedDepartments(this.dataSource);
    await seedCustomers(this.dataSource);
    await seedUsers(this.dataSource);
    await seedFields(this.dataSource);
    await seedImportTemplateFields(this.dataSource);
    await seedDispatchRules(this.dataSource);
    await seedFieldPermissions(this.dataSource);
    await seedModuleHandlers(this.dataSource);
    await seedProvinceHandlers(this.dataSource);
    await seedModuleConfigs(this.dataSource);
    await seedInServiceCategories(this.dataSource);
    await seedExportTemplates(this.dataSource);
    await seedNotificationTemplates(this.dataSource);

    this.logger.log('Startup seed completed: roles, departments, customers, users, module handlers, module configs, rules and permissions are up to date');
  }

  private async ensureStageAUserColumns(): Promise<void> {
    // P0 guard: AUTO_SEED may run before operators execute Stage A migrations in older local DBs.
    // Check first so normal production users that can read/write but do not own the table do not fail on ALTER.
    const rows = await this.dataSource.query<Array<{ column_name: string }>>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'users'
          AND column_name IN ('group_code', 'must_change_password', 'password_updated_at')
      `,
    );
    const existingColumns = new Set(rows.map((row) => row.column_name));

    if (!existingColumns.has('group_code')) {
      await this.dataSource.query('ALTER TABLE users ADD COLUMN group_code varchar(32) NULL');
    }
    if (!existingColumns.has('must_change_password')) {
      await this.dataSource.query('ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT true');
    }
    if (!existingColumns.has('password_updated_at')) {
      await this.dataSource.query('ALTER TABLE users ADD COLUMN password_updated_at timestamptz NULL');
    }
  }
}
