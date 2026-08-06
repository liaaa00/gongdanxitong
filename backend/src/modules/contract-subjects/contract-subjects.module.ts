import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractSubject } from 'src/entities';
import { ContractSubjectsController } from './contract-subjects.controller';
import { ContractSubjectsService } from './contract-subjects.service';

@Module({
  imports: [TypeOrmModule.forFeature([ContractSubject])],
  controllers: [ContractSubjectsController],
  providers: [ContractSubjectsService],
  exports: [ContractSubjectsService],
})
export class ContractSubjectsModule {}
