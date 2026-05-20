import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatchRule, FieldConfig, FieldPermission, WorkOrder } from 'src/entities';
import { DispatchModule } from 'src/modules/dispatch/dispatch.module';
import { FieldsController } from './fields.controller';
import { FieldsService } from './fields.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FieldConfig, FieldPermission, DispatchRule, WorkOrder]),
    DispatchModule,
  ],
  controllers: [FieldsController],
  providers: [FieldsService],
  exports: [FieldsService],
})
export class FieldsModule {}
