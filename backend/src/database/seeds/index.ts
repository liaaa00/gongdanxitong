import AppDataSource from 'src/database/data-source';
import { seedCustomers } from './seed-customers';
import { seedDepartments } from './seed-departments';
import { seedDispatchRules } from './seed-dispatch-rules';
import { seedFieldPermissions } from './seed-field-permissions';
import { seedFields } from './seed-fields';
import { seedModuleConfigs } from './seed-module-configs';
import { seedModuleHandlers } from './seed-module-handlers';
import { seedNotificationTemplates } from './seed-notification-templates';
import { seedRoles } from './seed-roles';
import { seedUsers } from './seed-users';

async function runSeeds(): Promise<void> {
  await AppDataSource.initialize();

  try {
    await seedRoles(AppDataSource);
    await seedDepartments(AppDataSource);
    await seedCustomers(AppDataSource);
    await seedUsers(AppDataSource);
    await seedFields(AppDataSource);
    await seedDispatchRules(AppDataSource);
    await seedFieldPermissions(AppDataSource);
    await seedModuleHandlers(AppDataSource);
    await seedModuleConfigs(AppDataSource);
    await seedNotificationTemplates(AppDataSource);
    // eslint-disable-next-line no-console
    console.log('Seed completed successfully');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Seed failed', error);
    process.exitCode = 1;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

void runSeeds();
