import { http } from 'msw';
import { ok } from '../utils';

const now = new Date().toISOString();

// ---- Rich Mock Data (5-10 items each) ----

const USERS = [
  { id: 'u-1', username: 'lizhanbo', real_name: '李占博', email: 'lizhanbo@example.com', phone: '13800001001', is_active: true, created_at: now, group_name: '系统管理', roles: [{ role_id: 'role-admin', role_name: '系统管理员' }] },
  { id: 'u-2', username: 'wangzixi', real_name: '王梓曦', email: 'wangzixi@example.com', phone: '13800001002', is_active: true, created_at: now, group_name: '系统管理', roles: [{ role_id: 'role-admin', role_name: '系统管理员' }] },
  { id: 'u-3', username: 'aolei', real_name: '敖蕾', email: 'aolei@example.com', phone: '13800001003', is_active: true, created_at: now, group_name: '业务团队', roles: [{ role_id: 'role-biz-leader', role_name: '业务负责人' }] },
  { id: 'u-4', username: 'xuekun', real_name: '薛锟', email: 'xuekun@example.com', phone: '13800001004', is_active: true, created_at: now, group_name: '业务团队', roles: [{ role_id: 'role-biz-leader', role_name: '业务负责人' }] },
  { id: 'u-5', username: 'yuqinxia', real_name: '余琴霞', email: 'yuqinxia@example.com', phone: '13800001005', is_active: true, created_at: now, group_name: '业务团队', roles: [{ role_id: 'role-biz-leader', role_name: '业务负责人' }] },
  { id: 'u-6', username: 'shenwenjun', real_name: '沈文君', email: 'shenwenjun@example.com', phone: '13800001006', is_active: true, created_at: now, group_name: '业务1组', roles: [{ role_id: 'role-biz-leader', role_name: '业务组长' }] },
  { id: 'u-7', username: 'yaoyiping', real_name: '姚怡萍', email: 'yaoyiping@example.com', phone: '13800001007', is_active: true, created_at: now, group_name: '业务1组', roles: [{ role_id: 'role-biz-member', role_name: '业务员' }] },
  { id: 'u-8', username: 'yanqiuyue', real_name: '闫秋月', email: 'yanqiuyue@example.com', phone: '13800001008', is_active: true, created_at: now, group_name: '业务1组', roles: [{ role_id: 'role-biz-member', role_name: '业务员' }] },
  { id: 'u-9', username: 'chengyu', real_name: '程裕', email: 'chengyu@example.com', phone: '13800001009', is_active: true, created_at: now, group_name: '业务1组', roles: [{ role_id: 'role-biz-member', role_name: '业务员' }] },
  { id: 'u-10', username: 'chenyuchen', real_name: '陈宇辰', email: 'chenyuchen@example.com', phone: '13800001010', is_active: true, created_at: now, group_name: '业务2组', roles: [{ role_id: 'role-biz-leader', role_name: '业务组长' }] },
  { id: 'u-11', username: 'zhouqiqing', real_name: '周琦青', email: 'zhouqiqing@example.com', phone: '13800001011', is_active: true, created_at: now, group_name: '业务2组', roles: [{ role_id: 'role-biz-member', role_name: '业务员' }] },
  { id: 'u-12', username: 'wuyufei', real_name: '吴宇飞', email: 'wuyufei@example.com', phone: '13800001012', is_active: true, created_at: now, group_name: '业务2组', roles: [{ role_id: 'role-biz-member', role_name: '业务员' }] },
  { id: 'u-13', username: 'gaolulu', real_name: '高璐璐', email: 'gaolulu@example.com', phone: '13800001013', is_active: true, created_at: now, group_name: '业务3组', roles: [{ role_id: 'role-biz-leader', role_name: '业务组长' }] },
  { id: 'u-14', username: 'zhaotianqi', real_name: '赵天琪', email: 'zhaotianqi@example.com', phone: '13800001014', is_active: true, created_at: now, group_name: '业务3组', roles: [{ role_id: 'role-biz-member', role_name: '业务员' }] },
  { id: 'u-15', username: 'liucheng', real_name: '刘程', email: 'liucheng@example.com', phone: '13800001015', is_active: true, created_at: now, group_name: '业务4组', roles: [{ role_id: 'role-biz-leader', role_name: '业务组长' }] },
  { id: 'u-16', username: 'xujing', real_name: '许靖', email: 'xujing@example.com', phone: '13800001016', is_active: true, created_at: now, group_name: '业务4组', roles: [{ role_id: 'role-biz-member', role_name: '业务员' }] },
  { id: 'u-17', username: 'taomingyue', real_name: '陶明月', email: 'taomingyue@example.com', phone: '13800001017', is_active: true, created_at: now, group_name: '业务4组', roles: [{ role_id: 'role-biz-member', role_name: '业务员' }] },
  { id: 'u-18', username: 'xujiayin', real_name: '徐嘉胤', email: 'xujiayin@example.com', phone: '13800001018', is_active: true, created_at: now, group_name: '业务4组', roles: [{ role_id: 'role-biz-member', role_name: '业务员' }] },
  { id: 'u-19', username: 'yuweiwei', real_name: '余维维', email: 'yuweiwei@example.com', phone: '13800001019', is_active: true, created_at: now, group_name: '业务5组', roles: [{ role_id: 'role-biz-leader', role_name: '业务组长' }] },
  { id: 'u-20', username: 'zhangpuwei', real_name: '张埔微', email: 'zhangpuwei@example.com', phone: '13800001020', is_active: true, created_at: now, group_name: '业务5组', roles: [{ role_id: 'role-biz-member', role_name: '业务员' }] },
  { id: 'u-21', username: 'annazhen', real_name: '安娜祯', email: 'annazhen@example.com', phone: '13800001021', is_active: true, created_at: now, group_name: '业务团队', roles: [{ role_id: 'role-data-leader', role_name: '数据录入组长' }] },
  { id: 'u-22', username: 'jianglu', real_name: '江璐', email: 'jianglu@example.com', phone: '13800001022', is_active: true, created_at: now, group_name: '共享团队', roles: [{ role_id: 'role-contract', role_name: '合同专员' }, { role_id: 'role-hr-contact', role_name: '入离职联系专员' }] },
  { id: 'u-23', username: 'yangchun', real_name: '杨纯', email: 'yangchun@example.com', phone: '13800001023', is_active: true, created_at: now, group_name: '共享团队', roles: [{ role_id: 'role-contract', role_name: '合同专员' }] },
  { id: 'u-24', username: 'maoyani', real_name: '毛雅妮', email: 'maoyani@example.com', phone: '13800001024', is_active: true, created_at: now, group_name: '共享团队', roles: [{ role_id: 'role-hr-contact', role_name: '入离职联系专员' }] },
  { id: 'u-25', username: 'fuqianwen', real_name: '傅倩雯', email: 'fuqianwen@example.com', phone: '13800001025', is_active: true, created_at: now, group_name: '福利保障部', roles: [{ role_id: 'role-social-insurance', role_name: '福保负责人' }] },
];

const ROLES = [
  // ★ 8 核心角色体系，业务组通过 department 区分
  { id: 'role-admin', code: 'admin', name: '系统管理员', level: '全局', description: '系统最高权限', is_active: true },
  { id: 'role-biz-owner', code: 'business_owner', name: '业务负责人', level: '管理层', description: '查看全部业务工单、全局看板、导出，不可操作工单', is_active: true },
  { id: 'role-biz-leader', code: 'business_group_leader', name: '业务组长', level: '主管层', description: '查看本组全部工单；可发起/修改/撤回', is_active: true },
  { id: 'role-biz-member', code: 'business_group_member', name: '业务员', level: '执行层', description: '只看自己发起的工单', is_active: true },
  { id: 'role-data-leader', code: 'data_entry_leader', name: '数据录入组长', level: '主管层', description: '数据录入模块全量', is_active: true },
  { id: 'role-shared-owner', code: 'shared_team_owner', name: '共享团队负责人', level: '主管层', description: '劳动合同+入离职联系模块全量', is_active: true },
  { id: 'role-contract', code: 'labor_contract_member', name: '合同专员', level: '执行层', description: '合同新签/续签/待遇申报', is_active: true },
  { id: 'role-hr-contact', code: 'onboarding_resignation_member', name: '入离职联系专员', level: '执行层', description: '入职联系/离职联系/离职证明', is_active: true },
  { id: 'role-social-insurance', code: 'social_insurance_specialist', name: '福保负责人', level: '主管层', description: '福利保障部社保公积金办理负责人', is_active: true },
];

const DEPTS = [
  { id: 'dept-1', code: 'sys_admin', name: '系统管理', parent_id: null, sort_order: 1, is_active: true, created_at: now },
  { id: 'dept-2', code: 'business', name: '业务团队', parent_id: null, sort_order: 2, is_active: true, created_at: now },
  { id: 'dept-3', code: 'shared', name: '共享团队', parent_id: null, sort_order: 3, is_active: true, created_at: now },
  { id: 'dept-4', code: 'biz_group1', name: '业务1组', parent_id: 'dept-2', sort_order: 1, is_active: true, created_at: now },
  { id: 'dept-5', code: 'biz_group2', name: '业务2组', parent_id: 'dept-2', sort_order: 2, is_active: true, created_at: now },
  { id: 'dept-6', code: 'biz_group3', name: '业务3组', parent_id: 'dept-2', sort_order: 3, is_active: true, created_at: now },
  { id: 'dept-7', code: 'biz_group4', name: '业务4组', parent_id: 'dept-2', sort_order: 4, is_active: true, created_at: now },
  { id: 'dept-8', code: 'biz_group5', name: '业务5组', parent_id: 'dept-2', sort_order: 5, is_active: true, created_at: now },
  { id: 'dept-9', code: 'welfare_security', name: '福利保障部', parent_id: null, sort_order: 9, is_active: true, created_at: now },
];

const CUSTOMERS = [
  { id: 'cust-1', customer_code: 'ZJQF001', customer_name: '浙江企服服务外包有限公司', is_active: true, created_at: now },
  { id: 'cust-2', customer_code: 'HZKJ002', customer_name: '杭州科技有限公司', is_active: true, created_at: now },
  { id: 'cust-3', customer_code: 'NBSM003', customer_name: '宁波商贸有限公司', is_active: true, created_at: now },
  { id: 'cust-4', customer_code: 'WZGY004', customer_name: '温州工业集团有限公司', is_active: true, created_at: now },
  { id: 'cust-5', customer_code: 'JXWL005', customer_name: '嘉兴物流有限公司', is_active: false, created_at: now },
  { id: 'cust-6', customer_code: 'SXJY006', customer_name: '绍兴教育科技有限公司', is_active: true, created_at: now },
];

const BASE_FIELDS = [
  { id: 'f1', field_code: 'customer_name', field_name: '客户名称', field_type: 'text', is_required: true, default_required: true, order_type: 'onboarding', display_order: 1, is_active: true },
  { id: 'f2', field_code: 'customer_code', field_name: '客户代码', field_type: 'text', is_required: true, order_type: 'onboarding', display_order: 2, is_active: true },
  { id: 'f3', field_code: 'position', field_name: '岗位', field_type: 'text', is_required: true, order_type: 'onboarding', display_order: 3, is_active: true },
  { id: 'f4', field_code: 'employee_name', field_name: '姓名', field_type: 'text', is_required: true, order_type: 'onboarding', display_order: 4, is_active: true },
  { id: 'f5', field_code: 'id_card_no', field_name: '身份证号', field_type: 'text', is_required: true, validation_regex: '^\\d{17}[\\dXx]$', validation_msg: '身份证号格式不正确', order_type: 'onboarding', display_order: 5, is_active: true },
  { id: 'f6', field_code: 'gender', field_name: '性别', field_type: 'dropdown', is_required: true, dropdown_options: [{ label: '男', value: '男' }, { label: '女', value: '女' }], order_type: 'onboarding', display_order: 6, is_active: true },
  { id: 'f7', field_code: 'mobile', field_name: '移动电话', field_type: 'text', is_required: true, default_required: true, order_type: 'onboarding', display_order: 7, is_active: true },
  { id: 'f8', field_code: 'email', field_name: '电子邮件', field_type: 'text', is_required: true, order_type: 'onboarding', display_order: 8, is_active: true },
  { id: 'f9', field_code: 'base_salary', field_name: '基本工资', field_type: 'number', is_required: true, order_type: 'onboarding', display_order: 9, is_active: true },
  { id: 'f10', field_code: 'contract_start_date', field_name: '合同开始日期', field_type: 'date', is_required: true, order_type: 'onboarding', display_order: 10, is_active: true },
];

const FIELD_PERMISSIONS = [
  { id: 'fp-1', role_id: 'role-biz-member', field_code: 'employee_name', field_name: '姓名', permission: 'visible', scenario: 'main' },
  { id: 'fp-2', role_id: 'role-biz-member', field_code: 'base_salary', field_name: '基本工资', permission: 'visible', scenario: 'main' },
  { id: 'fp-3', role_id: 'role-contract', field_code: 'employee_name', field_name: '姓名', permission: 'visible', scenario: 'dispatched:contract' },
  { id: 'fp-4', role_id: 'role-contract', field_code: 'base_salary', field_name: '基本工资', permission: 'masked', scenario: 'dispatched:contract' },
  { id: 'fp-5', role_id: 'role-contract', field_code: 'social_base', field_name: '社保基数', permission: 'hidden', scenario: 'dispatched:contract' },
  { id: 'fp-6', role_id: 'role-data-leader', field_code: 'employee_name', field_name: '姓名', permission: 'visible', scenario: 'dispatched:data_entry' },
  { id: 'fp-7', role_id: 'role-hr-contact', field_code: 'bank_name', field_name: '开户银行', permission: 'visible', scenario: 'dispatched:onboarding_contact' },
  { id: 'fp-8', role_id: 'role-hr-contact', field_code: 'bank_account', field_name: '借记卡号', permission: 'visible', scenario: 'dispatched:onboarding_contact' },
];

const DISPATCH_RULES = [
  { id: 'dr-1', rule_name: '入职→数据录入（无条件）', order_type: 'onboarding', trigger_conditions: null, target_module: 'data_entry', dispatch_strategy: 'pool', is_active: true, priority: 1, created_at: now },
  { id: 'dr-3', rule_name: '入职→入职联系（需联系=是）', order_type: 'onboarding', trigger_conditions: { type: 'group', operator: 'AND', conditions: [{ type: 'leaf', field: 'need_onboarding_contact', operator: 'eq', value: '是' }] }, target_module: 'onboarding_contact', dispatch_strategy: 'pool', is_active: true, priority: 3, created_at: now },
  { id: 'dr-4', rule_name: '入职→劳动合同（企服发起=是）', order_type: 'onboarding', trigger_conditions: { type: 'group', operator: 'AND', conditions: [{ type: 'leaf', field: 'need_company_contract', operator: 'eq', value: '是' }] }, target_module: 'contract', dispatch_strategy: 'round_robin', is_active: true, priority: 4, created_at: now },
  { id: 'dr-5', rule_name: '入职→合同主管备份', order_type: 'onboarding', trigger_conditions: null, target_module: 'contract', dispatch_strategy: 'fixed', is_active: false, priority: 5, created_at: now },
];

const MODULE_HANDLERS_MSW = [
  { id: 'mh-1', module_code: 'contract', handler_id: 'u-22', handler_name: '江璐', weight: 2, is_backup: false, is_active: true },
  { id: 'mh-2', module_code: 'contract', handler_id: 'u-23', handler_name: '杨纯', weight: 2, is_backup: false, is_active: true },
  { id: 'mh-3', module_code: 'renewal_contract', handler_id: 'u-23', handler_name: '杨纯', weight: 1, is_backup: false, is_active: true },
  { id: 'mh-4', module_code: 'benefit', handler_id: 'u-23', handler_name: '杨纯', weight: 1, is_backup: false, is_active: true },
  { id: 'mh-5', module_code: 'onboarding_contact', handler_id: 'u-22', handler_name: '江璐', weight: 1, is_backup: false, is_active: true },
  { id: 'mh-6', module_code: 'onboarding_contact', handler_id: 'u-24', handler_name: '毛雅妮', weight: 1, is_backup: false, is_active: true },
  { id: 'mh-7', module_code: 'resignation_contact', handler_id: 'u-22', handler_name: '江璐', weight: 1, is_backup: false, is_active: true },
  { id: 'mh-8', module_code: 'resignation_contact', handler_id: 'u-24', handler_name: '毛雅妮', weight: 1, is_backup: false, is_active: true },
  { id: 'mh-9', module_code: 'resignation_cert', handler_id: 'u-24', handler_name: '毛雅妮', weight: 1, is_backup: false, is_active: true },
  { id: 'mh-10', module_code: 'data_entry', handler_id: 'u-21', handler_name: '安娜祯', weight: 1, is_backup: false, is_active: true },
  { id: 'mh-11', module_code: 'social_insurance', handler_id: 'u-25', handler_name: '傅倩雯', weight: 10, is_backup: false, is_active: true },
];

const EXPORT_TEMPLATES = [
  { id: 't-1', template_name: '入职工单导出模板', module_code: 'contract', field_list: [{ field_code: 'employee_name', alias: '姓名', order: 1 }, { field_code: 'id_card_no', alias: '身份证号', order: 2 }, { field_code: 'contract_start_date', alias: '合同开始', order: 3 }, { field_code: 'contract_end_date', alias: '合同结束', order: 4 }], created_by: 'admin', is_shared: true, created_at: now },
  { id: 't-2', template_name: '数据录入导出表', module_code: 'data_entry', field_list: [{ field_code: 'employee_name', alias: '姓名', order: 1 }, { field_code: 'mobile', alias: '手机', order: 2 }, { field_code: 'email', alias: '邮箱', order: 3 }], created_by: 'admin', is_shared: true, created_at: now },
];

const LOGS = [
  { id: 'log-1', entity_type: 'work_order', entity_id: '1', user_name: '业务员A', action_type: 'create', before_data: null, after_data: { employee_name: '张三' }, ip_address: '192.168.1.100', created_at: now },
  { id: 'log-2', entity_type: 'work_order', entity_id: '1', user_name: '业务员A', action_type: 'submit', before_data: { status: 'draft' }, after_data: { status: 'pending' }, ip_address: '192.168.1.100', created_at: now },
  { id: 'log-3', entity_type: 'dispatched_order', entity_id: 'd3', user_name: 'DispatchEngine', action_type: 'dispatch', before_data: null, after_data: { module_code: 'contract' }, ip_address: '127.0.0.1', created_at: now },
  { id: 'log-4', entity_type: 'dispatched_order', entity_id: 'd3', user_name: '合同专员A', action_type: 'accept', before_data: { status: 'pending' }, after_data: { status: 'processing' }, ip_address: '192.168.1.200', created_at: now },
  { id: 'log-5', entity_type: 'dispatched_order', entity_id: 'd1', user_name: '录入员A', action_type: 'supplement', before_data: { bank_name: '' }, after_data: { bank_name: '工行' }, ip_address: '192.168.1.202', created_at: now },
  { id: 'log-6', entity_type: 'dispatched_order', entity_id: 'd8', user_name: '社保专员B', action_type: 'return', before_data: { status: 'processing' }, after_data: { status: 'returned' }, ip_address: '192.168.1.201', created_at: now },
];

function pageResult<T>(list: T[], page = 1, pageSize = 20) {
  return { list, page, pageSize, total: list.length, totalPages: Math.ceil(list.length / pageSize), success: true };
}

// Mutable copies for CRUD simulation
let usersData = [...USERS];
let rolesData = [...ROLES];
let deptsData = [...DEPTS];
let customersData = [...CUSTOMERS];
let fieldsData = [...BASE_FIELDS];
let rulesData = [...DISPATCH_RULES];
let mhData = [...MODULE_HANDLERS_MSW];
let tmplData = [...EXPORT_TEMPLATES];

export const adminHandlers = [
  // ========== Users ==========
  http.get('/api/admin/users', async ({ request }) => {
    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword') || '';
    let list = keyword ? usersData.filter((u) => u.username.includes(keyword) || u.real_name.includes(keyword) || u.email.includes(keyword)) : [...usersData];
    return ok(pageResult(list));
  }),
  http.post('/api/admin/users', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newUser = { id: 'u-' + Date.now(), username: body.username as string || 'newuser', real_name: body.real_name as string || '新用户', email: body.email as string || '', phone: body.phone as string || '', is_active: true, created_at: now, group_name: (body.group_name as string) || '', roles: (body.roles as { role_id: string; role_name: string }[]) || [] };
    usersData.push(newUser);
    return ok(newUser);
  }),
  http.put('/api/admin/users/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const idx = usersData.findIndex((u) => u.id === params.id);
    if (idx >= 0) usersData[idx] = { ...usersData[idx], ...body, roles: usersData[idx].roles };
    return ok(idx >= 0 ? usersData[idx] : null);
  }),
  http.delete('/api/admin/users/:id', async ({ params }) => {
    usersData = usersData.filter((u) => u.id !== params.id);
    return ok(null);
  }),

  // ========== Roles ==========
  http.get('/api/admin/roles', async () => ok([...rolesData])),
  http.post('/api/admin/roles', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newRole = { id: 'role-' + Date.now(), code: body.code as string || '', name: body.name as string || '', level: body.level as string || '', description: body.description as string || '', is_active: true };
    rolesData.push(newRole);
    return ok(newRole);
  }),
  http.put('/api/admin/roles/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const idx = rolesData.findIndex((r) => r.id === params.id);
    if (idx >= 0) rolesData[idx] = { ...rolesData[idx], ...body };
    return ok(idx >= 0 ? rolesData[idx] : null);
  }),
  http.delete('/api/admin/roles/:id', async ({ params }) => {
    rolesData = rolesData.filter((r) => r.id !== params.id);
    return ok(null);
  }),

  // ========== Departments ==========
  http.get('/api/admin/departments', async () => ok([...deptsData])),
  http.get('/api/admin/departments/tree', async () => {
    const roots = deptsData.filter((d) => !d.parent_id);
    const tree = roots.map((root) => ({ ...root, children: deptsData.filter((d) => d.parent_id === root.id) }));
    return ok(tree);
  }),
  http.post('/api/admin/departments', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newDept = { id: 'dept-' + Date.now(), code: body.code as string || '', name: body.name as string || '', parent_id: body.parent_id as string || null, sort_order: deptsData.length + 1, is_active: true, created_at: now };
    deptsData.push(newDept);
    return ok(newDept);
  }),
  http.put('/api/admin/departments/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const idx = deptsData.findIndex((d) => d.id === params.id);
    if (idx >= 0) deptsData[idx] = { ...deptsData[idx], ...body };
    return ok(idx >= 0 ? deptsData[idx] : null);
  }),
  http.delete('/api/admin/departments/:id', async ({ params }) => {
    deptsData = deptsData.filter((d) => d.id !== params.id);
    return ok(null);
  }),

  // ========== Customers ==========
  http.get('/api/admin/customers', async ({ request }) => {
    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword') || '';
    const list = keyword ? customersData.filter((c) => c.customer_name.includes(keyword) || c.customer_code.includes(keyword)) : [...customersData];
    return ok(pageResult(list));
  }),
  http.post('/api/admin/customers', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newCust = { id: 'cust-' + Date.now(), customer_code: body.customer_code as string || '', customer_name: body.customer_name as string || '', is_active: true, created_at: now };
    customersData.push(newCust);
    return ok(newCust);
  }),
  http.put('/api/admin/customers/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const idx = customersData.findIndex((c) => c.id === params.id);
    if (idx >= 0) customersData[idx] = { ...customersData[idx], ...body };
    return ok(idx >= 0 ? customersData[idx] : null);
  }),
  http.delete('/api/admin/customers/:id', async ({ params }) => {
    customersData = customersData.filter((c) => c.id !== params.id);
    return ok(null);
  }),

  // ========== Fields ==========
  http.get('/api/admin/fields', async ({ request }) => {
    const url = new URL(request.url);
    const orderType = url.searchParams.get('order_type');
    const list = orderType ? fieldsData.filter((f) => f.order_type === orderType || !f.order_type) : [...fieldsData];
    return ok(list);
  }),
  http.get('/api/admin/fields/:id', async ({ params }) => {
    const found = fieldsData.find((f) => f.id === params.id) || fieldsData[0];
    return ok(found);
  }),
  http.post('/api/admin/fields', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newField = { id: 'f-' + Date.now(), field_code: (body.field_code as string) || '', field_name: (body.field_name as string) || '', field_type: (body.field_type as string) || 'text', is_required: (body.is_required as boolean) || false, default_required: false, order_type: (body.order_type as string) || null, display_order: fieldsData.length + 1, is_active: true };
    fieldsData.push(newField as typeof BASE_FIELDS[0]);
    return ok(newField);
  }),
  http.put('/api/admin/fields/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const idx = fieldsData.findIndex((f) => f.id === params.id);
    if (idx >= 0) fieldsData[idx] = { ...fieldsData[idx], ...body };
    return ok(idx >= 0 ? fieldsData[idx] : null);
  }),
  http.delete('/api/admin/fields/:id', async ({ params }) => {
    fieldsData = fieldsData.filter((f) => f.id !== params.id);
    return ok(null);
  }),

  // ========== Field Permissions ==========
  http.get('/api/admin/field-permissions', async ({ request }) => {
    const url = new URL(request.url);
    const roleId = url.searchParams.get('role_id');
    const scenario = url.searchParams.get('scenario');
    let list = [...FIELD_PERMISSIONS];
    if (roleId) list = list.filter((p) => p.role_id === roleId);
    if (scenario) list = list.filter((p) => p.scenario === scenario);
    return ok(list);
  }),
  http.get('/api/admin/field-permissions/matrix', async () => {
    const roles = [...rolesData].filter((r) => r.is_active);
    const fields = [...fieldsData].filter((f) => f.is_active);
    const matrix = roles.map((role) => ({
      role_id: role.id, role_name: role.name,
      permissions: fields.map((field) => {
        const found = FIELD_PERMISSIONS.find((fp) => fp.role_id === role.id && fp.field_code === field.field_code);
        return { field_code: field.field_code, field_name: field.field_name, permission: found?.permission || 'hidden', scenario: found?.scenario || 'main' };
      }),
    }));
    return ok({ roles, fields, matrix, scenarios: ['main', 'dispatched:contract', 'dispatched:data_entry', 'dispatched:onboarding_contact'] });
  }),
  http.put('/api/admin/field-permissions/batch', async () => ok(null)),
  http.post('/api/admin/field-permissions', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newP = { id: 'fp-' + Date.now(), role_id: body.role_id as string || '', field_code: body.field_code as string || '', field_name: body.field_name as string || '', permission: body.permission as string || 'visible', scenario: body.scenario as string || 'main' };
    FIELD_PERMISSIONS.push(newP);
    return ok(newP);
  }),

  // ========== Dispatch Rules ==========
  http.get('/api/admin/dispatch-rules', async () => ok([...rulesData])),
  http.post('/api/admin/dispatch-rules', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newRule = { id: 'dr-' + Date.now(), rule_name: (body.rule_name as string) || '', order_type: (body.order_type as string) || 'onboarding', trigger_conditions: (body.trigger_conditions as Record<string, unknown>) || null, target_module: (body.target_module as string) || '', dispatch_strategy: (body.dispatch_strategy as string) || 'pool', is_active: true, priority: rulesData.length + 1, created_at: now };
    rulesData.push(newRule as typeof DISPATCH_RULES[0]);
    return ok(newRule);
  }),
  http.put('/api/admin/dispatch-rules/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const idx = rulesData.findIndex((r) => r.id === params.id);
    if (idx >= 0) rulesData[idx] = { ...rulesData[idx], ...body };
    return ok(idx >= 0 ? rulesData[idx] : null);
  }),
  http.delete('/api/admin/dispatch-rules/:id', async ({ params }) => {
    rulesData = rulesData.filter((r) => r.id !== params.id);
    return ok(null);
  }),
  http.post('/api/admin/dispatch-rules/simulate', async ({ request }) => {
    const body = await request.json() as { extra_data?: Record<string, unknown>; order_type?: string };
    const hits = rulesData.filter((r) => r.is_active && r.order_type === (body.order_type || 'onboarding'));
    return ok({ total_rules: rulesData.length, matched: hits.length, hits: hits.map((r) => ({ rule_id: r.id, rule_name: r.rule_name, target_module: r.target_module, dispatch_strategy: r.dispatch_strategy })) });
  }),

  // ========== Module Handlers ==========
  http.get('/api/admin/module-handlers', async ({ request }) => {
    const url = new URL(request.url);
    const moduleCode = url.searchParams.get('moduleCode') || url.searchParams.get('module_code');
    const isActive = url.searchParams.get('isActive');
    const list = mhData.filter((m) =>
      (!moduleCode || m.module_code === moduleCode) &&
      (isActive === null || String(m.is_active) === isActive),
    );
    return ok(list);
  }),
  http.post('/api/admin/module-handlers', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newMh = { id: 'mh-' + Date.now(), module_code: body.module_code as string || '', handler_id: body.handler_id as string || '', handler_name: '', weight: (body.weight as number) || 1, is_backup: (body.is_backup as boolean) || false, is_active: true };
    mhData.push(newMh);
    return ok(newMh);
  }),
  http.put('/api/admin/module-handlers/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const idx = mhData.findIndex((m) => m.id === params.id);
    if (idx >= 0) mhData[idx] = { ...mhData[idx], ...body };
    return ok(idx >= 0 ? mhData[idx] : null);
  }),
  http.delete('/api/admin/module-handlers/:id', async ({ params }) => {
    mhData = mhData.filter((m) => m.id !== params.id);
    return ok(null);
  }),

  // ========== Export Templates ==========
  http.get('/api/admin/export-templates', async ({ request }) => {
    const url = new URL(request.url);
    const moduleCode = url.searchParams.get('module_code');
    const list = moduleCode ? tmplData.filter((t) => t.module_code === moduleCode) : [...tmplData];
    return ok(list);
  }),
  http.post('/api/admin/export-templates', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newT = { id: 't-' + Date.now(), template_name: body.template_name as string || '', module_code: body.module_code as string || '', field_list: body.field_list || [], created_by: 'admin', is_shared: (body.is_shared as boolean) || true, created_at: now };
    tmplData.push(newT as typeof EXPORT_TEMPLATES[0]);
    return ok(newT);
  }),
  http.put('/api/admin/export-templates/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const idx = tmplData.findIndex((t) => t.id === params.id);
    if (idx >= 0) tmplData[idx] = { ...tmplData[idx], ...body };
    return ok(idx >= 0 ? tmplData[idx] : null);
  }),
  http.delete('/api/admin/export-templates/:id', async ({ params }) => {
    tmplData = tmplData.filter((t) => t.id !== params.id);
    return ok(null);
  }),

  // ========== Operation Logs ==========
  http.get('/api/admin/logs', async ({ request }) => {
    const url = new URL(request.url);
    let list = [...LOGS];
    if (url.searchParams.get('action_type')) list = list.filter((l) => l.action_type === url.searchParams.get('action_type'));
    if (url.searchParams.get('user_name')) list = list.filter((l) => l.user_name.includes(url.searchParams.get('user_name') || ''));
    return ok(pageResult(list));
  }),
];
