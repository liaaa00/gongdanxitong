import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionConfig, ModuleField, ModuleSupervisor, WorkOrderModuleConfig } from 'src/entities';
import { ModuleConfigsController } from './module-configs.controller';
import { ModuleConfigsService } from './module-configs.service';

@Module({
  imports: [TypeOrmModule.forFeature([WorkOrderModuleConfig, ModuleField, ModuleSupervisor, ActionConfig])],
  controllers: [ModuleConfigsController],
  providers: [ModuleConfigsService],
  exports: [ModuleConfigsService],
})
export class ModuleConfigsModule {}
