import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatchedOrder, OutOfProvinceOrder, WorkOrder } from 'src/entities';
import { WorkOrderModule } from 'src/modules/work-orders/work-order.module';
import { OutOfProvinceOrdersController } from './out-of-province-orders.controller';
import { OutOfProvinceOrdersService } from './out-of-province-orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkOrder, DispatchedOrder, OutOfProvinceOrder]),
    WorkOrderModule,
  ],
  controllers: [OutOfProvinceOrdersController],
  providers: [OutOfProvinceOrdersService],
  exports: [OutOfProvinceOrdersService],
})
export class OutOfProvinceOrdersModule {}
