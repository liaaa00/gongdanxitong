import { isMockMode, mockDelay } from './mock';

export async function downloadOutOfProvinceOrdersExport(
  ids: string[],
  typeLabel: '省外增员' | '省外减员',
): Promise<void> {
  if (isMockMode) {
    await mockDelay(undefined, 80);
    return;
  }
  const token = localStorage.getItem('token');
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '';
  const response = await fetch(base + '/api/in-service-orders/out-of-province-export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw new Error(typeLabel + '批量导出失败');
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = typeLabel + '-批量.xlsx';
  link.click();
  URL.revokeObjectURL(link.href);
}
