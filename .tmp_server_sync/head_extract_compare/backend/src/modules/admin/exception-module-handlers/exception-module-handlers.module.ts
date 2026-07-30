import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExceptionModuleHandler } from 'src/entities';
import { ExceptionModuleHandlersController } from './exception-module-handlers.controller';
import { ExceptionModuleHandlersService } from './exception-module-handlers.service';

@Module({
  imports: [TypeOrmModule.forFeature([ExceptionModuleHandler])],
  controllers: [ExceptionModuleHandlersController],
  providers: [ExceptionModuleHandlersService],
  exports: [ExceptionModuleHandlersService],
})
export class ExceptionModuleHandlersModule {}
