import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModuleHandler, User } from 'src/entities';
import { ModuleHandlersController } from './module-handlers.controller';
import { ModuleHandlersService } from './module-handlers.service';

@Module({
  imports: [TypeOrmModule.forFeature([ModuleHandler, User])],
  controllers: [ModuleHandlersController],
  providers: [ModuleHandlersService],
  exports: [ModuleHandlersService],
})
export class ModuleHandlersModule {}
