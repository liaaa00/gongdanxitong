import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractSubject } from 'src/entities';

@Injectable()
export class ContractSubjectsService {
  constructor(
    @InjectRepository(ContractSubject)
    private readonly repository: Repository<ContractSubject>,
  ) {}

  async list(keyword?: string) {
    const qb = this.repository.createQueryBuilder('subject')
      .where('subject.is_active = true')
      .orderBy('subject.subject_name', 'ASC')
      .addOrderBy('subject.city', 'ASC')
      .take(200);
    const normalized = keyword?.trim();
    if (normalized) {
      qb.andWhere(
        '(subject.subject_name ILIKE :keyword OR subject.social_credit_code ILIKE :keyword OR subject.registered_address ILIKE :keyword OR subject.city ILIKE :keyword)',
        { keyword: '%' + normalized + '%' },
      );
    }
    const rows = await qb.getMany();
    return rows.map((subject) => ({
      id: subject.id,
      subjectName: subject.subjectName,
      socialCreditCode: subject.socialCreditCode,
      province: subject.province,
      city: subject.city,
      registeredAddress: subject.registeredAddress,
      isActive: subject.isActive,
    }));
  }
}
