import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Form, Input, Modal, Select, Space, Table, Tag } from 'antd';
import { getAllCustomerRules, type CustomerRuleItem } from '@/services/customerRules';
import { completePortalSalary,getPortalEmails,getPortalSalary,retryPortalEmail,type PortalEmailRecord,type PortalSalaryRecord } from '@/services/customerPortalBusiness';

export default function CustomerPortalBusiness(){
  const {message}=App.useApp();const [params,setParams]=useSearchParams();
  const [customers,setCustomers]=useState<CustomerRuleItem[]>([]);const customerId=params.get('customerId')||customers[0]?.customerId||'';
  const [salary,setSalary]=useState<PortalSalaryRecord[]>([]);const [emails,setEmails]=useState<PortalEmailRecord[]>([]);
  const [loading,setLoading]=useState(false);const [editing,setEditing]=useState<PortalSalaryRecord|null>(null);const [saving,setSaving]=useState(false);const [form]=Form.useForm<{resultNote:string}>();const requestVersion=useRef(0);
  const load=async()=>{const version=++requestVersion.current;if(!customerId)return;setLoading(true);try{const [nextSalary,nextEmails]=await Promise.all([getPortalSalary(customerId),getPortalEmails(customerId)]);if(version===requestVersion.current){setSalary(nextSalary);setEmails(nextEmails);}}catch(error){message.error(error instanceof Error?error.message:'加载失败');}finally{if(version===requestVersion.current)setLoading(false);}};
  useEffect(()=>{void getAllCustomerRules().then(setCustomers).catch(()=>message.error('客户列表加载失败'));},[]);
  useEffect(()=>{setSalary([]);setEmails([]);setEditing(null);void load();return()=>{requestVersion.current++;};},[customerId]);
  const complete=async()=>{const values=await form.validateFields();if(!editing)return;setSaving(true);try{await completePortalSalary(customerId,editing.id,values.resultNote);setEditing(null);message.success('薪资已办结，结果邮件按客户配置进入发送队列');await load();}catch(error){message.error(error instanceof Error?error.message:'办结失败');}finally{setSaving(false);}};
  return <Space direction="vertical" size="middle" style={{width:'100%'}}>
    <Space><Select aria-label="选择办理客户" showSearch optionFilterProp="label" style={{minWidth:420}} value={customerId||undefined} options={customers.map((item)=>({value:item.customerId,label:`${item.customerName}（${item.customerCode}） · ${item.customerId}`}))} onChange={(id)=>{const next=new URLSearchParams(params);next.set('tab','business');next.set('customerId',id);setParams(next);}}/><Button onClick={()=>void load()} loading={loading}>刷新记录</Button></Space>
    <Alert type="info" showIcon message="薪资由内部人员核对后办结；附件统一进入共享邮箱发送队列" description="邮箱配置可暂留空，待完成客户共享邮箱与系统邮件服务配置后，在发送记录中重试。"/>
    <Table<PortalSalaryRecord> rowKey="id" loading={loading} dataSource={salary} pagination={{pageSize:20}} title={()=>'薪资受理与办理'} columns={[
      {title:'受理编号',dataIndex:'requestNo'},{title:'所属月份',render:(_,row)=>row.fields.month||'-'},
      {title:'客户确认',render:(_,row)=>row.fields.mode==='same'?'与上月无变化':row.fields.channel==='attachment'?'上传变化附件':'有变化'},
      {title:'变化说明',render:(_,row)=>row.fields.note||'-'},{title:'状态',render:(_,row)=><Tag color={row.status==='completed'?'success':'processing'}>{row.status==='completed'?'已办结':'待办理'}</Tag>},
      {title:'办理结果',dataIndex:'resultNote'},{title:'操作',render:(_,row)=><Button disabled={row.status==='completed'} onClick={()=>{setEditing(row);form.resetFields();}}>填写结果并办结</Button>},
    ]}/>
    <Table<PortalEmailRecord> rowKey="id" loading={loading} dataSource={emails} pagination={{pageSize:20}} title={()=>'共享邮箱与办结邮件发送记录'} columns={[
      {title:'邮件主题',dataIndex:'subject'},{title:'收件人',render:(_,row)=>row.toRecipients.join('；')||'待配置'},
      {title:'发送状态',render:(_,row)=>({pending:'等待发送',sending:'发送中',sent:'已发送',failed:'发送失败'}[row.status]||row.status)},
      {title:'尝试次数',dataIndex:'attemptCount'},{title:'失败原因',dataIndex:'lastError'},
      {title:'操作',render:(_,row)=><Button disabled={!['failed','pending'].includes(row.status)} onClick={async()=>{try{await retryPortalEmail(customerId,row.id);message.success('已重新加入发送队列');await load();}catch(error){message.error(error instanceof Error?error.message:'重试失败');}}}>重试发送</Button>},
    ]}/>
    <Modal title="薪资办理结果" open={Boolean(editing)} onCancel={()=>setEditing(null)} onOk={()=>void complete()} confirmLoading={saving} destroyOnClose><Form form={form} layout="vertical"><Form.Item name="resultNote" label="办理结果" rules={[{required:true,whitespace:true,message:'请填写办理结果'},{max:2000}]}><Input.TextArea rows={5} maxLength={2000} showCount/></Form.Item></Form></Modal>
  </Space>;
}
