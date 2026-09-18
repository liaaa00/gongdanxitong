import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Card, Checkbox, Empty, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { EditOutlined, KeyOutlined, PlusOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons';
import { getAllCustomerRules, type CustomerRuleItem } from '@/services/customerRules';
import {
  createCustomerPortalAccount,
  getCustomerPortalAccounts,
  resetCustomerPortalPassword,
  setCustomerPortalAccountSubjects,
  updateCustomerPortalAccount,
  PORTAL_BUSINESS_OPTIONS,
  type CustomerPortalAccountItem,
  type PortalBusinessPermission,
  type SaveCustomerPortalAccountInput,
} from '@/services/customerPortalAccounts';

const { Text } = Typography;

function missingRules(customer: CustomerRuleItem | undefined, permissions: PortalBusinessPermission[]): string[] {
  if (permissions.length === 0) return [];
  if (!customer?.configured) return ['整套客户办理规则'];
  const missing: string[] = [];
  if (!customer.isActive) missing.push('启用整套客户规则');
  if (permissions.includes('employee_changes')) {
    if (!Object.keys(customer.onboardingDefaults || {}).length) missing.push('入职规则');
    if (!Object.keys(customer.resignationDefaults || {}).length) missing.push('离职规则');
  }
  if (permissions.includes('salary')) {
    const day = customer.salaryRules?.billingDay;
    if (day == null || !Number.isInteger(day) || day < 1 || day > 28) missing.push('薪资账单日');
  }
  if (!customer.sharedEmailRules?.mailbox?.trim()) missing.push('共享邮箱地址');
  return missing;
}

const CustomerPortalAccounts: React.FC = () => {
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCustomerId = searchParams.get('customerId') || '';
  const [customers, setCustomers] = useState<CustomerRuleItem[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [accounts, setAccounts] = useState<CustomerPortalAccountItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [editing, setEditing] = useState<CustomerPortalAccountItem | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [passwordAccount, setPasswordAccount] = useState<CustomerPortalAccountItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<SaveCustomerPortalAccountInput & { subjects?: string[]; primarySubjectId?: string }>();
  const [passwordForm] = Form.useForm<{ password: string; mustChangePassword: boolean }>();
  const selectedPermissions: PortalBusinessPermission[] = Form.useWatch('businessPermissions', form) || [];
  const selectedActive = Form.useWatch('isActive', form);
  const selectedSubjects: string[] = Form.useWatch('subjects', form) || [];
  const selectedPrimarySubject = Form.useWatch('primarySubjectId', form);

  const currentCustomer = useMemo(() => customers.find((item) => item.customerId === customerId), [customers, customerId]);

  const permissionsToValidate = (values: Pick<SaveCustomerPortalAccountInput, 'businessPermissions' | 'isActive'>): PortalBusinessPermission[] => {
    const permissions = values.businessPermissions || [];
    if (!editing) return permissions;
    if (!(values.isActive ?? editing.isActive)) return [];
    return editing.isActive ? permissions.filter((permission) => !editing.businessPermissions.includes(permission)) : permissions;
  };
  const selectedMissingRules = missingRules(currentCustomer, permissionsToValidate({ businessPermissions: selectedPermissions, isActive: selectedActive }));

  const loadCustomers = async () => {
    setCustomersLoading(true);
    try {
      setCustomers(await getAllCustomerRules());
    } catch (error: any) {
      message.error(error?.message || '客户列表加载失败');
    } finally {
      setCustomersLoading(false);
    }
  };

  const loadAccounts = async (nextCustomerId = customerId) => {
    if (!nextCustomerId) { setAccounts([]); return; }
    setLoading(true);
    try {
      setAccounts(await getCustomerPortalAccounts(nextCustomerId));
    } catch (error: any) {
      message.error(error?.message || '门户账号加载失败');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadCustomers(); }, []);

  useEffect(() => {
    if (customers.length === 0) {
      if (customerId) setCustomerId('');
      return;
    }

    const requestedExists = requestedCustomerId
      ? customers.some((item) => item.customerId === requestedCustomerId)
      : false;
    const currentExists = customerId
      ? customers.some((item) => item.customerId === customerId)
      : false;
    const nextCustomerId = requestedExists
      ? requestedCustomerId
      : currentExists
        ? customerId
        : customers[0].customerId;

    if (nextCustomerId !== customerId) setCustomerId(nextCustomerId);
    if (requestedCustomerId !== nextCustomerId) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('customerId', nextCustomerId);
      setSearchParams(nextParams, { replace: true });
    }
  }, [customers, requestedCustomerId]);

  useEffect(() => { void loadAccounts(customerId); }, [customerId]);

  const handleCustomerChange = (nextCustomerId: string) => {
    setCustomerId(nextCustomerId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', 'accounts');
    nextParams.set('customerId', nextCustomerId);
    setSearchParams(nextParams, { replace: true });
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ isActive: true, mustChangePassword: true, businessPermissions: [] });
    setAccountOpen(true);
  };

  const openEdit = (account: CustomerPortalAccountItem) => {
    setEditing(account);
    form.setFieldsValue({
      loginEmail: account.loginEmail,
      contactName: account.contactName,
      isActive: account.isActive,
      mustChangePassword: account.mustChangePassword,
      businessPermissions: account.businessPermissions,
      subjects: account.subjects?.length ? account.subjects.map((item) => item.id) : [account.customerId],
      primarySubjectId: account.primarySubjectId || account.customerId,
    });
    setAccountOpen(true);
  };

  const saveAccount = async () => {
    if (!customerId) return;
    let values: SaveCustomerPortalAccountInput & { subjects?: string[]; primarySubjectId?: string };
    try { values = await form.validateFields(); } catch { return; }
    const missing = missingRules(currentCustomer, permissionsToValidate(values));
    if (missing.length) {
      message.error(`请先完善所选业务的客户办理规则：${missing.join('、')}`);
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        // 批次3：剥离 subjects / primarySubjectId 后再 PUT，避免全局 ValidationPipe(forbidNonWhitelisted) 拒 400；
        // 主体集合仍走下方独立 setSubjects 接口。
        const { subjects, primarySubjectId, ...accountValues } = values;
        await updateCustomerPortalAccount(customerId, editing.id, accountValues);
        // 批次3：主体集合变更走独立接口（后端负责主主体不可取消校验 + bump session_version 踢在途 token）。
        const nextSubjects = (subjects || []).filter(Boolean);
        const originalSubjectIds = editing.subjects?.length ? editing.subjects.map((item) => item.id) : [editing.customerId];
        const primaryChanged = (primarySubjectId || editing.primarySubjectId || editing.customerId) !== (editing.primarySubjectId || editing.customerId);
        if (nextSubjects.length && ([...nextSubjects].sort().join(',') !== [...originalSubjectIds].sort().join(',') || primaryChanged)) {
          await setCustomerPortalAccountSubjects(customerId, editing.id, {
            subjects: nextSubjects,
            primarySubjectId: primarySubjectId || editing.primarySubjectId || editing.customerId,
          });
          message.info('主体集合已更新，该账号的在途登录已失效，需重新登录');
        }
        message.success('门户账号已更新');
      } else {
        await createCustomerPortalAccount(customerId, values);
        message.success('门户账号已创建');
      }
      setAccountOpen(false);
      await loadAccounts();
    } catch (error: any) {
      message.error(error?.message || '门户账号保存失败');
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    if (!customerId || !passwordAccount) return;
    let values: { password: string; mustChangePassword: boolean };
    try { values = await passwordForm.validateFields(); } catch { return; }
    setSaving(true);
    try {
      await resetCustomerPortalPassword(customerId, passwordAccount.id, values.password, values.mustChangePassword);
      message.success('密码已重置');
      setPasswordAccount(null);
      passwordForm.resetFields();
      await loadAccounts();
    } catch (error: any) {
      message.error(error?.message || '密码重置失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={<Space><UserOutlined />门户登录账号</Space>}
      extra={<Space><Button icon={<ReloadOutlined />} onClick={() => void Promise.all([loadCustomers(), loadAccounts()])} loading={loading || customersLoading}>刷新</Button><Button type="primary" icon={<PlusOutlined />} disabled={!customerId} onClick={openCreate}>新增账号</Button></Space>}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text strong>选择客户</Text>
          <Select
            showSearch
            loading={customersLoading}
            value={customerId || undefined}
            placeholder="请选择客户"
            optionFilterProp="label"
            style={{ width: 360, maxWidth: '100%' }}
            options={customers.map((item) => ({ value: item.customerId, label: `${item.customerName}（${item.customerCode || '-'}） · ${item.customerId}` }))}
            onChange={handleCustomerChange}
          />
          {currentCustomer && <Text type="secondary" copyable>{currentCustomer.customerId}</Text>}
        </div>
        {currentCustomer?.readiness && !currentCustomer.readiness.ready && <Alert type="warning" showIcon message="当前客户仍有待完善的办理规则，开通账号时按所选业务校验" description={currentCustomer.readiness.missing.join('、')} style={{ marginBottom: 12 }} />}
        <Text type="secondary">按账号授权增减员和薪资业务；权限调整、停用或重置密码后，原登录会话立即失效。</Text>
        {customerId ? (
          <Table<CustomerPortalAccountItem>
            rowKey="id"
            loading={loading}
            dataSource={accounts}
            locale={{ emptyText: <Empty description="当前客户还没有门户账号" /> }}
            scroll={{ x: 1300 }}
            pagination={false}
            columns={[
              { title: '登录邮箱', dataIndex: 'loginEmail', width: 240 },
              { title: '联系人', dataIndex: 'contactName', width: 150 },
              {
                title: '关联主体',
                width: 220,
                render: (_, row) => {
                  const subjects = row.subjects?.length ? row.subjects : [{ id: row.customerId, name: '', isPrimary: true }];
                  return (
                    <Space size={4} wrap>
                      {subjects.map((item) => {
                        const name = item.name || customers.find((customer) => customer.customerId === item.id)?.customerName || item.id.slice(0, 8);
                        return <Tag key={item.id} color={item.isPrimary ? 'geekblue' : 'default'}>{item.isPrimary ? '★ ' : ''}{name}</Tag>;
                      })}
                    </Space>
                  );
                },
              },
              { title: '业务权限', width: 220, render: (_, row) => <Space size={4} wrap>{PORTAL_BUSINESS_OPTIONS.filter((item) => row.businessPermissions?.includes(item.value)).map((item) => <Tag key={item.value} color="blue">{item.label}</Tag>)}</Space> },
              { title: '状态', width: 100, render: (_, row) => <Tag color={row.isActive ? 'success' : 'default'}>{row.isActive ? '启用' : '停用'}</Tag> },
              { title: '首次改密', width: 100, render: (_, row) => row.mustChangePassword ? <Tag color="warning">需要</Tag> : <Tag>不需要</Tag> },
              { title: '最近登录', dataIndex: 'lastLoginAt', width: 180, render: (value) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未登录' },
              { title: '操作', fixed: 'right', width: 190, render: (_, row) => <Space><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>编辑</Button><Button size="small" icon={<KeyOutlined />} onClick={() => { setPasswordAccount(row); passwordForm.setFieldsValue({ mustChangePassword: true }); }}>重置密码</Button></Space> },
            ]}
          />
        ) : <Empty description="请先创建并选择客户" />}
      </Space>

      <Modal title={editing ? '编辑门户账号' : '新增门户账号'} open={accountOpen} onOk={() => void saveAccount()} confirmLoading={saving} onCancel={() => setAccountOpen(false)} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="loginEmail" label="登录邮箱" rules={[{ required: true, message: '请输入登录邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}><Input autoComplete="off" placeholder="name@example.com" /></Form.Item>
          <Form.Item name="contactName" label="联系人姓名/备注" rules={[{ required: true, message: '请输入联系人姓名或备注' }, { max: 100 }]}><Input placeholder="例如：张女士（增减员联系人）" /></Form.Item>
          {!editing && <Form.Item name="password" label="初始密码" rules={[{ required: true, message: '请输入初始密码' }, { pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/, message: '8 至 72 位，且同时包含字母和数字' }]}><Input.Password autoComplete="new-password" /></Form.Item>}
          <Form.Item name="businessPermissions" label="业务权限" extra="增员和减员共用一个权限；薪资单独授权" rules={[{ required: true, type: 'array', min: 1, message: '请至少选择一项业务权限' }]}><Checkbox.Group options={PORTAL_BUSINESS_OPTIONS} /></Form.Item>
          {editing && (
            <>
              <Form.Item
                name="subjects"
                label="关联主体"
                extra="一个账号可挂载多个主体办理业务；主主体停用将阻断整个账号登录"
                rules={[
                  { required: true, type: 'array', min: 1, message: '请至少选择一个关联主体' },
                  {
                    validator: (_, value: string[] | undefined) => {
                      // 拍板③：主主体不可取消——编辑时原主主体必须保留在集合中。
                      const originalPrimary = editing.primarySubjectId || editing.customerId;
                      if (value && !value.includes(originalPrimary)) {
                        return Promise.reject(new Error('主主体不可取消，请保留原主主体'));
                      }
                      return Promise.resolve();
                    },
                  },
                ]}
              >
                <Select
                  mode="multiple"
                  placeholder="请选择关联主体"
                  options={customers.map((item) => ({ value: item.customerId, label: `${item.customerName}（${item.customerCode || '-'}）` }))}
                  onChange={(next: string[]) => {
                    // 主主体被移出集合时自动回落到原主主体或首个选项。
                    const current = form.getFieldValue('primarySubjectId') as string | undefined;
                    if (!next?.includes(current || '')) {
                      form.setFieldValue('primarySubjectId', next?.includes(editing.primarySubjectId || editing.customerId) ? (editing.primarySubjectId || editing.customerId) : (next?.[0] || undefined));
                    }
                  }}
                />
              </Form.Item>
              <Form.Item
                name="primarySubjectId"
                label="主主体"
                extra="门户登录默认以主主体展示；主主体切换要求该主体办理规则齐备"
                rules={[
                  { required: true, message: '请选择主主体' },
                  {
                    validator: (_, value: string | undefined) => {
                      const subjects = (form.getFieldValue('subjects') as string[] | undefined) || [];
                      if (value && !subjects.includes(value)) return Promise.reject(new Error('主主体必须包含在关联主体集合中'));
                      return Promise.resolve();
                    },
                  },
                ]}
              >
                <Select
                  placeholder="请选择主主体"
                  options={selectedSubjects.map((id) => {
                    const match = customers.find((item) => item.customerId === id);
                    return { value: id, label: match ? `${match.customerName}（${match.customerCode || '-'}）` : id };
                  })}
                />
              </Form.Item>
            </>
          )}
          {selectedMissingRules.length > 0 && <Alert type="warning" showIcon message="所选业务的办理规则尚未完成" description={selectedMissingRules.join('、')} style={{ marginBottom: 16 }} />}
          <Form.Item name="isActive" label="启用账号" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="mustChangePassword" label="下次登录必须修改密码" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>

      <Modal title={`重置密码${passwordAccount ? ` · ${passwordAccount.contactName}` : ''}`} open={Boolean(passwordAccount)} onOk={() => void savePassword()} confirmLoading={saving} onCancel={() => { setPasswordAccount(null); passwordForm.resetFields(); }} destroyOnHidden>
        <Form form={passwordForm} layout="vertical" initialValues={{ mustChangePassword: true }}>
          <Form.Item name="password" label="新密码" rules={[{ required: true, message: '请输入新密码' }, { pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/, message: '8 至 72 位，且同时包含字母和数字' }]}><Input.Password autoComplete="new-password" /></Form.Item>
          <Form.Item name="mustChangePassword" label="下次登录必须修改密码" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default CustomerPortalAccounts;
