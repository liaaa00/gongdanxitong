import { useEffect, useState } from 'react';
import { Alert, App, Button, Descriptions, Drawer, Select, Space, Table, Tag, Timeline } from 'antd';
import {getMonitorSummary,getMonitorRequests,getMonitorDetail,type MonitorRow,type MonitorSummary,type MonitorDetail} from '@/services/portalOperations';
const labels:Record<string,string>={awaiting_receipt:'等待受理',processing:'办理中',completed:'已办结待回传',returned:'结果已回传',failed:'传输失败',timeout:'响应超时',missing_receipt:'受理记录缺失'};
const stages:Record<string,string>={gateway_received:'门户已发出',connector_received:'连接器已收到',backend_responded:'后台已响应',portal_responded:'门户已收到响应',failed:'失败',timeout:'超时'};
const time=(value:string|null|undefined)=>value?new Date(value).toLocaleString('zh-CN'):'暂无记录';
export default function PortalMonitor(){
  const {message}=App.useApp();const [summary,setSummary]=useState<MonitorSummary>();const [rows,setRows]=useState<MonitorRow[]>([]);const [total,setTotal]=useState(0);
  const [page,setPage]=useState(1);const [status,setStatus]=useState<string>();const [business,setBusiness]=useState<string>();const [loading,setLoading]=useState(false);const [detail,setDetail]=useState<MonitorDetail>();const [refresh,setRefresh]=useState(0);
  useEffect(()=>{let cancelled=false;const load=async()=>{setLoading(true);try{const [overview,result]=await Promise.all([getMonitorSummary(),getMonitorRequests(page,status,business)]);if(!cancelled){setSummary(overview);setRows(result.list);setTotal(result.total);}}catch(e){if(!cancelled)message.error(e instanceof Error?e.message:'监控读取失败');}finally{if(!cancelled)setLoading(false);}};void load();const timer=setInterval(()=>void load(),30000);return()=>{cancelled=true;clearInterval(timer);};},[page,status,business,refresh]);
  const alertCount=Object.entries(summary?.counts??{}).filter(([key])=>['failed','timeout','missing_receipt'].includes(key)).reduce((total,[,count])=>total+Number(count),0);
  return <Space direction="vertical" size="middle" style={{width:'100%'}}>
    <Alert showIcon type={summary?.connection.status==='connected'?'success':'warning'} message={summary?.connection.label||'正在读取连接状态'} description={`最近心跳：${time(summary?.connection.lastHeartbeatAt)}。每 30 秒刷新；未收到确认的环节保持缺失，不作成功处理。`}/>
    {alertCount>0&&<Alert showIcon type="error" message={`发现 ${alertCount} 条失败、超时或缺失记录，请按状态筛选核查`}/>}
    <Space wrap><Select aria-label="监控状态" allowClear placeholder="全部状态" value={status} style={{width:170}} options={Object.entries(labels).map(([value,label])=>({value,label}))} onChange={v=>{setPage(1);setStatus(v);}}/><Select aria-label="监控业务" allowClear placeholder="全部业务" value={business} style={{width:140}} options={[{value:'onboarding',label:'增员'},{value:'resignation',label:'减员'},{value:'salary',label:'薪资'}]} onChange={v=>{setPage(1);setBusiness(v);}}/><Button onClick={()=>setRefresh(v=>v+1)} loading={loading}>刷新监控</Button></Space>
    <Table<MonitorRow> rowKey="id" loading={loading} dataSource={rows} scroll={{x:1300}} pagination={{current:page,pageSize:20,total,onChange:setPage}} columns={[
      {title:'业务',render:(_,row)=>({onboarding:'增员',resignation:'减员',salary:'薪资'}[row.businessType||'']||'进度查询')},
      {title:'状态',render:(_,row)=><Tag color={['failed','timeout','missing_receipt'].includes(row.status)?'error':row.status==='completed'?'success':'processing'}>{labels[row.status]||row.status}</Tag>},
      {title:'门户发出',render:(_,row)=>time(row.gatewayReceivedAt)},{title:'后台受理',render:(_,row)=>time(row.acceptedAt)},{title:'业务办结',render:(_,row)=>time(row.completedAt)},{title:'结果回传门户',render:(_,row)=>time(row.resultReturnedAt)},
      {title:'受理/完成',render:(_,row)=>`${row.submissionCount}/${row.completedCount}`},{title:'失败原因',dataIndex:'failureCode'},
      {title:'操作',render:(_,row)=><Button onClick={async()=>{try{setDetail(await getMonitorDetail(row.id));}catch(e){message.error(e instanceof Error?e.message:'读取详情失败');}}}>查看全过程</Button>},
    ]}/>
    <Drawer title="门户全过程记录" width={850} open={Boolean(detail)} onClose={()=>setDetail(undefined)}>
      {detail&&<><Descriptions column={1} items={[{key:'id',label:'追踪编号',children:detail.id},{key:'received',label:'后台收到请求',children:time(detail.backendReceivedAt)},{key:'response',label:'门户收到响应',children:time(detail.portalRespondedAt)},{key:'result',label:'结果回传',children:time(detail.resultReturnedAt)}]}/><Timeline items={detail.events.map((event,index)=>({key:index,color:event.stage==='failed'?'red':'blue',children:`${stages[event.stage]||event.stage} · ${time(event.at)}${event.failureCode?' · '+event.failureCode:''}`}))}/><Table rowKey="id" dataSource={detail.submissions} columns={[{title:'受理编号',dataIndex:'requestNo'},{title:'业务',dataIndex:'businessType'},{title:'状态',dataIndex:'status'}]}/></>}
    </Drawer>
  </Space>;
}
