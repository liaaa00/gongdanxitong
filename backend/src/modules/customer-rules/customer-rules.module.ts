import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch, Customer, CustomerPortalRule, WorkOrder } from 'src/entities';
import { CustomerRulesController } from './customer-rules.controller';
import { CustomerRulesService } from './customer-rules.service';
import { PortalRuleApplicationService } from './portal-rule-application.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerPortalRule, Customer, WorkOrder, Branch])],
  controllers: [CustomerRulesController],
  providers: [CustomerRulesService, PortalRuleApplicationService],
  exports: [CustomerRulesService, PortalRuleApplicationService],
})
export class CustomerRulesModule {}
