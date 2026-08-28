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

export function normalizeFundLocation(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/工业园区/g, '园区')
    .replace(/自治区|自治州|省|市|区|县/g, '')
    .replace(/[\\/|,，、\-\s]/g, '');
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

  async listFundLocations(): Promise<string[]> {
    const rules = await this.listFundLocationRules();
    return rules.map((rule) => rule.city.trim()).filter(Boolean);
  }

  async listFundLocationRules(): Promise<ContractSubjectItem[]> {
    const sourceRules = await this.listAllFundRules();
    const grouped = new Map<string, ContractSubjectItem>();
    for (const rule of sourceRules) {
      const key = normalizeFundLocation(rule.city);
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, { ...rule, id: `location-city:${rule.city}` });
        continue;
      }
      current.fundRatioOptions = Array.from(new Set([...current.fundRatioOptions, ...rule.fundRatioOptions]));
      current.supplementaryFundRatioOptions = Array.from(new Set([
        ...current.supplementaryFundRatioOptions,
        ...rule.supplementaryFundRatioOptions,
      ]));
      if (rule.fundRatioMode === 'separate') current.fundRatioMode = 'separate';
    }
    return Array.from(grouped.values());
  }

  async listAllFundRules(): Promise<ContractSubjectItem[]> {
    const rows = await this.repository.find({ where: { isActive: true }, order: { province: 'ASC', city: 'ASC' } });
    const grouped = new Map<string, ContractSubjectItem>();
    for (const row of rows) {
      const locationKey = `${row.province}/${row.city}`;
      const current = grouped.get(locationKey);
      const item = this.toItem(row);
      if (!current) {
        grouped.set(locationKey, { ...item, id: `location:${locationKey}`, subjectName: locationKey, registeredAddress: '' });
        continue;
      }
      current.fundRatioOptions = Array.from(new Set([...current.fundRatioOptions, ...item.fundRatioOptions]));
      current.supplementaryFundRatioOptions = Array.from(new Set([
        ...current.supplementaryFundRatioOptions,
        ...item.supplementaryFundRatioOptions,
      ]));
      if (item.fundRatioMode === 'separate') current.fundRatioMode = 'separate';
    }
    return Array.from(grouped.values());
  }

  async listFundRules(location?: string): Promise<ContractSubjectItem[]> {
    const normalized = location?.trim() ? normalizeFundLocation(location) : '';
    if (!normalized) return [];
    const cityRules = await this.listFundLocationRules();
    const exactCityRules = cityRules.filter((rule) => normalizeFundLocation(rule.city) === normalized);
    if (exactCityRules.length > 0) return exactCityRules;
    const fullRules = await this.listAllFundRules();
    return fullRules.filter((rule) => normalizeFundLocation(rule.subjectName) === normalized);
  }

  async findFundRuleByLocation(location: string): Promise<ContractSubjectItem | null> {
    const rules = await this.listFundRules(location);
    return rules[0] ?? null;
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
