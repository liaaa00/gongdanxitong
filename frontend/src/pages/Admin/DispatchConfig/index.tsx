import { useEffect, useMemo, useRef, useState } from 'react';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import {
  Alert,
  App,
  Button,
  Collapse,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { getDispatchConfig } from '@/services/dispatchConfig';
import type { DispatchConfigItem, DispatchConfigPerson } from '@/services/dispatchConfig';
import {
  createModuleHandler,
  deleteModuleHandler,
  getModuleHandlers,
  updateModuleHandler,
} from '@/services/moduleHandlers';
import type { ModuleHandlerItem } from '@/services/moduleHandlers';
import { deleteDispatchRule, updateDispatchRule } from '@/services/dispatchRules';
import type { DispatchRuleItem } from '@/services/dispatchRules';
import {
  createExceptionModuleHandler,
  deleteExceptionModuleHandler,
  getExceptionModuleHandlers,
  updateExceptionModuleHandler,
} from '@/services/exceptionModuleHandlers';
import type { ExceptionModuleHandlerItem } from '@/services/exceptionModuleHandlers';
import { getUsers } from '@/services/users';
import type { UserItem } from '@/services/users';
import { getCustomers } from '@/services/customers';
import type { CustomerItem } from '@/services/customers';
import { useAuth } from '@/hooks/useAuth';

const { Text, Paragraph } = Typography;

type ConfigType = 'default' | 'exception';
type ActiveTab = 'default' | 'customerException';
type Option = { value: string; label: string };
type DefaultSlot = 'primary' | 'backup1' | 'backup2';

const ORDER_TYPES: Option[] = [
  { label: '入职', value: 'onboarding' },
  { label: '续签', value: 'renewal' },
  { label: '离职', value: 'resignation' },
  { label: '待遇申报', value: 'benefit' },
];

const SUB_MODULES: Array<Option & { orderType: string }> = [
  { label: '数据录入', value: 'data_entry', orderType: 'onboarding' },
  { label: '社保公积金办理', value: 'social_insurance', orderType: 'onboarding' },
  { label: '入职联系', value: 'onboarding_contact', orderType: 'onboarding' },
  { label: '劳动合同签订', value: 'contract', orderType: 'onboarding' },
  { label: '劳动合同签订', value: 'contract_signing', orderType: 'onboarding' },
  { label: '续签合同', value: 'renewal_contract', orderType: 'renewal' },
  { label: '待遇申报', value: 'benefit', orderType: 'benefit' },
  { label: '待遇申报', value: 'benefit_apply', orderType: 'benefit' },
  { label: '离职联系', value: 'resignation_contact', orderType: 'resignation' },
  { label: '离职证明', value: 'resignation_cert', orderType: 'resignation' },
  { label: '社保停保', value: 'data_entry_resign', orderType: 'resignation' },
];

const CUSTOMER_EXCEPTION_MODULE_CODES = new Set(['data_entry', 'social_insurance', 'onboarding_contact', 'contract']);
const CUSTOMER_EXCEPTION_MODULES = SUB_MODULES.filter((item) => CUSTOMER_EXCEPTION_MODULE_CODES.has(item.value));

const EMPTY_PERSON_TIP = '负责人未配置，请点击编辑补充，否则相关工单可能无人处理。';

const PLACEHOLDER_VALUES = new Set([
  '',
  '-',
  '--',
  '—',
  '未配置',
  '待配置',
  '待分配',
  '暂无',
  '无',
  '空',
  'null',
  'undefined',
  'n/a',
  'na',
  'placeholder',
]);

const labelOf = (opts: Option[], value?: string) =>
  opts.find((item) => item.value === value)?.label || value || '—';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const isPlaceholderText = (value?: unknown): boolean => {
  const text = String(value ?? '').trim();
  const lower = text.toLowerCase();
  return !text || PLACEHOLDER_VALUES.has(lower) || text.includes('占位') || text.includes('未配置') || text.includes('待配置');
};

const validText = (value?: unknown): string | undefined => {
  const text = asString(value);
  return text && !isPlaceholderText(text) ? text : undefined;
};

const firstValidText = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    const text = validText(value);
    if (text) return text;
  }
  return undefined;
};

const rowSubModule = (row: DispatchConfigItem): string | undefined =>
  firstValidText(row.sub_module, row.subModule, row.target_module, row.targetModule, row.module_code, row.moduleCode);

const rowOrderType = (row: DispatchConfigItem): string | undefined =>
  firstValidText(row.order_type, row.orderType) ||
  SUB_MODULES.find((item) => item.value === rowSubModule(row))?.orderType;

const rowModuleCode = (row: DispatchConfigItem): string | undefined =>
  firstValidText(row.module_code, row.moduleCode, row.target_module, row.targetModule, row.sub_module, row.subModule);

const rowModuleLabel = (row: DispatchConfigItem): string => {
  const orderLabel = labelOf(ORDER_TYPES, rowOrderType(row) || row.module);
  const subLabel = labelOf(SUB_MODULES, rowSubModule(row));
  if (!subLabel || subLabel === '—' || subLabel === orderLabel) return orderLabel;
  return `${orderLabel} / ${subLabel}`;
};

const personName = (person?: DispatchConfigPerson | string | null): string | undefined => {
  if (!person) return undefined;
  if (typeof person === 'string') return validText(person);
  return firstValidText(
    person.name,
    person.displayName,
    person.real_name,
    person.realName,
    person.username,
  );
};

const personUserId = (person?: DispatchConfigPerson | string | null): string | undefined => {
  if (!person || typeof person === 'string') return undefined;
  return firstValidText(person.user_id, person.userId, person.id);
};

const personSelectId = (person?: DispatchConfigPerson | string | null): string | undefined =>
  firstValidText(personUserId(person), typeof person === 'string' ? person : undefined);

const rowPrimaryId = (row: DispatchConfigItem): string | undefined =>
  firstValidText(row.assignee_user_id, row.assigneeUserId, row.handler_id, row.handlerId, personSelectId(row.primary));

const rowFallbackId = (row: DispatchConfigItem): string | undefined =>
  firstValidText(row.fallback_user_id, row.fallbackUserId, personSelectId(row.backup1));

const isRowActive = (row: DispatchConfigItem): boolean => row.is_active ?? row.isActive ?? true;

const userDisplay = (u: UserItem) =>
  u.real_name || (u as any).realName || u.username || (u as any).userName || u.id;

const customerDisplay = (c: CustomerItem) => {
  const name = c.customer_name || c.customerName || c.id;
  const code = c.customer_code || c.customerCode;
  return code ? `${name} (${code})` : name;
};

const normalizeCondition = (raw: unknown): unknown => {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('高级设置中的附加条件格式不正确，请检查后重试');
    }
  }
  return { description: text };
};

const stringifyCondition = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
};

const sortModuleHandlers = (list: ModuleHandlerItem[]) =>
  [...list].sort((a, b) => String(a.id).localeCompare(String(b.id)));

const pickDefaultSlots = (list: ModuleHandlerItem[]) => {
  const primaryList = sortModuleHandlers(list.filter((item) => !item.is_backup));
  const backupList = sortModuleHandlers(list.filter((item) => item.is_backup));
  return {
    primary: primaryList[0],
    backup1: backupList[0],
    backup2: backupList[1],
    extras: [...primaryList.slice(1), ...backupList.slice(2)],
  };
};

const AdminDispatchConfig: React.FC = () => {
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const defaultActionRef = useRef<ActionType>();
  const customerExceptionActionRef = useRef<ActionType>();
  const [users, setUsers] = useState<Option[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [customerCodeOptions, setCustomerCodeOptions] = useState<Option[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('default');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DispatchConfigItem | null>(null);
  const [customerExceptionOpen, setCustomerExceptionOpen] = useState(false);
  const [editingCustomerException, setEditingCustomerException] = useState<ExceptionModuleHandlerItem | null>(null);
  const [form] = Form.useForm();
  const [customerExceptionForm] = Form.useForm();
  const orderType = Form.useWatch('order_type', form) as string | undefined;

  const subModuleOptions = useMemo(
    () => orderType ? SUB_MODULES.filter((item) => item.orderType === orderType) : SUB_MODULES,
    [orderType],
  );

  useEffect(() => {
    (async () => {
      try {
        const [u, c] = await Promise.all([
          getUsers({ page: 1, pageSize: 100 }),
          getCustomers({ page: 1, pageSize: 100 }),
        ]);
        const userList = Array.isArray(u) ? u : u?.list || [];
        const customerList = Array.isArray(c) ? c : c?.list || [];
        setUsers(userList.map((x: UserItem) => ({
          value: x.id,
          label: `${userDisplay(x)} (${x.username || (x as any).userName || x.id})`,
        })));
        setCustomers(customerList.map((x: CustomerItem) => ({ value: x.id, label: customerDisplay(x) })));
        setCustomerCodeOptions(customerList
          .map((x: CustomerItem) => {
            const code = x.customer_code || x.customerCode;
            return code ? { value: code, label: customerDisplay(x) } : null;
          })
          .filter((item): item is Option => !!item));
      } catch { /* 静默失败，不阻断配置列表 */ }
    })();
  }, []);

  const reload = () => {
    defaultActionRef.current?.reload();
    customerExceptionActionRef.current?.reload();
  };

  const userLabel = (userId?: string) => userId ? users.find((item) => item.value === userId)?.label : undefined;

  const openCreateCustomerException = () => {
    setEditingCustomerException(null);
    customerExceptionForm.resetFields();
    customerExceptionForm.setFieldsValue({ moduleCode: 'data_entry', customerCodes: [] });
    setCustomerExceptionOpen(true);
  };

  const openEditCustomerException = (row: ExceptionModuleHandlerItem) => {
    setEditingCustomerException(row);
    customerExceptionForm.resetFields();
    customerExceptionForm.setFieldsValue({
      moduleCode: row.moduleCode || row.module_code,
      customerCode: row.customerCode || row.customer_code,
      customerCodes: [row.customerCode || row.customer_code].filter(Boolean),
      handlerId: row.handlerId || row.handler_id,
    });
    setCustomerExceptionOpen(true);
  };

  const submitCustomerException = async () => {
    const values = await customerExceptionForm.validateFields();
    const moduleCode = String(values.moduleCode || '').trim();
    const handlerId = String(values.handlerId || '').trim();
    const selectedCodes = Array.isArray(values.customerCodes) ? values.customerCodes : [];
    const customerCodes: string[] = Array.from(new Set<string>(selectedCodes
      .map((value: unknown) => String(value || '').trim().toUpperCase())
      .filter((value: string): value is string => Boolean(value))));
    try {
      if (editingCustomerException) {
        const customerCode = customerCodes[0];
        await updateExceptionModuleHandler(editingCustomerException.id, { moduleCode, customerCode, handlerId });
      } else {
        await Promise.all(customerCodes.map(async (customerCode) => {
          const existing = await getExceptionModuleHandlers({ moduleCode, customerCode, pageSize: 1 });
          if (existing.list[0]) {
            await updateExceptionModuleHandler(existing.list[0].id, { moduleCode, customerCode, handlerId });
          } else {
            await createExceptionModuleHandler({ moduleCode, customerCode, handlerId });
          }
        }));
      }
      message.success(editingCustomerException ? '客户指定派发规则已保存' : `客户指定派发规则已保存 ${customerCodes.length} 条`);
      setCustomerExceptionOpen(false);
      setEditingCustomerException(null);
      customerExceptionForm.resetFields();
      customerExceptionActionRef.current?.reload();
    } catch (err: any) {
      message.error(err?.message || '客户指定派发规则保存失败');
    }
  };

  const removeCustomerException = async (row: ExceptionModuleHandlerItem) => {
    try {
      await deleteExceptionModuleHandler(row.id);
      message.success('客户指定派发规则已删除');
      customerExceptionActionRef.current?.reload();
    } catch (err: any) {
      message.error(err?.message || '客户指定派发规则删除失败');
    }
  };

  const loadCustomerExceptionHandlers = async (params?: { current?: number; pageSize?: number }) => {
    try {
      const result = await getExceptionModuleHandlers({
        current: params?.current,
        pageSize: params?.pageSize,
      });
      return { data: result.list, success: result.success, total: result.total };
    } catch (err: any) {
      message.error(err?.message || '加载客户指定派发规则失败');
      return { data: [], success: false, total: 0 };
    }
  };

  const renderPerson = (person?: DispatchConfigPerson | string | null, fallbackUserId?: string) => {
    const userId = firstValidText(fallbackUserId, personUserId(person), typeof person === 'string' ? person : undefined);
    const name = userLabel(userId) || personName(person);
    if (!name) {
      return (
        <Tooltip title={EMPTY_PERSON_TIP}>
          <Tag color="warning">未配置</Tag>
        </Tooltip>
      );
    }
    return <Tag color="blue">{name}</Tag>;
  };

  const renderActive = (row: DispatchConfigItem) => (
    isRowActive(row) ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>
  );

  const openCreate = (_type: ConfigType = 'default') => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      type: 'default',
      order_type: 'onboarding',
      sub_module: 'data_entry',
      weight: 1,
      priority: 10,
      dispatch_strategy: 'pool',
      allow_manual_override: true,
      is_active: true,
    });
    setOpen(true);
  };

  const openEdit = (row: DispatchConfigItem) => {
    setEditing(row);
    form.resetFields();
    if (row.source === 'rules') {
      form.setFieldsValue({
        type: 'exception',
        rule_name: row.rule_name || row.ruleName,
        order_type: rowOrderType(row) || 'onboarding',
        sub_module: rowSubModule(row),
        customer_id: row.customer_id || row.customerId,
        primary_user_id: rowPrimaryId(row),
        backup1_user_id: rowFallbackId(row),
        dispatch_strategy: row.dispatch_strategy || row.dispatchStrategy || 'pool',
        priority: row.priority ?? 10,
        allow_manual_override: row.allow_manual_override ?? row.allowManualOverride ?? true,
        trigger_conditions: stringifyCondition(row.trigger_conditions ?? row.triggerConditions),
        is_active: isRowActive(row),
      });
    } else {
      form.setFieldsValue({
        type: 'default',
        order_type: rowOrderType(row) || 'onboarding',
        sub_module: rowSubModule(row),
        primary_user_id: rowPrimaryId(row),
        backup1_user_id: personSelectId(row.backup1),
        backup2_user_id: personSelectId(row.backup2),
        weight: row.weight ?? 1,
        is_active: isRowActive(row),
      });
    }
    setOpen(true);
  };

  const syncDefaultHandlers = async (options: {
    previousModuleCode?: string;
    moduleCode: string;
    primaryUserId?: string;
    backup1UserId?: string;
    backup2UserId?: string;
    weight: number;
    isActive: boolean;
  }) => {
    const currentList = options.moduleCode ? await getModuleHandlers(options.moduleCode) : [];
    const currentSlots = pickDefaultSlots(currentList);
    const touchedIds = new Set<string>();
    const slotOrder: Array<{ key: DefaultSlot; userId?: string; current?: ModuleHandlerItem; isBackup: boolean }> = [
      { key: 'primary', userId: options.primaryUserId, current: currentSlots.primary, isBackup: false },
      { key: 'backup1', userId: options.backup1UserId, current: currentSlots.backup1, isBackup: true },
      { key: 'backup2', userId: options.backup2UserId, current: currentSlots.backup2, isBackup: true },
    ];

    for (const slot of slotOrder) {
      if (slot.userId) {
        if (slot.current) {
          touchedIds.add(slot.current.id);
          await updateModuleHandler(slot.current.id, {
            module_code: options.moduleCode,
            handler_id: slot.userId,
            weight: options.weight,
            is_backup: slot.isBackup,
            is_active: options.isActive,
          });
        } else {
          const created = await createModuleHandler({
            module_code: options.moduleCode,
            handler_id: slot.userId,
            weight: options.weight,
            is_backup: slot.isBackup,
            is_active: options.isActive,
          });
          touchedIds.add(created.id);
        }
      } else if (slot.current) {
        touchedIds.add(slot.current.id);
        await deleteModuleHandler(slot.current.id);
      }
    }

    for (const record of currentList) {
      if (!touchedIds.has(record.id)) {
        await deleteModuleHandler(record.id);
      }
    }

    if (options.previousModuleCode && options.previousModuleCode !== options.moduleCode) {
      const previousList = await getModuleHandlers(options.previousModuleCode);
      for (const record of previousList) {
        await deleteModuleHandler(record.id);
      }
    }
  };

  const removeDefaultHandlers = async (moduleCode?: string) => {
    if (!moduleCode) throw new Error('缺少模块信息，无法删除默认负责人');
    const list = await getModuleHandlers(moduleCode);
    for (const record of sortModuleHandlers(list)) {
      await deleteModuleHandler(record.id);
    }
  };

  const submit = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        if (editing.source === 'rules') {
          await updateDispatchRule(editing.id, {
            rule_name: values.rule_name,
            order_type: values.order_type,
            sub_module: values.sub_module,
            target_module: values.sub_module,
            customer_id: values.customer_id,
            assignee_user_id: values.primary_user_id,
            fallback_user_id: values.backup1_user_id,
            dispatch_strategy: values.dispatch_strategy,
            priority: values.priority,
            allow_manual_override: values.allow_manual_override,
            trigger_conditions: normalizeCondition(values.trigger_conditions),
            is_active: values.is_active,
          } as Partial<DispatchRuleItem>);
        } else {
          const previousModuleCode = rowModuleCode(editing);
          const nextModuleCode = values.sub_module;
          if (!nextModuleCode) throw new Error('请选择办理模块');
          await syncDefaultHandlers({
            previousModuleCode,
            moduleCode: nextModuleCode,
            primaryUserId: values.primary_user_id,
            backup1UserId: values.backup1_user_id,
            backup2UserId: values.backup2_user_id,
            weight: values.weight ?? 1,
            isActive: values.is_active ?? true,
          });
        }
      } else {
        const moduleCode = values.sub_module;
        if (!moduleCode) throw new Error('请选择办理模块');
        await syncDefaultHandlers({
          moduleCode,
          primaryUserId: values.primary_user_id,
          backup1UserId: values.backup1_user_id,
          backup2UserId: values.backup2_user_id,
          weight: values.weight ?? 1,
          isActive: values.is_active ?? true,
        });
      }
      message.success(editing ? '保存成功' : '新增成功');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      reload();
    } catch (err: any) {
      message.error(err?.message || '操作失败');
    }
  };

  const removeRow = async (row: DispatchConfigItem) => {
    try {
      if (row.source === 'rules') {
        await deleteDispatchRule(row.id);
      } else {
        await removeDefaultHandlers(rowModuleCode(row));
      }
      message.success('已删除');
      reload();
    } catch (err: any) {
      message.error(err?.message || '删除失败');
    }
  };

  const loadConfig = async (type: ConfigType) => {
    try {
      const list = await getDispatchConfig();
      const data = list.filter((row) => type === 'exception' ? row.source === 'rules' : row.source !== 'rules');
      return { data, success: true, total: data.length };
    } catch {
      message.error('加载派发配置失败');
      return { data: [], success: false, total: 0 };
    }
  };

  const operationColumn: ProColumns<DispatchConfigItem> = {
    title: '操作',
    width: 170,
    fixed: 'right',
    render: (_, row) => (
      <Space size="small">
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>编辑</Button>
        {isAdmin && (
          <Popconfirm title="确定删除该配置？" onConfirm={() => removeRow(row)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        )}
      </Space>
    ),
  };

  const defaultColumns: ProColumns<DispatchConfigItem>[] = [
    { title: '模块', width: 220, render: (_, row) => <Text strong>{rowModuleLabel(row)}</Text> },
    { title: '主负责人', width: 170, render: (_, row) => renderPerson(row.primary, rowPrimaryId(row)) },
    { title: '备选 1', width: 170, render: (_, row) => renderPerson(row.backup1) },
    { title: '备选 2', width: 170, render: (_, row) => renderPerson(row.backup2) },
    { title: '启用', width: 100, render: (_, row) => renderActive(row) },
    operationColumn,
  ];

  const getCustomerExceptionModuleCode = (row: ExceptionModuleHandlerItem) => firstValidText(row.moduleCode, row.module_code);
  const getCustomerExceptionCustomerCode = (row: ExceptionModuleHandlerItem) => firstValidText(row.customerCode, row.customer_code);
  const getCustomerExceptionHandlerId = (row: ExceptionModuleHandlerItem) => firstValidText(row.handlerId, row.handler_id);
  const getCustomerExceptionHandlerName = (row: ExceptionModuleHandlerItem) => firstValidText(row.handlerName, row.handler_name);

  const customerExceptionColumns: ProColumns<ExceptionModuleHandlerItem>[] = [
    {
      title: '模块',
      dataIndex: 'moduleCode',
      width: 240,
      render: (_, row) => {
        const moduleCode = getCustomerExceptionModuleCode(row);
        return moduleCode ? <Text strong>{labelOf(SUB_MODULES, moduleCode)}</Text> : <Tag color="warning">未配置模块</Tag>;
      },
    },
    {
      title: '客户代码',
      dataIndex: 'customerCode',
      width: 180,
      render: (_, row) => {
        const customerCode = getCustomerExceptionCustomerCode(row);
        return customerCode ? <Tag color="orange">{customerCode}</Tag> : <Tag color="warning">未配置客户代码</Tag>;
      },
    },
    {
      title: '指定处理人',
      dataIndex: 'handlerId',
      width: 240,
      render: (_, row) => renderPerson(getCustomerExceptionHandlerName(row) || getCustomerExceptionHandlerId(row), getCustomerExceptionHandlerId(row)),
    },
    {
      title: '操作',
      width: 170,
      fixed: 'right',
      render: (_, row) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditCustomerException(row)}>编辑</Button>
          {isAdmin && (
            <Popconfirm
              title="确认删除该客户指定派发规则？"
              description="删除后，该客户在该模块将回到默认主/备负责人派发。"
              onConfirm={() => removeCustomerException(row)}
            >
              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const editingRules = editing?.source === 'rules';
  const showExceptionFields = editingRules;

  const modalTitle = editing
    ? (editingRules ? '编辑历史规则配置' : '编辑默认负责人配置')
    : '新增默认负责人配置';

  return (
    <PageContainer header={{ title: '派发配置' }}>
      <Alert
        style={{ marginBottom: 12 }}
        type="info"
        showIcon
        message="派发顺序说明"
        description="系统导入或提交工单后，会先查看客户指定派发；如果没有命中指定客户，再按默认负责人配置派给对应模块负责人。"
      />
      <Alert
        style={{ marginBottom: 16 }}
        type="warning"
        showIcon
        message="看到“未配置”请及时补充负责人，避免工单无人处理。"
      />

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as ActiveTab)}
        items={[
          {
            key: 'default',
            label: '默认负责人配置',
            children: (
              <ProTable<DispatchConfigItem>
                actionRef={defaultActionRef}
                columns={defaultColumns}
                request={() => loadConfig('default')}
                rowKey={(row) => `default-${row.id}`}
                search={false}
                scroll={{ x: 1000 }}
                headerTitle="未命中例外时使用的负责人"
                toolBarRender={() => [
                  <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => openCreate('default')}>新增默认负责人</Button>,
                ]}
                pagination={{ defaultPageSize: 20 }}
                dateFormatter="string"
              />
            ),
          },
          {
            key: 'customerException',
            label: '客户指定派发',
            children: (
              <>
                <Alert
                  style={{ marginBottom: 12 }}
                  type="info"
                  showIcon
                  message="客户指定派发"
                  description="一个或多个客户在指定模块优先派给同一处理人；未配置则走默认主/备负责人。"
                />
                <ProTable<ExceptionModuleHandlerItem>
                  actionRef={customerExceptionActionRef}
                  columns={customerExceptionColumns}
                  request={loadCustomerExceptionHandlers}
                  rowKey={(row) => `customer-exception-${row.id}`}
                  search={false}
                  scroll={{ x: 850 }}
                  headerTitle="按客户代码优先拦截的派发规则"
                  toolBarRender={() => [
                    <Button key="add" type="primary" icon={<PlusOutlined />} onClick={openCreateCustomerException}>新增客户指定派发</Button>,
                  ]}
                  pagination={{ defaultPageSize: 20 }}
                  dateFormatter="string"
                />
              </>
            ),
          },
        ]}
      />

      <Modal
        title={modalTitle}
        open={open}
        width={720}
        onOk={submit}
        onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
            <Paragraph type="secondary" style={{ marginBottom: 12 }}>
              {showExceptionFields
                ? '历史规则配置会优先匹配指定客户或条件，命中后按这里的负责人派发。'
                : '默认负责人会在没有命中例外配置时生效。'}
            </Paragraph>

          <Form.Item name="order_type" label="业务类型" rules={[{ required: true }]}> 
            <Select options={ORDER_TYPES} onChange={() => form.setFieldValue('sub_module', undefined)} />
          </Form.Item>
          <Form.Item name="sub_module" label="办理模块" rules={[{ required: true }]}> 
            <Select options={subModuleOptions} placeholder="选择办理模块" />
          </Form.Item>

          {showExceptionFields && (
            <>
              <Form.Item name="customer_id" label="适用客户" rules={[{ required: true, message: '请选择客户' }]}> 
                <Select showSearch optionFilterProp="label" options={customers} placeholder="选择具体客户" />
              </Form.Item>
              <Form.Item name="rule_name" label="例外名称（可选，不填会自动生成）"> 
                <Input placeholder="例如：某客户-入职数据录入例外" />
              </Form.Item>
            </>
          )}

          <Form.Item name="primary_user_id" label="主负责人" rules={[{ required: true, message: '请选择主负责人' }]}> 
            <Select showSearch optionFilterProp="label" options={users} placeholder="选择主负责人" />
          </Form.Item>
          <Form.Item name="backup1_user_id" label={showExceptionFields ? '兜底人' : '备选 1'}>
            <Select allowClear showSearch optionFilterProp="label" options={users} placeholder="可选" />
          </Form.Item>
          {!showExceptionFields && (
            <Form.Item name="backup2_user_id" label="备选 2">
              <Select allowClear showSearch optionFilterProp="label" options={users} placeholder="可选" />
            </Form.Item>
          )}

          {showExceptionFields && (
              <Form.Item name="dispatch_strategy" label="派发策略" rules={[{ required: true }]}> 
                <Select options={[
                  { label: '负责人池', value: 'pool' },
                  { label: '固定负责人', value: 'fixed' },
                  { label: '轮流分配', value: 'round_robin' },
                ]} />
            </Form.Item>
          )}

          <Form.Item name="is_active" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Collapse
            ghost
            items={[
              {
                key: 'advanced',
                label: '高级设置',
                children: showExceptionFields ? (
                  <>
                    <Form.Item name="priority" label="匹配顺序（数字越小越先匹配）">
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="allow_manual_override" label="允许人工调整" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item name="trigger_conditions" label="附加条件（可选）">
                      <Input.TextArea rows={3} placeholder="不填表示只按客户和模块匹配；如需复杂条件，可填写条件说明或系统约定格式。" />
                    </Form.Item>
                  </>
                ) : (
                  <Form.Item name="weight" label="分配权重">
                    <InputNumber min={1} style={{ width: '100%' }} />
                  </Form.Item>
                ),
              },
            ]}
          />
        </Form>
      </Modal>

      <Modal
        title={editingCustomerException ? '编辑客户指定派发规则' : '新增客户指定派发规则'}
        open={customerExceptionOpen}
        width={620}
        onOk={submitCustomerException}
        onCancel={() => {
          setCustomerExceptionOpen(false);
          setEditingCustomerException(null);
          customerExceptionForm.resetFields();
        }}
        destroyOnHidden
      >
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          showIcon
          message="客户指定派发"
          description="可一次选择多个客户，系统会为每个客户生成一条“模块 + 客户代码 -> 处理人”的派发规则。未配置则走默认主/备负责人。"
        />
        <Form form={customerExceptionForm} layout="vertical">
          <Form.Item
            name="moduleCode"
            label="模块"
            rules={[{ required: true, message: '请选择模块' }]}
          >
            <Select showSearch optionFilterProp="label" options={CUSTOMER_EXCEPTION_MODULES} placeholder="选择办理模块" />
          </Form.Item>
          <Form.Item
            name="customerCodes"
            label={editingCustomerException ? '客户代码' : '客户代码（可多选）'}
            rules={[{ required: true, message: '请选择或输入客户代码' }]}
            extra="客户代码需与工单中的客户代码保持一致。新增时可一次选择多个客户。"
          >
            <Select
              mode="tags"
              showSearch
              optionFilterProp="label"
              options={customerCodeOptions}
              placeholder="输入或选择客户代码，例如客户001"
              tokenSeparators={[',', '，', ';', '；', ' ']}
              onChange={(value) => {
                const normalize = (item: unknown) => String(item || '').trim().toUpperCase();
                customerExceptionForm.setFieldValue('customerCodes', Array.isArray(value) ? value.map(normalize).filter(Boolean) : [normalize(value)].filter(Boolean));
              }}
            />
          </Form.Item>
          <Form.Item
            name="handlerId"
            label="指定处理人"
            rules={[{ required: true, message: '请选择指定处理人' }]}
          >
            <Select showSearch optionFilterProp="label" options={users} placeholder="选择命中客户指定派发后优先派发的处理人" />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default AdminDispatchConfig;
