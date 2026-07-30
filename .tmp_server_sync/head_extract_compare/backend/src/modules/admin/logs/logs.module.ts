import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FieldConfig, OperationLog } from 'src/entities';
import { LogsController, OperationLogsController } from './logs.controller';
import { LogsService } from './logs.service';

@Module({
  imports: [TypeOrmModule.forFeature([OperationLog, FieldConfig])],
  controllers: [LogsController, OperationLogsController],
  providers: [LogsService],
  exports: [LogsService],
})
export class LogsModule {}
