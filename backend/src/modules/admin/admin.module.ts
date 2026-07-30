import { Module } from '@nestjs/common';
import { AiSettingsModule } from './ai-settings/ai-settings.module';
import { BranchesModule } from './branches/branches.module';
import { CertificateTypesModule } from './certificate-types/certificate-types.module';
import { CustomerAssigneesModule } from './customer-assignees/customer-assignees.module';
import { CustomersModule } from './customers/customers.module';
import { DepartmentsModule } from './departments/departments.module';
import { DetailViewTemplatesModule } from './detail-view-templates/detail-view-templates.module';
import { DispatchRulesModule } from './dispatch-rules/dispatch-rules.module';
import { ExceptionModuleHandlersModule } from './exception-module-handlers/exception-module-handlers.module';
import { ExportTemplatesModule } from './export-templates/export-templates.module';
import { FieldPermissionsModule } from './field-permissions/field-permissions.module';
import { FieldsModule } from './fields/fields.module';
import { LogsModule } from './logs/logs.module';
import { ModuleConfigsModule } from './module-configs/module-configs.module';
import { ModuleDelegationsModule } from './module-delegations/module-delegations.module';
import { ModuleHandlersModule } from './module-handlers/module-handlers.module';
import { RolesModule } from './roles/roles.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AiSettingsModule,
    BranchesModule,
    CertificateTypesModule,
    CustomerAssigneesModule,
    CustomersModule,
    DepartmentsModule,
    DetailViewTemplatesModule,
    DispatchRulesModule,
    ExceptionModuleHandlersModule,
    ExportTemplatesModule,
    FieldPermissionsModule,
    FieldsModule,
    LogsModule,
    ModuleConfigsModule,
    ModuleDelegationsModule,
    ModuleHandlersModule,
    RolesModule,
    SystemSettingsModule,
    UsersModule,
  ],
})
export class AdminModule {}
