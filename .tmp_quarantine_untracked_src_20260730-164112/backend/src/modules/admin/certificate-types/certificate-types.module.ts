import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CertificateType } from 'src/entities';
import { CertificateTypesController } from './certificate-types.controller';
import { CertificateTypesService } from './certificate-types.service';

@Module({
  imports: [TypeOrmModule.forFeature([CertificateType])],
  controllers: [CertificateTypesController],
  providers: [CertificateTypesService],
  exports: [CertificateTypesService],
})
export class CertificateTypesModule {}
