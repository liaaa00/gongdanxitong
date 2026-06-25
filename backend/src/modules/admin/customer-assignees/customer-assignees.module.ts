import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer, CustomerAssignee, User } from 'src/entities';
import { CustomerAssigneesController } from './customer-assignees.controller';
import { CustomerAssigneesService } from './customer-assignees.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerAssignee, Customer, User])],
  controllers: [CustomerAssigneesController],
  providers: [CustomerAssigneesService],
  exports: [CustomerAssigneesService],
})
export class CustomerAssigneesModule {}
