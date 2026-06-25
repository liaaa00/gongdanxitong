import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatchedOrder, DispatchRule, ModuleHandler } from 'src/entities';
import { AstValidator } from './ast.validator';
import { ConditionEvaluatorService } from './condition-evaluator.service';
import { DispatchEngineService } from './dispatch-engine.service';
import { HandlerPickerService } from 'src/modules/dispatch-engine/handler-picker.service';

@Module({
  imports: [TypeOrmModule.forFeature([DispatchRule, ModuleHandler, DispatchedOrder])],
  providers: [
    AstValidator,
    ConditionEvaluatorService,
    HandlerPickerService,
    DispatchEngineService,
  ],
  exports: [AstValidator, ConditionEvaluatorService, HandlerPickerService, DispatchEngineService],
})
export class DispatchModule {}
