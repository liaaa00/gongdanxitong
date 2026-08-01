import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { PermissionConfigVersionEntity } from './entities/permission-config-version.entity';
import { PermissionChangeLogEntity } from './entities/permission-change-log.entity';
import { PermissionCenterService } from './services/permission-center.service';
import { PermissionCacheService } from './services/permission-cache.service';
import { PermissionCenterController } from './controllers/permission-center.controller';
import { PermissionNotificationGateway } from './gateways/permission-notification.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PermissionConfigVersionEntity,
      PermissionChangeLogEntity,
    ]),
    CacheModule.register({
      ttl: 3600, // 1 hour default TTL
      max: 100, // maximum number of items in cache
    }),
  ],
  controllers: [PermissionCenterController],
  providers: [
    PermissionCenterService,
    PermissionCacheService,
    PermissionNotificationGateway,
  ],
  exports: [PermissionCenterService],
})
export class PermissionCenterModule {}
