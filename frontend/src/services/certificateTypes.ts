import request from './request';

export interface CertificateType {
  id: string;
  name: string;
  description?: string;
  templateUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCertificateTypeDto {
  name: string;
  description?: string;
  templateUrl?: string;
  isActive?: boolean;
}

export interface UpdateCertificateTypeDto {
  name?: string;
  description?: string;
  templateUrl?: string;
  isActive?: boolean;
}

export async function getCertificateTypes(): Promise<CertificateType[]> {
  const response = await request.get<CertificateType[]>('/admin/certificate-types');
  return response.data;
}

export async function getCertificateType(id: string): Promise<CertificateType> {
  const response = await request.get<CertificateType>(`/admin/certificate-types/${id}`);
  return response.data;
}

export async function createCertificateType(data: CreateCertificateTypeDto): Promise<CertificateType> {
  const response = await request.post<CertificateType>('/admin/certificate-types', data);
  return response.data;
}

export async function updateCertificateType(id: string, data: UpdateCertificateTypeDto): Promise<CertificateType> {
  const response = await request.put<CertificateType>(`/admin/certificate-types/${id}`, data);
  return response.data;
}

export async function deleteCertificateType(id: string): Promise<void> {
  await request.delete(`/admin/certificate-types/${id}`);
}
