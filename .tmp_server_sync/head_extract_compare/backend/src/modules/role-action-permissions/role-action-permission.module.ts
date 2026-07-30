import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSetting } from 'src/entities';
import { RoleActionPermissionController } from './role-action-permission.controller';
import { RoleActionPermissionService } from './role-action-permission.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SystemSetting])],
  controllers: [RoleActionPermissionController],
  providers: [RoleActionPermissionService],
  exports: [RoleActionPermissionService],
})
export class RoleActionPermissionModule {}
