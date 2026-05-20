import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatchRule, DispatchedOrder, ModuleHandler } from 'src/entities';
import { FieldPermissionsModule } from 'src/modules/field-permissions/field-permissions.module';
import { AstEvaluator } from './ast-evaluator';
import { DispatchEngineService } from './dispatch-engine.service';
import { HandlerPickerService } from './handler-picker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DispatchRule, ModuleHandler, DispatchedOrder]),
    FieldPermissionsModule,
  ],
  providers: [AstEvaluator, HandlerPickerService, DispatchEngineService],
  exports: [AstEvaluator, HandlerPickerService, DispatchEngineService],
})
export class DispatchEngineModule {}
