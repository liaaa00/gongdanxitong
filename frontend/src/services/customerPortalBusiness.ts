import request from './request';
export interface PortalSalaryRecord { id:string;requestNo:string;fields:{month?:string;mode?:string;note?:string;channel?:string};status:string;resultNote:string|null;createdAt:string }
export interface PortalEmailRecord {id:string;subject:string;status:string;toRecipients:string[];attemptCount:number;lastError:string|null;sentAt:string|null;createdAt:string}
const base=(customerId:string)=>`/customer-config/customers/${customerId}`;
export const getPortalSalary=(customerId:string)=>request.get(`${base(customerId)}/salary`) as Promise<PortalSalaryRecord[]>;
export const completePortalSalary=(customerId:string,id:string,resultNote:string)=>request.post(`${base(customerId)}/salary/${id}/complete`,{resultNote}) as Promise<PortalSalaryRecord>;
export const getPortalEmails=(customerId:string)=>request.get(`${base(customerId)}/emails`) as Promise<PortalEmailRecord[]>;
export const retryPortalEmail=(customerId:string,id:string)=>request.post(`${base(customerId)}/emails/${id}/retry`) as Promise<PortalEmailRecord>;
