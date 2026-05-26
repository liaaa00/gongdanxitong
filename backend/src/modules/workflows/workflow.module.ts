import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowController } from './workflow.controller';
import { WorkflowDefinition } from './workflow.entity';
import { WorkflowService } from './workflow.service';

@Module({
  imports: [TypeOrmModule.forFeature([WorkflowDefinition])],
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
