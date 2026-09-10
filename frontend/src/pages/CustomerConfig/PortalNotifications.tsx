import { useEffect, useState } from 'react';
import { Alert, App, Button, DatePicker, Form, Input, InputNumber, Select, Space, Switch, Table, Tabs } from 'antd';
import dayjs from 'dayjs';
import { getNotificationConfig,saveNotificationConfig,getNotificationCalendar,saveNotificationCalendar,resetNotificationCalendar,getNotificationQueue,retryNotification,previewNotification,previewSchedule,NOTIFICATION_KINDS,type CalendarDay,type NotificationConfig,type NotificationKind,type NotificationRow,type NotificationSettings,type SchedulePreview } from '@/services/portalOperations';
const names:Record<NotificationKind,string>={account_opened:'账号开通通知',salary_monthly:'月度薪资收集',salary_reminder:'账单前客户提醒',salary_escalation:'账单前业务员跟进',completion:'办结结果通知'};
export default function PortalNotifications(){
  const {message,modal}=App.useApp();const [form]=Form.useForm<NotificationSettings>();const [calendarForm]=Form.useForm();
  const [config,setConfig]=useState<NotificationConfig>();const [days,setDays]=useState<CalendarDay[]>([]);const [year,setYear]=useState(dayjs().year());
  const [queue,setQueue]=useState<NotificationRow[]>([]);const [total,setTotal]=useState(0);const [page,setPage]=useState(1);const [busy,setBusy]=useState(false);const [date,setDate]=useState(dayjs().format('YYYY-MM-DD'));const [billingDay,setBillingDay]=useState(20);const [mode,setMode]=useState<'current'|'previous'>('current');const [schedule,setSchedule]=useState<SchedulePreview>();
  const fail=(e:unknown)=>message.error(e instanceof Error?e.message:'操作失败');
  const loadConfig=async()=>{const next=await getNotificationConfig();setConfig(next);form.setFieldsValue(next.settings);};
  const loadCalendar=async()=>setDays((await getNotificationCalendar(year)).days);
  const loadQueue=async()=>{const next=await getNotificationQueue(page);setQueue(next.list);setTotal(next.total);};
  useEffect(()=>{void loadConfig().catch(fail);},[]);
  useEffect(()=>{void loadCalendar().catch(fail);},[year]);
  useEffect(()=>{void loadQueue().catch(fail);},[page]);
  async function save(){setBusy(true);try{await saveNotificationConfig(await form.validateFields());await loadConfig();message.success('通知配置已保存');}catch(e){fail(e);}finally{setBusy(false);}}
  async function saveDay(){try{const value=await calendarForm.validateFields();await saveNotificationCalendar([{date:value.date.format('YYYY-MM-DD'),isWorkday:value.isWorkday===true,label:value.label||''}]);await loadCalendar();message.success('日历已保存');}catch(e){fail(e);}}
  return <Space direction="vertical" size="middle" style={{width:'100%'}}>
    <Alert type={config?.transportEnabled&&config.transportConfigured?'success':'info'} showIcon message={config?.transportEnabled&&config.transportConfigured?'邮件服务已配置并启用':'邮件服务尚未启用，正式 SMTP 可稍后配置'} description="薪资催办固定为账单日前 3、2 个工作日提醒客户，前 1 个工作日提醒已配置业务员；已提交客户不再催办。法定节假日及调休请在工作日历维护。"/>
    <Tabs items={[
      {key:'settings',label:'通知与通用模板',children:<Form form={form} layout="vertical" preserve>
        <Space wrap><Form.Item name="enabled" label="自动通知" valuePropName="checked"><Switch/></Form.Item><Form.Item name="accountNoticeEnabled" label="账号开通通知" valuePropName="checked"><Switch/></Form.Item><Form.Item name="monthlyEnabled" label="每月 1 日收集通知" valuePropName="checked"><Switch/></Form.Item><Form.Item name="reminderEnabled" label="账单前催办" valuePropName="checked"><Switch/></Form.Item><Form.Item name="sendHour" label="发送小时（北京时间）" rules={[{required:true}]}><InputNumber min={0} max={23}/></Form.Item></Space>
        <Form.Item name="portalUrl" label="客户门户访问地址"><Input placeholder="正式门户地址，待上线时填写"/></Form.Item><Form.Item name="signature" label="统一落款"><Input maxLength={500}/></Form.Item>
        <Alert type="info" message={`可用变量：${config?.templateVariables.map(v=>`{{${v}}}`).join('、')||'加载中'}`} style={{marginBottom:16}}/>
        {NOTIFICATION_KINDS.map(kind=><div key={kind}><Form.Item label={`${names[kind]} · 主题`} name={['templates',kind,'subject']} rules={[{required:true}]}><Input maxLength={200}/></Form.Item><Form.Item label={`${names[kind]} · 正文`} name={['templates',kind,'body']} rules={[{required:true}]}><Input.TextArea rows={5} maxLength={10000}/></Form.Item><Button style={{marginBottom:16}} onClick={async()=>{try{const result=await previewNotification(kind);modal.info({title:'已保存模板预览',width:700,content:<div><strong>{result.subject}</strong><p style={{whiteSpace:'pre-wrap'}}>{result.body}</p></div>});}catch(e){fail(e);}}}>预览已保存模板</Button></div>)}
        <Button type="primary" onClick={()=>void save()} loading={busy}>保存通知配置</Button>
      </Form>},
      {key:'calendar',label:'工作日历与提醒日期',children:<Space direction="vertical" style={{width:'100%'}}>
        <Alert type="info" message="默认周一至周五为工作日；在下表明确配置节假日休息、周末调休上班。未维护的法定假期不会被自动猜测。"/>
        <Space>年份<InputNumber aria-label="日历年份" value={year} min={2000} max={2100} onChange={v=>v&&setYear(v)}/></Space>
        <Form form={calendarForm} layout="inline" initialValues={{isWorkday:false}}><Form.Item name="date" label="日期" rules={[{required:true}]}><DatePicker/></Form.Item><Form.Item name="isWorkday" label="是否上班" valuePropName="checked"><Switch/></Form.Item><Form.Item name="label" label="说明"><Input maxLength={100}/></Form.Item><Button onClick={()=>void saveDay()}>保存日期</Button></Form>
        <Table<CalendarDay> rowKey="date" dataSource={days} columns={[{title:'日期',dataIndex:'date'},{title:'类型',render:(_,row)=>row.isWorkday?'工作日':'休息日'},{title:'说明',dataIndex:'label'},{title:'操作',render:(_,row)=><Button onClick={async()=>{try{await resetNotificationCalendar(row.date);await loadCalendar();}catch(e){fail(e);}}}>恢复星期规则</Button>}]}/>
        <Space wrap><DatePicker aria-label="提醒计算月份" value={dayjs(date)} onChange={v=>v&&setDate(v.format('YYYY-MM-DD'))}/><span>账单日</span><InputNumber aria-label="预览账单日" value={billingDay} min={1} max={28} onChange={v=>v&&setBillingDay(v)}/><Select value={mode} onChange={setMode} options={[{value:'current',label:'当月发当月'},{value:'previous',label:'当月发上月'}]}/><Button onClick={async()=>{try{setSchedule(await previewSchedule(date,billingDay,mode));}catch(e){fail(e);}}}>计算提醒日期</Button></Space>
        {schedule&&<Alert type="success" message={`所属月份 ${schedule.salaryMonth}，账单日 ${schedule.billingDate}`} description={schedule.reminders.map(r=>`前 ${r.offset} 个工作日：${r.date}`).join('；')}/>}
      </Space>},
      {key:'queue',label:'自动通知记录',children:<><Button onClick={()=>void loadQueue().catch(fail)}>刷新发送记录</Button><Table<NotificationRow> rowKey="id" dataSource={queue} pagination={{current:page,pageSize:20,total,onChange:setPage}} columns={[{title:'主题',dataIndex:'subject'},{title:'收件人',render:(_,row)=>row.toRecipients.join('；')||'待配置'},{title:'状态',render:(_,row)=>({pending:'等待发送',sending:'发送中',sent:'已发送',failed:'发送失败',cancelled:'已取消'}[row.status]||row.status)},{title:'原因',dataIndex:'lastError'},{title:'操作',render:(_,row)=><Button disabled={row.status!=='failed'} onClick={async()=>{try{await retryNotification(row.id);await loadQueue();message.success('已重新排队，发送前将再次核验');}catch(e){fail(e);}}}>重试</Button>}]}/></>},
    ]}/>
  </Space>;
}
