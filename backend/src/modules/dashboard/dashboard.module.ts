import { Module } from '@nestjs/common';
import { WorkOrderModule } from 'src/modules/work-orders/work-order.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [WorkOrderModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
