import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FieldConfig, FieldPermission, Role } from 'src/entities';
import { FieldPermissionController } from './field-permission.controller';
import { FieldPermissionService } from './field-permission.service';

@Module({
  imports: [TypeOrmModule.forFeature([FieldPermission, Role, FieldConfig])],
  controllers: [FieldPermissionController],
  providers: [FieldPermissionService],
  exports: [FieldPermissionService],
})
export class FieldPermissionsModule {}
