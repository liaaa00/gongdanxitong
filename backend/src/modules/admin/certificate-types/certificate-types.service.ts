import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessScope, CertificateType } from 'src/entities';
import { CreateCertificateTypeDto, UpdateCertificateTypeDto } from './dto';

@Injectable()
export class CertificateTypesService {
  constructor(
    @InjectRepository(CertificateType)
    private readonly certificateTypeRepository: Repository<CertificateType>,
  ) {}

  async findAll(businessScope: BusinessScope = BusinessScope.BEILUN): Promise<CertificateType[]> {
    return this.certificateTypeRepository.find({ where: { businessScope }, order: { createdAt: 'ASC' } });
  }

  async findOne(id: string, businessScope: BusinessScope = BusinessScope.BEILUN): Promise<CertificateType> {
    const certificateType = await this.certificateTypeRepository.findOne({ where: { id, businessScope } });
    if (!certificateType) {
      throw new NotFoundException(`证明类型 ${id} 不存在`);
    }
    return certificateType;
  }

  async create(createDto: CreateCertificateTypeDto & { businessScope?: BusinessScope }): Promise<CertificateType> {
    const businessScope = createDto.businessScope ?? BusinessScope.BEILUN;
    const existing = await this.certificateTypeRepository.findOne({ where: { name: createDto.name, businessScope } });
    if (existing) {
      throw new ConflictException(`证明类型名称 ${createDto.name} 已存在`);
    }
    const certificateType = this.certificateTypeRepository.create({ ...createDto, businessScope });
    return this.certificateTypeRepository.save(certificateType);
  }

  async update(id: string, updateDto: UpdateCertificateTypeDto & { businessScope?: BusinessScope }): Promise<CertificateType> {
    const businessScope = updateDto.businessScope ?? BusinessScope.BEILUN;
    const certificateType = await this.findOne(id, businessScope);
    if (updateDto.name && updateDto.name !== certificateType.name) {
      const existing = await this.certificateTypeRepository.findOne({ where: { name: updateDto.name, businessScope } });
      if (existing) {
        throw new ConflictException(`证明类型名称 ${updateDto.name} 已存在`);
      }
    }
    Object.assign(certificateType, updateDto, { businessScope });
    return this.certificateTypeRepository.save(certificateType);
  }

  async remove(id: string, businessScope: BusinessScope = BusinessScope.BEILUN): Promise<void> {
    const certificateType = await this.findOne(id, businessScope);
    await this.certificateTypeRepository.remove(certificateType);
  }
}
