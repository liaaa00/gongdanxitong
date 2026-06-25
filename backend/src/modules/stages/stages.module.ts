import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderStage } from 'src/entities';
import { StagesController } from './stages.controller';
import { StagesService } from './stages.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderStage])],
  controllers: [StagesController],
  providers: [StagesService],
  exports: [StagesService],
})
export class StagesModule {}
