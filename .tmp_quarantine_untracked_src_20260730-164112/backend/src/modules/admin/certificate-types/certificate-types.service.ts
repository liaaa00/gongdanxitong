import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CertificateType } from 'src/entities';
import { CreateCertificateTypeDto, UpdateCertificateTypeDto } from './certificate-types.dto';

@Injectable()
export class CertificateTypesService {
  constructor(
    @InjectRepository(CertificateType)
    private readonly certificateTypeRepo: Repository<CertificateType>,
  ) {}

  async findAll(): Promise<CertificateType[]> {
    return this.certificateTypeRepo.find({
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findOne(id: string): Promise<CertificateType | null> {
    return this.certificateTypeRepo.findOne({ where: { id } });
  }

  async create(dto: CreateCertificateTypeDto): Promise<CertificateType> {
    const certificateType = this.certificateTypeRepo.create({
      name: dto.name,
      description: dto.description,
      displayOrder: dto.displayOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
    return this.certificateTypeRepo.save(certificateType);
  }

  async update(id: string, dto: UpdateCertificateTypeDto): Promise<CertificateType> {
    const certificateType = await this.certificateTypeRepo.findOne({ where: { id } });
    if (!certificateType) {
      throw new Error('Certificate type not found');
    }

    if (dto.name !== undefined) certificateType.name = dto.name;
    if (dto.description !== undefined) certificateType.description = dto.description;
    if (dto.displayOrder !== undefined) certificateType.displayOrder = dto.displayOrder;
    if (dto.isActive !== undefined) certificateType.isActive = dto.isActive;

    return this.certificateTypeRepo.save(certificateType);
  }

  async remove(id: string): Promise<void> {
    await this.certificateTypeRepo.delete(id);
  }
}
