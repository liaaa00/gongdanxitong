import { Module } from '@nestjs/common';
import { AiSettingsModule } from './ai-settings/ai-settings.module';
import { BranchesModule } from './branches/branches.module';
import { CustomerAssigneesModule } from './customer-assignees/customer-assignees.module';
import { CustomersModule } from './customers/customers.module';
import { DepartmentsModule } from './departments/departments.module';
import { DispatchRulesModule } from './dispatch-rules/dispatch-rules.module';
import { ExceptionModuleHandlersModule } from './exception-module-handlers/exception-module-handlers.module';
import { ExportTemplatesModule } from './export-templates/export-templates.module';
import { FieldPermissionsModule } from './field-permissions/field-permissions.module';
import { FieldsModule } from './fields/fields.module';
import { LogsModule } from './logs/logs.module';
import { ModuleConfigsModule } from './module-configs/module-configs.module';
import { ModuleHandlersModule } from './module-handlers/module-handlers.module';
import { RolesModule } from './roles/roles.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AiSettingsModule,
    BranchesModule,
    CustomerAssigneesModule,
    CustomersModule,
    DepartmentsModule,
    DispatchRulesModule,
    ExceptionModuleHandlersModule,
    ExportTemplatesModule,
    FieldPermissionsModule,
    FieldsModule,
    LogsModule,
    ModuleConfigsModule,
    ModuleHandlersModule,
    RolesModule,
    SystemSettingsModule,
    UsersModule,
  ],
})
export class AdminModule {}
