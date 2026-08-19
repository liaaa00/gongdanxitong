import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractSubject } from 'src/entities';

export interface ContractSubjectItem {
  id: string;
  subjectName: string;
  socialCreditCode: string | null;
  province: string;
  city: string;
  registeredAddress: string;
  fundRatioOptions: string[];
  supplementaryFundRatioOptions: string[];
  fundRatioMode: 'same' | 'separate';
  isActive: boolean;
}

export function getAllowedFundRatios(subject: ContractSubjectItem | null | undefined): string[] {
  if (!subject) return [];
  if (subject.fundRatioMode !== 'separate') return subject.fundRatioOptions ?? [];
  const values = (subject.fundRatioOptions ?? [])
    .map((option) => option.match(/^(\d+)%\+(\d+)%$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => Number(match[1]));
  return values.flatMap((unit) => values.map((personal) => `${unit}%+${personal}%`));
}

@Injectable()
export class ContractSubjectsService {
  constructor(
    @InjectRepository(ContractSubject)
    private readonly repository: Repository<ContractSubject>,
  ) {}

  async findByName(subjectName: string): Promise<ContractSubjectItem | null> {
    const subject = await this.repository.findOne({
      where: { subjectName: subjectName.trim(), isActive: true },
    });
    return subject ? this.toItem(subject) : null;
  }

  async list(keyword?: string): Promise<ContractSubjectItem[]> {
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
    return rows.map((subject) => this.toItem(subject));
  }

  private toItem(subject: ContractSubject): ContractSubjectItem {
    return {
      id: subject.id,
      subjectName: subject.subjectName,
      socialCreditCode: subject.socialCreditCode,
      province: subject.province,
      city: subject.city,
      registeredAddress: subject.registeredAddress,
      fundRatioOptions: subject.fundRatioOptions ?? [],
      supplementaryFundRatioOptions: subject.supplementaryFundRatioOptions ?? [],
      fundRatioMode: subject.fundRatioMode ?? 'same',
      isActive: subject.isActive,
    };
  }
}
