import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModuleHandler, ModuleHandlerDelegation, User } from 'src/entities';
import { ModuleDelegationsController } from './module-delegations.controller';
import { ModuleDelegationsService } from './module-delegations.service';

@Module({
  imports: [TypeOrmModule.forFeature([ModuleHandlerDelegation, ModuleHandler, User])],
  controllers: [ModuleDelegationsController],
  providers: [ModuleDelegationsService],
  exports: [ModuleDelegationsService],
})
export class ModuleDelegationsModule {}
