import request from './request';
export interface PortalSalaryRecord { id:string;requestNo:string;fields:{month?:string;mode?:string;note?:string;channel?:string};status:string;resultNote:string|null;createdAt:string }
export interface PortalEmailRecord {id:string;subject:string;status:string;toRecipients:string[];attemptCount:number;lastError:string|null;sentAt:string|null;createdAt:string}
export interface PortalSalaryWorkbenchRow {
  customerId:string; customerCode:string; customerName:string; expectedMonth:string;
  configured:boolean; status:'not_submitted'|'received'|'completed'; submissionId:string|null; requestNo:string|null;
  mode:string|null; channel:string|null; note:string|null; createdAt:string|null; completedAt:string|null; resultNote:string|null;
  attachmentEmailStatus:string|null; completionEmailStatus:string|null; attachmentCount:number;
  attachments:Array<{fileId:string;fileName:string;mimeType:string|null;size:number|null;downloadUrl:string}>;
}
export interface PortalSalaryWorkbench {
  month:string;
  summary:{total:number;submitted:number;notSubmitted:number;received:number;completed:number};
  list:PortalSalaryWorkbenchRow[];
}
const base=(customerId:string)=>`/customer-config/customers/${customerId}`;
export const getPortalSalary=(customerId:string)=>request.get(`${base(customerId)}/salary`) as Promise<PortalSalaryRecord[]>;
export const completePortalSalary=(customerId:string,id:string,resultNote:string)=>request.post(`${base(customerId)}/salary/${id}/complete`,{resultNote}) as Promise<PortalSalaryRecord>;
export const getPortalEmails=(customerId:string)=>request.get(`${base(customerId)}/emails`) as Promise<PortalEmailRecord[]>;
export const retryPortalEmail=(customerId:string,id:string)=>request.post(`${base(customerId)}/emails/${id}/retry`) as Promise<PortalEmailRecord>;

export const getPortalSalaryWorkbench=(month?:string)=>request.get('/customer-config/salary-workbench',{params:month?{month}:undefined}) as Promise<PortalSalaryWorkbench>;
export interface PortalSalaryReturnEmail { id:string; status:string; attemptCount:number; lastError:string|null; sentAt:string|null; toRecipients:string[] }
export interface PortalSalaryReturnAttachment {fileId:string;fileName:string;mimeType:string|null;size:number|null;downloadUrl:string}
export interface PortalSalaryReturnRow { id:string; customerId:string; customerName:string; customerCode:string; requestNo:string; month:string; status:'received'|'completed'; mode:string|null; channel:string|null; note:string|null; createdAt:string; completedAt:string|null; resultNote:string|null; attachments:PortalSalaryReturnAttachment[]; submissionAttachments:PortalSalaryReturnAttachment[]; completionAttachments:PortalSalaryReturnAttachment[]; attachmentEmail:PortalSalaryReturnEmail|null; completionEmail:PortalSalaryReturnEmail|null }
export interface PortalSalaryReturns { items:PortalSalaryReturnRow[]; total:number; page:number; pageSize:number }
export const getPortalSalaryReturns=(params: {month?:string;customerId?:string;status?:string;search?:string;page?:number;pageSize?:number}={})=>request.get('/customer-config/salary-returns',{params}) as Promise<PortalSalaryReturns>;
