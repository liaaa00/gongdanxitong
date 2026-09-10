import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CustomerConfig from './index';
const auth=vi.hoisted(()=>({admin:false}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({hasRole:()=>auth.admin})}));
vi.mock('@ant-design/pro-components',()=>({PageContainer:({children}:{children:React.ReactNode})=><div>{children}</div>}));
vi.mock('@/pages/Admin/Customers',()=>({default:()=> <div>客户资料内容</div>}));
vi.mock('@/pages/CustomerRules',()=>({default:()=> <div>客户规则内容</div>}));
vi.mock('./CustomerPortalAccounts',()=>({default:()=> <div>账号内容</div>}));
vi.mock('./CustomerPortalBusiness',()=>({default:()=> <div>业务内容</div>}));
vi.mock('./PortalNotifications',()=>({default:()=> <div>通知配置内容</div>}));
vi.mock('./PortalMonitor',()=>({default:()=> <div>管理员监控内容</div>}));
afterEach(cleanup);
describe('Customer portal operations visibility',()=>{
  it('keeps monitoring and global notification settings restricted to administrators, including direct tab URLs',()=>{
    auth.admin=false;render(<MemoryRouter initialEntries={['/customer-config?tab=monitor']}><CustomerConfig/></MemoryRouter>);
    expect(screen.queryByRole('tab',{name:'门户全过程监控'})).not.toBeInTheDocument();
    expect(screen.queryByRole('tab',{name:'自动通知与工作日历'})).not.toBeInTheDocument();
    expect(screen.queryByText('管理员监控内容')).not.toBeInTheDocument();
    expect(screen.getByText('客户资料内容')).toBeVisible();
  });
  it('opens the administrator monitoring tab with the existing customer configuration entry',()=>{
    auth.admin=true;render(<MemoryRouter initialEntries={['/customer-config?tab=monitor']}><CustomerConfig/></MemoryRouter>);
    expect(screen.getByRole('tab',{name:'门户全过程监控'})).toHaveAttribute('aria-selected','true');
    expect(screen.getByText('管理员监控内容')).toBeVisible();
  });
});
