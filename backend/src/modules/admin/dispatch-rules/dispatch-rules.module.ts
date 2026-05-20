import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatchRule, ModuleHandler } from 'src/entities';
import { DispatchModule } from 'src/modules/dispatch/dispatch.module';
import { DispatchConfigController } from './dispatch-config.controller';
import { DispatchRulesController } from './dispatch-rules.controller';
import { DispatchRulesService } from './dispatch-rules.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DispatchRule, ModuleHandler]),
    DispatchModule,
  ],
  controllers: [DispatchRulesController, DispatchConfigController],
  providers: [DispatchRulesService],
  exports: [DispatchRulesService],
})
export class DispatchRulesModule {}
