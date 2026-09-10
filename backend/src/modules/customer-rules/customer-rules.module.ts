import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer, CustomerPortalRule, WorkOrder } from 'src/entities';
import { CustomerRulesController } from './customer-rules.controller';
import { CustomerRulesService } from './customer-rules.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerPortalRule, Customer, WorkOrder])],
  controllers: [CustomerRulesController],
  providers: [CustomerRulesService],
  exports: [CustomerRulesService],
})
export class CustomerRulesModule {}
