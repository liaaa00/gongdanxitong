let activePortalSession = null; let portalSessionGeneration = 0;
const portalSchemas = {};
const pendingPortalRequests = new Map();

class PortalSessionChangedError extends Error {
  constructor() { super('portal session changed'); this.code = 'PORTAL_SESSION_CHANGED'; }
}

function isPortalSessionChanged(error) { return error?.code === 'PORTAL_SESSION_CHANGED'; }

function portalPermissionForBusiness(business) { return business === 'salary' ? 'salary' : 'employee_changes'; }
function portalHasBusinessPermission(business) {
  const permissions = activePortalSession?.businessPermissions || [];
  const required = portalPermissionForBusiness(business);
  return permissions.includes(required)
    || (required === 'employee_changes' && (permissions.includes('onboarding') || permissions.includes('resignation')));
}

function assertPortalSession(generation, accountId, token) {
  if (generation !== portalSessionGeneration || activePortalSession?.account?.id !== accountId || portalLinkToken() !== token) {
    throw new PortalSessionChangedError();
  }
}

function clearPortalClientState() {
  portalSchemas.onboarding = undefined;
  portalSchemas.resignation = undefined;
  pendingPortalRequests.clear();
  portalState.onboardingFiles = [];
  portalState.resignationFiles = [];
  portalState.onboardingAttachmentIds = [];
  portalState.importPreview = null;
  portalState.importMapping = {};
  portalState.importFileId = null;
  portalState.importRequestId = null;
  portalState.resignationImportFileId = null;
  portalState.standardTemplateDownloads = { onboarding: false, resignation: false };
  portalState.salaryAttachmentInvalid = false;
  portalState.salaryMode = null;
  portalState.salaryChannel = null;
  portalState.modalAction = null;
  portalState.progressFilter = 'all';
  portalState.submittingOnboarding = false;
  document.querySelectorAll('input[type="file"]').forEach((input) => { input.value = ''; });
  document.querySelectorAll('form').forEach((form) => form.reset());
  if (typeof initializeSalaryPeriod === 'function') initializeSalaryPeriod();
  ['onboarding-import-results', 'resignation-import-results'].forEach((id) => document.getElementById(id)?.remove());
  ['progress-rows', 'dashboard-recent'].forEach((id) => document.getElementById(id)?.replaceChildren());
  if (typeof renderOnboardingAttachments === 'function') renderOnboardingAttachments();
  if (typeof renderResignationAttachments === 'function') renderResignationAttachments();
}

async function portalCall(path, payload = {}, stableKey) {
  const callGeneration = portalSessionGeneration;
  const callAccountId = activePortalSession?.account?.id || '';
  const callToken = portalLinkToken();
  if (!callToken) throw new PortalSessionChangedError();
  const encoded = JSON.stringify(payload);
  let pending = stableKey && pendingPortalRequests.get(stableKey);
  if (!pending || pending.encoded !== encoded) pending = { encoded, requestId: requestId() };
  if (stableKey) pendingPortalRequests.set(stableKey, pending);
  assertPortalSession(callGeneration, callAccountId, callToken);
  const response = await fetch(gatewayUrl() + path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({requestId:pending.requestId,linkToken:callToken,...payload}) });
  const body = await response.json(); const result = body?.data?.result;
  assertPortalSession(callGeneration, callAccountId, callToken);
  if (!response.ok || !result?.ok) {
    if (result?.code === 'PORTAL_UNAUTHORIZED') {
      portalSessionGeneration += 1; sessionStorage.removeItem(PORTAL_SESSION_KEY); activePortalSession = null; clearPortalClientState();
      portalApp.classList.add('hidden'); authPage.classList.remove('hidden');
    }
    throw new Error(result?.message || body?.message || '请求失败，请稍后重试');
  }
  if (stableKey) pendingPortalRequests.delete(stableKey);
  return result;
}

function switchView(view) {
  if (['onboarding','resignation','salary'].includes(view) && !portalHasBusinessPermission(view)) { showToast('当前账号未获授权办理该业务'); return; }
  document.querySelectorAll('.page').forEach((page) => page.classList.toggle('active', page.id === view));
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active',button.dataset.view===view && button.classList.contains('nav-button')));
  document.querySelector('.main-content').scrollTo({top:0,behavior:'smooth'});
  if ((view==='dashboard'||view==='progress') && activePortalSession && !activePortalSession.mustChangePassword) refreshPortalProgress().catch((error)=>showToast(error.message));
}

async function applyPortalSession(session) {
  const generation=++portalSessionGeneration;
  activePortalSession=session;
  clearPortalClientState();
  sessionStorage.setItem(PORTAL_SESSION_KEY,JSON.stringify(session));
  document.getElementById('portal-customer-name').textContent=session.customer.customerName;
  document.getElementById('portal-customer-code').textContent='客户代码：'+(session.customer.customerCode||'-');
  document.querySelectorAll('.customer-chip').forEach((node)=>{if(node.textContent.includes('客户代码'))node.textContent='客户代码：'+(session.customer.customerCode||'-');});
  authPage.classList.add('hidden');
  document.getElementById('portal-password-panel').classList.toggle('hidden',!session.mustChangePassword);
  portalApp.classList.toggle('hidden',session.mustChangePassword);
  if(session.mustChangePassword)return;
  document.querySelectorAll('[data-view]').forEach((button)=>{
    const business=button.dataset.view;
    if(!['onboarding','resignation','salary'].includes(business))return;
    const allowed=portalHasBusinessPermission(business);
    (button.closest('.action-row')||button).classList.toggle('hidden',!allowed);
    button.disabled=!allowed;
  });
  switchView('dashboard');
  for(const business of ['onboarding','resignation']) {
    if(!portalHasBusinessPermission(business))continue;
    try {
      const result=await portalCall('/portal/schema',{businessType:business}); if(generation!==portalSessionGeneration||activePortalSession?.account?.id!==session.account?.id)return; portalSchemas[business]=result.fields;
      const aliases=business==='onboarding'?{contract_term_type:'contract_type',contract_term:'contract_duration',work_hour_system:'working_hours',salary_form:'salary_type',start_month:'social_start_month'}:{employee_name:'resignation_name',id_card_no:'resignation_id',mobile:'resignation_mobile',email:'resignation_email',resignation_date:'resignation_date',social_stop_month:'stop_month',resignation_reason:'resignation_reason'};
      for(const field of result.fields){
        const control=document.getElementById(aliases[field.code]||field.code);
        if(!control||control.tagName==='OUTPUT')continue;
        if(control.tagName==='SELECT'&&field.options.length&&field.code!=='contract_term_type'){
          const old=control.value;control.replaceChildren(new Option('请选择',''),...field.options.map((value)=>new Option(value,value)));
          if(field.options.includes(old))control.value=old;
        }
        if(field.code!=='contract_term')control.required=field.required;
      }
    }catch(error){if(!isPortalSessionChanged(error))showToast(error.message);}
  }
}

async function refreshPortalProgress(){
  const generation=portalSessionGeneration; const accountId=activePortalSession?.account?.id; const token=portalLinkToken();
  const result=await portalCall('/portal/progress');
  assertPortalSession(generation, accountId, token);
  const names={onboarding:'入职',resignation:'离职',salary:'薪资'};
  const labels={draft:'待内部审核',pending:'待办理',processing:'办理中',received:'已受理',completed:'已完结',returned:'已退回',withdrawn:'已撤回',void:'已作废'};
  const rows=result.list.map((row)=>{
    const done=row.status==='completed';
    const values=[row.requestNo,row.subject,names[row.businessType],String(row.createdAt).slice(0,10)];
    const mail=row.completionEmailStatus==='sent'?'结果邮件已发送':row.completionEmailStatus==='failed'?'结果邮件待重试':row.completionEmailStatus?'结果邮件待发送':'';
    return {html:values.map((value)=>'<td>'+escapeHtml(value||'-')+'</td>').join('')+'<td><span class="status '+(done?'done':'processing')+'">'+escapeHtml(labels[row.status]||'办理中')+'</span></td>',result:[row.result,mail].filter(Boolean).join('；'),done};
  });
  document.getElementById('progress-rows').innerHTML=rows.map((row)=>'<tr data-progress-status="'+(row.done?'done':'processing')+'">'+row.html+'<td>'+escapeHtml(row.result||'等待办理结果')+'</td></tr>').join('')||'<tr><td colspan="6">暂无办理记录</td></tr>';
  document.getElementById('dashboard-recent').innerHTML=rows.slice(0,5).map((row)=>'<tr>'+row.html+'</tr>').join('')||'<tr><td colspan="5">暂无办理记录</td></tr>';
  const stats=document.querySelectorAll('.stat-value');
  const counts=[result.summary.processing,result.summary.completed,result.list.filter((row)=>row.businessType==='salary').length,result.total];
  stats.forEach((node,index)=>{node.textContent=String(counts[index]??0);});
  const salaryStat=stats[2]?.closest('.stat');if(salaryStat)salaryStat.classList.toggle('hidden',!portalHasBusinessPermission('salary'));
  document.querySelectorAll('.stat-label')[1].textContent='已完结';document.querySelectorAll('.stat-label')[2].textContent='薪资受理记录';document.querySelectorAll('.stat-label')[3].textContent='受理记录';
  document.querySelectorAll('.stat-hint')[2].textContent='当前月份：'+result.month;document.querySelectorAll('.stat-hint')[3].textContent='当前账号有权查看的客户业务';
}

async function downloadStandardTemplate(businessType){
  const generation=portalSessionGeneration; const accountId=activePortalSession?.account?.id; const token=portalLinkToken();
  try{
    const result=await portalCall('/portal/template',{businessType});
    assertPortalSession(generation, accountId, token);
    const bytes=Uint8Array.from(atob(result.contentBase64),(value)=>value.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes],{type:result.mimeType}));const anchor=document.createElement('a');
    anchor.href=url;anchor.download=result.fileName;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    portalState.standardTemplateDownloads[businessType]=true;showToast('标准模板已下载，请保留表头并填写资料');
  }catch(error){if(!isPortalSessionChanged(error))showToast(error.message);}
}

async function filesForPortal(items){return Promise.all(items.map(async(item)=>({name:item.file.name,mimeType:item.file.type||'application/octet-stream',bizPurpose:item.bizPurpose||'other',contentBase64:await fileAsBase64(item.file)})));}

async function submitOnboarding(){
  if(portalState.submittingOnboarding)return;
  const button=document.getElementById('onboarding-next');portalState.submittingOnboarding=true;button.disabled=true;
  const generation=portalSessionGeneration; const accountId=activePortalSession?.account?.id; const token=portalLinkToken();
  try{
    const fields=onboardingPayload();delete fields.bank_location;
    const files=await filesForPortal(portalState.onboardingFiles); assertPortalSession(generation, accountId, token);
    const result=await portalCall('/portal/onboarding',{fields,files},'onboarding');
    assertPortalSession(generation, accountId, token);
    onboardingFeedback('资料已受理，编号：'+result.workOrderNo+'；可在办理进度查看结果。',false);
    await refreshPortalProgress();showToast('入职资料已受理');
  }catch(error){if(!isPortalSessionChanged(error))onboardingFeedback(error.message,true);}finally{portalState.submittingOnboarding=false;button.disabled=false;}
}

async function submitResignation(){
  const form=document.getElementById('resignation-form');if(!form.reportValidity())return;
  const button=form.querySelector('[type="submit"]');button.disabled=true;
  const box=document.getElementById('resignation-feedback');
  const generation=portalSessionGeneration; const accountId=activePortalSession?.account?.id; const token=portalLinkToken();
  try{
    const fields=Object.fromEntries(new FormData(form).entries());
    if(/^\d{4}-(0[1-9]|1[0-2])$/.test(String(fields.social_stop_month||''))) fields.social_stop_month=Number(String(fields.social_stop_month).slice(5))+'月';
    const files=await filesForPortal(portalState.resignationFiles); assertPortalSession(generation, accountId, token);
    const result=await portalCall('/portal/resignation',{fields,files},'resignation');
    assertPortalSession(generation, accountId, token);
    box.textContent='资料已受理，编号：'+result.workOrderNo;box.className='form-feedback visible';await refreshPortalProgress();
  }catch(error){if(!isPortalSessionChanged(error)){box.textContent=error.message;box.className='form-feedback visible error';}}finally{button.disabled=false;}
}

async function submitSalary(){
  const button=portalState.salaryMode==='same'?document.getElementById('salary-same-submit'):document.getElementById('salary-submit');button.disabled=true;
  const generation=portalSessionGeneration; const accountId=activePortalSession?.account?.id; const token=portalLinkToken();
  try{
    const items=portalState.salaryMode==='changed'&&portalState.salaryChannel==='attachment'?Array.from(document.getElementById('salary-attachments').files||[]).map((file)=>({file,bizPurpose:'salary_attachment'})):[];
    const files=await filesForPortal(items); assertPortalSession(generation, accountId, token);
    const result=await portalCall('/portal/salary',{fields:salaryPayload(),files},'salary'); assertPortalSession(generation, accountId, token); showToast('薪资已受理：'+result.requestNo);switchView('progress');
  }catch(error){if(!isPortalSessionChanged(error))showToast(error.message);}finally{button.disabled=false;}
}

async function runPortalImport(business,confirm){
  const onboarding=business==='onboarding';
  const file=document.getElementById(onboarding?'onboarding-excel':'resignation-excel').files[0];
  const statusId=onboarding?'import-status':'resignation-import-status';
  const button=document.getElementById(onboarding?(confirm?'confirm-import':'preview-import'):(confirm?'confirm-resignation-import':'preview-resignation-import'));
  if(!file||!file.name.endsWith('.xlsx')||file.size>10*1024*1024){setToolStatus(statusId,'请选择系统标准 .xlsx 文件（不超过10MB）',true);return;}
  button.disabled=true;
  const generation=portalSessionGeneration; const accountId=activePortalSession?.account?.id; const token=portalLinkToken();
  try{
    const contentBase64=await fileAsBase64(file); assertPortalSession(generation, accountId, token);
    const result=await portalCall('/portal/'+business+'/import/'+(confirm?'confirm':'preview'),{fileName:file.name,contentBase64},confirm?'import-'+business:undefined); assertPortalSession(generation, accountId, token);
    let details=document.getElementById(business+'-import-results');
    if(!details){details=document.createElement('div');details.id=business+'-import-results';details.className='table-wrap import-results';document.getElementById(statusId).after(details);}
    details.innerHTML='<table><thead><tr><th>Excel行号</th><th>结果</th><th>说明</th><th>办理编号</th></tr></thead><tbody>'+result.details.map((row)=>'<tr><td>'+row.rowNumber+'</td><td>'+(row.success?'成功':'失败')+'</td><td>'+escapeHtml(row.message)+'</td><td>'+escapeHtml(row.workOrderNo||'-')+'</td></tr>').join('')+'</tbody></table>';
    setToolStatus(statusId,(confirm?'导入结果':'校验结果')+'：成功 '+result.successCount+' 条，失败 '+result.failureCount+' 条',Boolean(result.failureCount));
    document.getElementById(onboarding?'confirm-import':'confirm-resignation-import').classList.toggle('hidden',confirm||result.successCount===0);
    if(confirm)await refreshPortalProgress();
  }catch(error){if(!isPortalSessionChanged(error))setToolStatus(statusId,error.message,true);}finally{button.disabled=false;}
}

document.getElementById('preview-import').addEventListener('click',()=>runPortalImport('onboarding',false));
document.getElementById('confirm-import').addEventListener('click',()=>runPortalImport('onboarding',true));
document.getElementById('preview-resignation-import').addEventListener('click',()=>runPortalImport('resignation',false));
document.getElementById('confirm-resignation-import').addEventListener('click',()=>runPortalImport('resignation',true));
document.getElementById('portal-password-form').addEventListener('submit',async(event)=>{
  event.preventDefault();const form=event.target;const button=form.querySelector('button[type="submit"]');
  if(form.elements.newPassword.value!==form.elements.confirmPassword.value){document.getElementById('portal-password-error').textContent='两次新密码不一致';return;}
  button.disabled=true;
  try{const session=await portalCall('/portal/auth/change-password',{oldPassword:form.elements.oldPassword.value,newPassword:form.elements.newPassword.value});await applyPortalSession(session);showToast('密码已修改');}
  catch(error){if(!isPortalSessionChanged(error))document.getElementById('portal-password-error').textContent=error.message;}finally{button.disabled=false;}
});
document.getElementById('portal-change-password').addEventListener('click',()=>{portalApp.classList.add('hidden');document.getElementById('portal-password-panel').classList.remove('hidden');});
document.getElementById('portal-password-back').addEventListener('click',()=>{if(activePortalSession?.mustChangePassword){showToast('首次登录请先修改密码');return;}document.getElementById('portal-password-panel').classList.add('hidden');portalApp.classList.remove('hidden');});
document.getElementById('logout').addEventListener('click',()=>{portalSessionGeneration++;activePortalSession=null;sessionStorage.removeItem(PORTAL_SESSION_KEY);clearPortalClientState();document.getElementById('portal-password-panel').classList.add('hidden');});

(async()=>{
  const saved = savedPortalSession(); if(!saved)return;
  // Bind the restore request to the session being restored before it reaches the gateway.
  activePortalSession = saved;
  try{await applyPortalSession(await portalCall('/portal/auth/session'));}
  catch(error){sessionStorage.removeItem(PORTAL_SESSION_KEY);portalApp.classList.add('hidden');authPage.classList.remove('hidden');loginNote.textContent=error.message;}
})();
