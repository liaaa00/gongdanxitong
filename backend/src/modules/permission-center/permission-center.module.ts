import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionConfigVersionEntity } from './entities/permission-config-version.entity';
import { PermissionChangeLogEntity } from './entities/permission-change-log.entity';
import { PermissionCenterService } from './services/permission-center.service';
import { PermissionCenterController } from './controllers/permission-center.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PermissionConfigVersionEntity,
      PermissionChangeLogEntity,
    ]),
  ],
  controllers: [PermissionCenterController],
  providers: [PermissionCenterService],
  exports: [PermissionCenterService],
})
export class PermissionCenterModule {}
