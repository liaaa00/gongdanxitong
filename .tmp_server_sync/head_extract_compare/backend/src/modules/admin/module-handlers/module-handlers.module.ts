import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModuleHandler } from 'src/entities';
import { ModuleHandlersController } from './module-handlers.controller';
import { ModuleHandlersService } from './module-handlers.service';

@Module({
  imports: [TypeOrmModule.forFeature([ModuleHandler])],
  controllers: [ModuleHandlersController],
  providers: [ModuleHandlersService],
  exports: [ModuleHandlersService],
})
export class ModuleHandlersModule {}
