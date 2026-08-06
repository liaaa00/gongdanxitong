import request from './request';
import { isMockMode, mockDelay } from './mock';

export interface ContractSubjectItem {
  id: string;
  subjectName: string;
  socialCreditCode: string | null;
  province: string;
  city: string;
  registeredAddress: string;
  isActive: boolean;
}

function normalizeSubject(raw: any): ContractSubjectItem {
  return {
    id: String(raw.id ?? ''),
    subjectName: String(raw.subjectName ?? raw.subject_name ?? ''),
    socialCreditCode: raw.socialCreditCode ?? raw.social_credit_code ?? null,
    province: String(raw.province ?? ''),
    city: String(raw.city ?? ''),
    registeredAddress: String(raw.registeredAddress ?? raw.registered_address ?? ''),
    isActive: raw.isActive ?? raw.is_active ?? true,
  };
}

export async function getContractSubjects(keyword?: string): Promise<ContractSubjectItem[]> {
  if (isMockMode) return mockDelay([]);
  const result = await request.get('/contract-subjects', { params: keyword ? { keyword } : undefined }) as any;
  const list = Array.isArray(result) ? result : (result?.items ?? result?.list ?? result?.data ?? []);
  return (Array.isArray(list) ? list : []).map(normalizeSubject).filter((item) => item.id && item.subjectName);
}
