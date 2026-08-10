import request from './request';
import { isMockMode, mockDelay } from './mock';

export interface OutOfProvinceAccount {
  unitName: string;
  province: string;
  city: string;
  socialHandler: string;
  businessOwner: string;
}

function normalizeAccount(raw: any): OutOfProvinceAccount {
  return {
    unitName: String(raw.unitName ?? raw.unit_name ?? ''),
    province: String(raw.province ?? ''),
    city: String(raw.city ?? ''),
    socialHandler: String(raw.socialHandler ?? raw.social_handler ?? ''),
    businessOwner: String(raw.businessOwner ?? raw.business_owner ?? ''),
  };
}

export async function getOutOfProvinceAccounts(keyword?: string): Promise<OutOfProvinceAccount[]> {
  if (isMockMode) return mockDelay([]);
  const result = await request.get('/in-service-orders/out-of-province-accounts', {
    params: keyword?.trim() ? { keyword: keyword.trim() } : undefined,
  }) as any;
  const list = Array.isArray(result) ? result : (result?.items ?? result?.list ?? result?.data ?? []);
  return (Array.isArray(list) ? list : [])
    .map(normalizeAccount)
    .filter((item) => item.unitName && item.province && item.city);
}
