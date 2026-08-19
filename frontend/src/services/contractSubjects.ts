import request from './request';
import { isMockMode, mockDelay } from './mock';

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

export function getAllowedFundRatios(subject: ContractSubjectItem | undefined): string[] {
  if (!subject) return [];
  if (subject.fundRatioMode !== 'separate') return subject.fundRatioOptions;
  const values = subject.fundRatioOptions
    .map((option) => option.match(/^(\d+)%\+(\d+)%$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => Number(match[1]));
  return values.flatMap((unit) => values.map((personal) => `${unit}%+${personal}%`));
}

function normalizeSubject(raw: any): ContractSubjectItem {
  return {
    id: String(raw.id ?? ''),
    subjectName: String(raw.subjectName ?? raw.subject_name ?? ''),
    socialCreditCode: raw.socialCreditCode ?? raw.social_credit_code ?? null,
    province: String(raw.province ?? ''),
    city: String(raw.city ?? ''),
    registeredAddress: String(raw.registeredAddress ?? raw.registered_address ?? ''),
    fundRatioOptions: Array.isArray(raw.fundRatioOptions ?? raw.fund_ratio_options)
      ? (raw.fundRatioOptions ?? raw.fund_ratio_options).map(String)
      : [],
    supplementaryFundRatioOptions: Array.isArray(raw.supplementaryFundRatioOptions ?? raw.supplementary_fund_ratio_options)
      ? (raw.supplementaryFundRatioOptions ?? raw.supplementary_fund_ratio_options).map(String)
      : [],
    fundRatioMode: (raw.fundRatioMode ?? raw.fund_ratio_mode) === 'separate' ? 'separate' : 'same',
    isActive: raw.isActive ?? raw.is_active ?? true,
  };
}

export async function getContractSubjects(keyword?: string): Promise<ContractSubjectItem[]> {
  if (isMockMode) return mockDelay([]);
  const result = await request.get('/contract-subjects', { params: keyword ? { keyword } : undefined }) as any;
  const list = Array.isArray(result) ? result : (result?.items ?? result?.list ?? result?.data ?? []);
  return (Array.isArray(list) ? list : []).map(normalizeSubject).filter((item) => item.id && item.subjectName);
}
