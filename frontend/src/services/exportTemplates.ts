import request from './request';
import { isMockMode, mockDelay } from './mock';

export interface ExportTemplateFieldItem {
  field_code?: string;
  fieldCode?: string;
  code?: string;
  alias?: string;
  title?: string;
  order?: number;
  const?: unknown;
  sameAs?: string;
  formula?: string;
  numFmt?: string;
  header?: string | string[];
  options?: string[];
  dropdownOptions?: string[];
  [key: string]: unknown;
}

export interface ExportTemplateItem {
  id: string;
  template_name: string;
  module_code: string;
  field_list: ExportTemplateFieldItem[];
  created_by: string;
  is_shared: boolean;
  sign_platform?: string | null;
  created_at: string;
}

const mockTemplates: ExportTemplateItem[] = [
  {
    id: '1',
    template_name: '入职工单导出模板',
    module_code: 'contract',
    field_list: [
      { field_code: 'employee_name', alias: '姓名', order: 1 },
      { field_code: 'id_card_no', alias: '证件号码', order: 2 },
      { field_code: 'created_by_name', alias: '发起人', order: 3 },
    ],
    created_by: 'admin',
    is_shared: true,
    created_at: new Date().toISOString(),
  },
];

export async function getExportTemplates(moduleCode?: string): Promise<ExportTemplateItem[]> {
  if (isMockMode) {
    const filtered = moduleCode ? mockTemplates.filter((t) => t.module_code === moduleCode) : mockTemplates;
    return mockDelay(filtered);
  }
  try {
    const result = await request.get('/admin/export-templates', { params: { moduleCode, module_code: moduleCode } }) as any;
    const rawList = Array.isArray(result) ? result : (result?.list || result?.items || result?.data || []);
    return (Array.isArray(rawList) ? rawList : []).map((t: any) => ({
      id: String(t.id ?? ''),
      template_name: t.template_name ?? t.templateName ?? '',
      module_code: t.module_code ?? t.moduleCode ?? '',
      field_list: t.field_list ?? t.fieldList ?? [],
      created_by: t.created_by ?? t.createdBy ?? '',
      is_shared: t.is_shared ?? t.isShared ?? false,
      sign_platform: t.sign_platform ?? t.signPlatform ?? null,
      created_at: t.created_at ?? t.createdAt ?? '',
    } as ExportTemplateItem));
  } catch {
    return [];
  }
}

function packExportTemplate(data: Partial<ExportTemplateItem>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.template_name !== undefined) body.templateName = data.template_name;
  if (data.module_code !== undefined) body.moduleCode = data.module_code;
  if (data.field_list !== undefined) body.fieldList = data.field_list;
  if (data.is_shared !== undefined) body.isShared = data.is_shared;
  if (data.sign_platform !== undefined) body.signPlatform = data.sign_platform;
  return body;
}

export async function createExportTemplate(data: Partial<ExportTemplateItem>): Promise<ExportTemplateItem> {
  if (isMockMode) return mockDelay({ ...mockTemplates[0], ...data });
  return request.post('/admin/export-templates', packExportTemplate(data)) as Promise<ExportTemplateItem>;
}

export async function updateExportTemplate(id: string, data: Partial<ExportTemplateItem>): Promise<ExportTemplateItem> {
  if (isMockMode) return mockDelay({ ...mockTemplates[0], ...data });
  return request.put(`/admin/export-templates/${id}`, packExportTemplate(data)) as Promise<ExportTemplateItem>;
}

export async function deleteExportTemplate(id: string): Promise<void> {
  if (isMockMode) return mockDelay(undefined);
  return request.delete(`/admin/export-templates/${id}`) as Promise<void>;
}
