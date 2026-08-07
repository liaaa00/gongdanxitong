import * as JSZip from 'jszip';

export interface ResignationCertificateSource {
  employeeName: string;
  idCardNo: string;
  extraData: Record<string, unknown>;
  historyData?: Record<string, unknown>;
}

export function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

export function deriveGender(idCardNo: string): string {
  const digit = idCardNo.length === 18
    ? idCardNo[16]
    : idCardNo.length === 15
      ? idCardNo[14]
      : '';
  if (!digit || !/\d/.test(digit)) return '';
  return Number(digit) % 2 === 1 ? '男' : '女';
}

export function resolveResignationReasonCode(data: Record<string, unknown>): string {
  const explicit = firstText(
    data.resignation_reason_code,
    data.resignationReasonCode,
  );
  if (/^[1-4]$/.test(explicit)) return explicit;

  const source = firstText(
    data.resignation_type,
    data.resignationType,
    data.resignation_reason,
    data.resignationReason,
  );
  if (/合同期满|期满终止|合同到期/.test(source)) return '1';
  if (/辞职|个人原因|员工提出|劳动者提出|主动离职/.test(source)) return '2';
  if (/协商一致|双方协商/.test(source)) return '3';
  return '4';
}

export function buildContractTermText(data: Record<string, unknown>): string {
  const termType = firstText(
    data.renewal_term_type,
    data.contract_term_type,
    data.contractTermType,
  );
  const startDate = firstText(
    data.renewal_start_date,
    data.contract_start_date,
    data.contractStartDate,
    data.hire_date,
  );
  const endDate = firstText(
    data.renewal_end_date,
    data.contract_end_date,
    data.contractEndDate,
  );

  if (termType === '无固定期限') {
    return startDate
      ? `劳动合同期限自${startDate}起为无固定期限`
      : '劳动合同期限为无固定期限';
  }
  if (startDate && endDate) return `劳动合同期限自${startDate}至${endDate}`;
  if (startDate) return `劳动合同期限自${startDate}起`;
  return '劳动合同期限';
}

export function buildResignationCertificateReplacements(
  source: ResignationCertificateSource,
): Record<string, string> {
  const data = { ...(source.historyData ?? {}), ...source.extraData };
  const idCardNo = firstText(source.idCardNo, data.id_card_no, data.idCardNo);
  const reasonCode = resolveResignationReasonCode(data);
  const reason = firstText(
    data.resignation_other_reason,
    data.resignationOtherReason,
    data.resignation_reason,
    data.resignationReason,
  );
  const legalArticle = firstText(
    data.resignation_legal_article,
    data.legal_article,
    data.legalArticle,
  ).replace(/^第|条$/g, '');

  return {
    employeeName: firstText(source.employeeName, data.employee_name),
    gender: firstText(data.gender) || deriveGender(idCardNo),
    idCardNo,
    jobTitle: firstText(
      data.renewal_position,
      data.position,
      data.job_title,
      data.jobTitle,
    ),
    contractTermText: buildContractTermText(data),
    resignationReasonCode: reasonCode,
    resignationDate: firstText(
      data.resignation_date,
      data.resignationDate,
      data.contract_terminate_date,
      data.last_work_date,
    ),
    otherReason: reasonCode === '4' ? reason : '',
    legalArticleText: legalArticle ? `第${legalArticle}条` : '相关规定',
  };
}

export async function renderResignationCertificate(
  template: Buffer,
  replacements: Record<string, string>,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(template);
  const document = zip.file('word/document.xml');
  if (!document) throw new Error('离职证明模板结构无效');

  let xml = await document.async('string');
  for (const [key, rawValue] of Object.entries(replacements)) {
    const value = escapeXml(rawValue);
    xml = xml.split(`{{${key}}}`).join(value);
  }
  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
