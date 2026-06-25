import request from './request';

export interface DetailViewTemplateItem {
  id: string;
  templateName: string;
  template_name?: string;
  moduleCode: string;
  module_code?: string;
  fieldList: Array<{ fieldCode: string; kind?: string; value?: string }>;
  field_list?: Array<{ fieldCode: string; kind?: string; value?: string }>;
  isActive: boolean;
  is_active?: boolean;
  createdBy?: string;
  created_by?: string;
  createdAt: string;
  created_at?: string;
  updatedAt: string;
  updated_at?: string;
}

export async function getDetailViewTemplates(params?: { moduleCode?: string }) {
  return request.get<DetailViewTemplateItem[]>('/admin/detail-view-templates', { params });
}

export async function getDetailViewTemplate(id: string) {
  return request.get<DetailViewTemplateItem>(`/admin/detail-view-templates/${id}`);
}

export async function getActiveDetailViewTemplate(moduleCode: string) {
  try {
    return await request.get<DetailViewTemplateItem | null>(
      `/admin/detail-view-templates/active/${encodeURIComponent(moduleCode)}`,
      { silentError: true } as any,
    );
  } catch {
    // 兼容旧后端未注册 active/:moduleCode 路由的场景：退回列表接口取最新启用配置。
    const list = await request.get<DetailViewTemplateItem[]>(
      '/admin/detail-view-templates',
      { params: { moduleCode }, silentError: true } as any,
    );
    const items = Array.isArray(list) ? list : (list as any)?.list ?? (list as any)?.items ?? [];
    return items.find((item: DetailViewTemplateItem) => (item.is_active ?? item.isActive) !== false) ?? null;
  }
}

export async function createDetailViewTemplate(data: {
  templateName: string;
  moduleCode: string;
  fieldList: Array<{ fieldCode: string; kind?: string; value?: string }>;
  isActive?: boolean;
}) {
  return request.post<DetailViewTemplateItem>('/admin/detail-view-templates', data);
}

export async function updateDetailViewTemplate(
  id: string,
  data: Partial<{
    templateName: string;
    moduleCode: string;
    fieldList: Array<{ fieldCode: string; kind?: string; value?: string }>;
    isActive: boolean;
  }>,
) {
  return request.put<DetailViewTemplateItem>(`/admin/detail-view-templates/${id}`, data);
}

export async function deleteDetailViewTemplate(id: string) {
  return request.delete(`/admin/detail-view-templates/${id}`);
}
