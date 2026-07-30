import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DetailViewTemplate } from 'src/entities';
import { DetailViewTemplatesController } from './detail-view-templates.controller';
import { DetailViewTemplatesService } from './detail-view-templates.service';

@Module({
  imports: [TypeOrmModule.forFeature([DetailViewTemplate])],
  controllers: [DetailViewTemplatesController],
  providers: [DetailViewTemplatesService],
  exports: [DetailViewTemplatesService],
})
export class DetailViewTemplatesModule {}
