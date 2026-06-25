import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FieldConfig, FieldPermission, Role, UserRole } from 'src/entities';
import { FieldPermissionInterceptor } from './field-permission.interceptor';
import { FieldPermissionService } from './field-permission.service';

@Module({
  imports: [TypeOrmModule.forFeature([FieldPermission, FieldConfig, UserRole, Role])],
  providers: [FieldPermissionService, FieldPermissionInterceptor],
  exports: [FieldPermissionService, FieldPermissionInterceptor],
})
export class FieldPermissionsModule {}
