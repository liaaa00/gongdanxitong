import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InServiceOrder } from 'src/entities';
import { ExportTemplatesModule } from 'src/modules/admin/export-templates/export-templates.module';
import { DispatchEngineModule } from 'src/modules/dispatch-engine/dispatch-engine.module';
import { InServiceOrdersController } from './in-service-orders.controller';
import { InServiceOrdersService } from './in-service-orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InServiceOrder]),
    DispatchEngineModule,
    ExportTemplatesModule,
  ],
  controllers: [InServiceOrdersController],
  providers: [InServiceOrdersService],
  exports: [InServiceOrdersService],
})
export class InServiceOrdersModule {}
