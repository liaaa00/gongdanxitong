import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CertificateType } from 'src/entities';
import { CreateCertificateTypeDto, UpdateCertificateTypeDto } from './dto';

@Injectable()
export class CertificateTypesService {
  constructor(
    @InjectRepository(CertificateType)
    private readonly certificateTypeRepository: Repository<CertificateType>,
  ) {}

  async findAll(): Promise<CertificateType[]> {
    return this.certificateTypeRepository.find({ order: { createdAt: 'ASC' } });
  }

  async findOne(id: string): Promise<CertificateType> {
    const certificateType = await this.certificateTypeRepository.findOne({ where: { id } });
    if (!certificateType) {
      throw new NotFoundException(`证明类型 ${id} 不存在`);
    }
    return certificateType;
  }

  async create(createDto: CreateCertificateTypeDto): Promise<CertificateType> {
    const existing = await this.certificateTypeRepository.findOne({ where: { name: createDto.name } });
    if (existing) {
      throw new ConflictException(`证明类型名称 ${createDto.name} 已存在`);
    }
    const certificateType = this.certificateTypeRepository.create(createDto);
    return this.certificateTypeRepository.save(certificateType);
  }

  async update(id: string, updateDto: UpdateCertificateTypeDto): Promise<CertificateType> {
    const certificateType = await this.findOne(id);
    if (updateDto.name && updateDto.name !== certificateType.name) {
      const existing = await this.certificateTypeRepository.findOne({ where: { name: updateDto.name } });
      if (existing) {
        throw new ConflictException(`证明类型名称 ${updateDto.name} 已存在`);
      }
    }
    Object.assign(certificateType, updateDto);
    return this.certificateTypeRepository.save(certificateType);
  }

  async remove(id: string): Promise<void> {
    const certificateType = await this.findOne(id);
    await this.certificateTypeRepository.remove(certificateType);
  }
}
