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

function normalizeFundLocation(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/工业园区/g, '园区')
    .replace(/自治区|自治州|省|市|区|县/g, '')
    .replace(/[\\/|,，、\-\s]/g, '');
}

export function findFundRuleForLocation(
  rules: ContractSubjectItem[],
  location: string,
): ContractSubjectItem | undefined {
  const normalized = normalizeFundLocation(location);
  if (!normalized) return undefined;
  return rules.find((rule) => (
    normalizeFundLocation(rule.subjectName) === normalized
    || normalizeFundLocation(rule.city) === normalized
  ));
}

const MOCK_FUND_RULES: ContractSubjectItem[] = [
  {
    id: 'mock-fund-rule-ningbo',
    subjectName: '浙江省/宁波市',
    socialCreditCode: null,
    province: '浙江省',
    city: '宁波市',
    registeredAddress: '',
    fundRatioOptions: ['5%+5%', '6%+6%', '7%+7%', '8%+8%', '9%+9%', '10%+10%', '11%+11%', '12%+12%'],
    supplementaryFundRatioOptions: [],
    fundRatioMode: 'same',
    isActive: true,
  },
  {
    id: 'mock-fund-rule-hangzhou',
    subjectName: '浙江省/杭州',
    socialCreditCode: null,
    province: '浙江省',
    city: '杭州',
    registeredAddress: '',
    fundRatioOptions: ['5%+5%', '6%+6%', '7%+7%', '8%+8%', '9%+9%', '10%+10%', '11%+11%', '12%+12%'],
    supplementaryFundRatioOptions: [],
    fundRatioMode: 'same',
    isActive: true,
  },
];

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

export async function getContractSubjects(keyword?: string, forceReal = false): Promise<ContractSubjectItem[]> {
  if (isMockMode && !forceReal) return mockDelay([]);
  const result = await request.get('/contract-subjects', { params: keyword ? { keyword } : undefined }) as any;
  const list = Array.isArray(result) ? result : (result?.items ?? result?.list ?? result?.data ?? []);
  return (Array.isArray(list) ? list : []).map(normalizeSubject).filter((item) => item.id && item.subjectName);
}

export async function getFundLocations(forceReal = false): Promise<string[]> {
  if (isMockMode && !forceReal) {
    return mockDelay(Array.from(new Set(MOCK_FUND_RULES.map((rule) => rule.city))).sort((left, right) => left.localeCompare(right, 'zh-CN')));
  }
  const result = await request.get('/contract-subjects/fund-locations') as any;
  const list = Array.isArray(result) ? result : (result?.items ?? result?.list ?? result?.data ?? []);
  return (Array.isArray(list) ? list : []).map(String).map((item) => item.trim()).filter(Boolean);
}

/** 公积金比例按缴纳地读取；返回值复用比例结构，subjectName 为城市键。 */
export async function getFundRulesByLocation(location?: string): Promise<ContractSubjectItem[]> {
  const normalizedLocation = location?.trim();
  if (!normalizedLocation) return [];
  if (isMockMode) {
    const matched = findFundRuleForLocation(MOCK_FUND_RULES, normalizedLocation);
    return mockDelay(matched ? [matched] : []);
  }
  const result = await request.get('/contract-subjects/fund-rules', {
    params: { location: normalizedLocation },
  }) as any;
  const list = Array.isArray(result) ? result : (result?.items ?? result?.list ?? result?.data ?? []);
  return (Array.isArray(list) ? list : []).map(normalizeSubject).filter((item) => item.id && item.subjectName);
}
