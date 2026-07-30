import { useEffect, useMemo, useRef, useState } from 'react';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import {
  Alert,
  App,
  Button,
  Collapse,
  DatePicker,
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
import { getDispatchConfig, saveModuleDispatchConfig } from '@/services/dispatchConfig';
import type { DispatchConfigItem, DispatchConfigPerson } from '@/services/dispatchConfig';
import {
  deleteModuleHandler,
  getModuleHandlers,
} from '@/services/moduleHandlers';
import type { ModuleHandlerItem } from '@/services/moduleHandlers';
import { cancelModuleDelegation, createModuleDelegation, getModuleDelegations } from '@/services/moduleDelegations';
import type { ModuleDelegationItem } from '@/services/moduleDelegations';
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
type ActiveTab = 'default' | 'customerException' | 'delegations';
type Option = { value: string; label: string };

const ORDER_TYPES: Option[] = [
  { label: '入职', value: 'onboarding' },
  { label: '续签', value: 'renewal' },
  { label: '离职', value: 'resignation' },
  { label: '待遇申报', value: 'benefit' },
];

const SUB_MODULES: Array<Option & { orderType: string }> = [
  { label: '增员报岗录入', value: 'data_entry', orderType: 'onboarding' },
  { label: '社保公积金增员', value: 'social_insurance', orderType: 'onboarding' },
  { label: '入职联系', value: 'onboarding_contact', orderType: 'onboarding' },
  { label: '劳动合同新签', value: 'contract', orderType: 'onboarding' },
  { label: '劳动合同新签', value: 'contract_signing', orderType: 'onboarding' },
  { label: '劳动合同续签', value: 'renewal_contract', orderType: 'renewal' },
  { label: '待遇申报', value: 'benefit', orderType: 'benefit' },
  { label: '待遇申报', value: 'benefit_apply', orderType: 'benefit' },
  { label: '离职材料收集', value: 'resignation_contact', orderType: 'resignation' },
  { label: '减员报岗录入', value: 'data_entry_resign', orderType: 'resignation' },
  { label: '社保公积金减员', value: 'resignation_social_insurance', orderType: 'resignation' },
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

const rowHandlerIds = (row: DispatchConfigItem): string[] => {
  const explicit = row.handler_ids ?? row.handlerIds;
  const ids = Array.isArray(explicit)
    ? explicit
    : (row.handlers ?? []).map((person) => personSelectId(person));
  const normalized = ids.map((id) => validText(id)).filter((id): id is string => Boolean(id));
  if (normalized.length > 0) return Array.from(new Set(normalized));
  const primaryId = rowPrimaryId(row);
  return primaryId ? [primaryId] : [];
};

const isRowActive = (row: DispatchConfigItem): boolean => row.is_active ?? row.isActive ?? true;

const rowSlaHours = (row: DispatchConfigItem): number | null => {
  const value = row.sla_hours ?? row.slaHours;
  return value === undefined || value === null ? null : Number(value);
};

const rowSlaReminderBeforeHours = (row: DispatchConfigItem): number | null => {
  const value = row.sla_reminder_before_hours ?? row.slaReminderBeforeHours;
  return value === undefined || value === null ? null : Number(value);
};

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


const AdminDispatchConfig: React.FC = () => {
  const { message, modal } = App.useApp();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const defaultActionRef = useRef<ActionType>();
  const customerExceptionActionRef = useRef<ActionType>();
  const delegationActionRef = useRef<ActionType>();
  const [users, setUsers] = useState<Option[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [customerCodeOptions, setCustomerCodeOptions] = useState<Option[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('default');
  const [configLoadFailed, setConfigLoadFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [defaultFormDirty, setDefaultFormDirty] = useState(false);
  const [editing, setEditing] = useState<DispatchConfigItem | null>(null);
  const [customerExceptionOpen, setCustomerExceptionOpen] = useState(false);
  const [editingCustomerException, setEditingCustomerException] = useState<ExceptionModuleHandlerItem | null>(null);
  const [delegationOpen, setDelegationOpen] = useState(false);
  const [sourceHandlerOptions, setSourceHandlerOptions] = useState<Option[]>([]);
  const [form] = Form.useForm();
  const [customerExceptionForm] = Form.useForm();
  const [delegationForm] = Form.useForm();
  const orderType = Form.useWatch('order_type', form) as string | undefined;
  const watchedModule = Form.useWatch('sub_module', form) as string | undefined;
  const watchedHandlers = Form.useWatch('handler_ids', form) as string[] | undefined;
  const watchedStrategy = Form.useWatch('dispatch_strategy', form) as string | undefined;
  const watchedSla = Form.useWatch('sla_hours', form) as number | undefined;
  const watchedReminder = Form.useWatch('sla_reminder_before_hours', form) as number | undefined;

  const subModuleOptions = useMemo(
    () => orderType ? SUB_MODULES.filter((item) => item.orderType === orderType) : SUB_MODULES,
    [orderType],
  );

  useEffect(() => {
    if (!open || !defaultFormDirty) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [open, defaultFormDirty]);

  useEffect(() => {
    (async () => {
      try {
        const [u, c] = await Promise.all([
          getUsers({ page: 1, pageSize: 50, isActive: true }),
          getCustomers({ page: 1, pageSize: 100 }),
        ]);
        const userList = Array.isArray(u) ? u : u?.list || [];
        const customerList = Array.isArray(c) ? c : c?.list || [];
        setUsers(userList
          .filter((x: UserItem) => x.is_active ?? x.isActive ?? true)
          .map((x: UserItem) => ({
            value: x.id,
            label: `${userDisplay(x)} (${x.username || (x as any).userName || x.id}) · ${(x.roles || []).map((role) => role.role_name).filter(Boolean).join('、') || '未配置角色'}`,
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

  const searchUserOptions = async (keyword: string) => {
    try {
      const result = await getUsers({ page: 1, pageSize: 50, keyword, isActive: true });
      const list = Array.isArray(result) ? result : result?.list || [];
      setUsers(list.map((user: UserItem) => ({
        value: user.id,
        label: `${userDisplay(user)} (${user.username || user.id}) · ${(user.roles || []).map((role) => role.role_name).filter(Boolean).join('、') || '未配置角色'}`,
      })));
    } catch {
      message.error('搜索在职用户失败');
    }
  };

  const reload = () => {
    defaultActionRef.current?.reload();
    customerExceptionActionRef.current?.reload();
    delegationActionRef.current?.reload();
  };

  const userLabel = (userId?: string) => userId ? users.find((item) => item.value === userId)?.label : undefined;
  const remoteUserSelectProps = {
    showSearch: true,
    filterOption: false as const,
    options: users,
    onSearch: (keyword: string) => void searchUserOptions(keyword),
  };

  const loadSourceHandlers = async (moduleCode: string) => {
    const handlers = await getModuleHandlers(moduleCode, true);
    setSourceHandlerOptions(handlers.map((handler) => ({
      value: handler.handler_id,
      label: userLabel(handler.handler_id) || handler.handler_name || handler.handler_id,
    })));
  };

  const openCreateDelegation = () => {
    delegationForm.resetFields();
    delegationForm.setFieldsValue({ moduleCode: 'data_entry' });
    setDelegationOpen(true);
    void loadSourceHandlers('data_entry');
  };

  const submitDelegation = async () => {
    const values = await delegationForm.validateFields();
    const [startsAt, endsAt] = values.timeRange || [];
    try {
      await createModuleDelegation({
        moduleCode: values.moduleCode,
        sourceHandlerId: values.sourceHandlerId,
        delegateHandlerId: values.delegateHandlerId || null,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: values.reason.trim(),
      });
      message.success(values.delegateHandlerId ? '临时代理已生效' : '暂停派单已生效');
      setDelegationOpen(false);
      delegationForm.resetFields();
      delegationActionRef.current?.reload();
    } catch (error: any) {
      message.error(error?._friendlyMsg || error?.message || '保存代理失败');
    }
  };

  const cancelDelegation = async (id: string) => {
    try {
      await cancelModuleDelegation(id);
      message.success('代理安排已取消，原负责人恢复派单');
      delegationActionRef.current?.reload();
    } catch (error: any) {
      message.error(error?._friendlyMsg || error?.message || '取消代理失败');
    }
  };

  const loadDelegations = async () => {
    try {
      const data = await getModuleDelegations(undefined, true);
      return { data, success: true, total: data.length };
    } catch {
      message.error('加载临时代理失败');
      return { data: [], success: false, total: 0 };
    }
  };

  const delegationColumns: ProColumns<ModuleDelegationItem>[] = [
    { title: '模块', dataIndex: 'moduleCode', width: 180, renderText: (value) => labelOf(SUB_MODULES, String(value)) },
    { title: '原负责人', dataIndex: 'sourceHandlerName', width: 180, renderText: (value, row) => value || userLabel(row.sourceHandlerId) || row.sourceHandlerId },
    { title: '代理人', dataIndex: 'delegateHandlerName', width: 180, render: (_, row) => row.delegateHandlerId ? <Tag color="blue">{row.delegateHandlerName || userLabel(row.delegateHandlerId) || row.delegateHandlerId}</Tag> : <Tag color="warning">仅暂停派单</Tag> },
    { title: '开始时间', dataIndex: 'startsAt', width: 170, valueType: 'dateTime' },
    { title: '结束时间', dataIndex: 'endsAt', width: 170, valueType: 'dateTime' },
    { title: '原因', dataIndex: 'reason', ellipsis: true, width: 220 },
    {
      title: '状态',
      width: 110,
      render: (_, row) => {
        const now = Date.now();
        if (!row.isActive) return <Tag>已取消</Tag>;
        if (new Date(row.endsAt).getTime() <= now) return <Tag>已结束</Tag>;
        if (new Date(row.startsAt).getTime() > now) return <Tag color="processing">待生效</Tag>;
        return <Tag color="success">生效中</Tag>;
      },
    },
    {
      title: '操作',
      width: 110,
      fixed: 'right',
      render: (_, row) => row.isActive && new Date(row.endsAt).getTime() > Date.now() ? (
        <Popconfirm title="确定取消该代理安排？" onConfirm={() => cancelDelegation(row.id)}>
          <Button size="small" danger>取消</Button>
        </Popconfirm>
      ) : null,
    },
  ];

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

  const renderHandlers = (row: DispatchConfigItem) => {
    const handlerIds = rowHandlerIds(row);
    if (handlerIds.length === 0) {
      return (
        <Tooltip title={EMPTY_PERSON_TIP}>
          <Tag color="warning">未配置</Tag>
        </Tooltip>
      );
    }
    return (
      <Space size={[0, 4]} wrap>
        {handlerIds.map((handlerId) => {
          const person = (row.handlers ?? []).find((item) => personSelectId(item) === handlerId);
          const name = userLabel(handlerId) || personName(person) || handlerId;
          const active = person?.isActive !== false;
          const roleText = person?.roleCodes?.length ? person.roleCodes.join('、') : '未返回角色信息';
          return (
            <Tooltip key={handlerId} title={`账号：${active ? '启用' : '停用'}；角色：${roleText}`}>
              <Tag color={active ? 'blue' : 'error'}>{name} · 待办 {person?.openOrderCount ?? 0}</Tag>
            </Tooltip>
          );
        })}
      </Space>
    );
  };

  const renderActive = (row: DispatchConfigItem) => (
    isRowActive(row) ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>
  );

  const openCreate = (_type: ConfigType = 'default') => {
    setEditing(null);
    setDefaultFormDirty(false);
    form.resetFields();
    form.setFieldsValue({
      type: 'default',
      order_type: 'onboarding',
      sub_module: 'data_entry',
      handler_ids: [],
      priority: 10,
      dispatch_strategy: 'round_robin',
      allow_manual_override: true,
      sla_hours: 24,
      sla_reminder_before_hours: 4,
      is_active: true,
    });
    setOpen(true);
  };

  const openEdit = (row: DispatchConfigItem) => {
    setEditing(row);
    setDefaultFormDirty(false);
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
        handler_ids: rowHandlerIds(row),
        dispatch_strategy: row.dispatch_strategy || row.dispatchStrategy || 'round_robin',
        change_reason: '',
        sla_hours: rowSlaHours(row) ?? 24,
        sla_reminder_before_hours: rowSlaReminderBeforeHours(row) ?? 4,
        is_active: isRowActive(row),
      });
    }
    setOpen(true);
  };


  const removeDefaultHandlers = async (moduleCode?: string) => {
    if (!moduleCode) throw new Error('缺少模块信息，无法删除默认负责人');
    const list = await getModuleHandlers(moduleCode);
    for (const record of sortModuleHandlers(list)) {
      await deleteModuleHandler(record.id);
    }
  };

  const closeDefaultEditor = () => {
    const close = () => {
      setDefaultFormDirty(false);
      setOpen(false);
      setEditing(null);
      form.resetFields();
    };
    if (!defaultFormDirty) {
      close();
      return;
    }
    modal.confirm({
      title: '放弃未保存的派发配置修改？',
      content: '关闭后本次填写内容不会保存。',
      okText: '放弃修改',
      cancelText: '继续编辑',
      okButtonProps: { danger: true },
      onOk: close,
    });
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
          if (previousModuleCode && previousModuleCode !== nextModuleCode) {
            throw new Error('编辑配置时不能更换办理模块，请新建对应模块配置');
          }
          const handlerIds = Array.isArray(values.handler_ids) ? values.handler_ids : [];
          if (handlerIds.length > 1 && values.dispatch_strategy === 'fixed') {
            throw new Error('多人共同负责时请选择轮流分配或按待办量分配');
          }
          await saveModuleDispatchConfig(nextModuleCode, {
            handlerIds,
            dispatchStrategy: values.dispatch_strategy,
            slaHours: values.sla_hours ?? null,
            slaReminderBeforeHours: values.sla_reminder_before_hours ?? null,
            isActive: values.is_active ?? true,
            changeReason: values.change_reason,
          });
        }
      } else {
        const moduleCode = values.sub_module;
        if (!moduleCode) throw new Error('请选择办理模块');
        const handlerIds = Array.isArray(values.handler_ids) ? values.handler_ids : [];
        if (handlerIds.length > 1 && values.dispatch_strategy === 'fixed') {
          throw new Error('多人共同负责时请选择轮流分配或按待办量分配');
        }
        await saveModuleDispatchConfig(moduleCode, {
          handlerIds,
          dispatchStrategy: values.dispatch_strategy,
          slaHours: values.sla_hours ?? null,
          slaReminderBeforeHours: values.sla_reminder_before_hours ?? null,
          isActive: values.is_active ?? true,
          changeReason: values.change_reason,
        });
      }
      message.success(editing ? '保存成功' : '新增成功');
      setDefaultFormDirty(false);
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
      setConfigLoadFailed(false);
      const data = list.filter((row) => type === 'exception' ? row.source === 'rules' : row.source !== 'rules');
      return { data, success: true, total: data.length };
    } catch {
      setConfigLoadFailed(true);
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
    { title: '共同负责人', width: 360, render: (_, row) => renderHandlers(row) },
    {
      title: '派发策略',
      width: 140,
      render: (_, row) => {
        const strategy = row.dispatch_strategy || row.dispatchStrategy;
        const label = strategy === 'load_balance' ? '按待办量' : strategy === 'round_robin' ? '轮流分配' : strategy === 'fixed' ? '固定首位' : '团队认领';
        return <Tag color={strategy === 'load_balance' ? 'cyan' : 'geekblue'}>{label}</Tag>;
      },
    },
    { title: '启用', width: 100, render: (_, row) => renderActive(row) },
    {
      title: '办理时限',
      width: 150,
      render: (_, row) => {
        const sla = rowSlaHours(row);
        const reminder = rowSlaReminderBeforeHours(row);
        return sla ? <Tag color="purple">{sla}小时{reminder ? ` / 提前${reminder}小时提醒` : ''}</Tag> : <Tag color="warning">未配置</Tag>;
      },
    },
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
        description="系统导入或提交工单后，会先查看客户指定派发；如果没有命中指定客户，再按默认共同负责人和所选策略自动分配。"
      />
      <Alert
        style={{ marginBottom: 16 }}
        type="warning"
        showIcon
        message="看到“未配置”请及时补充负责人，避免工单无人处理。"
      />

      {configLoadFailed && (
        <Alert
          style={{ marginBottom: 16 }}
          type="error"
          showIcon
          message="派发配置加载失败，不代表当前没有配置"
          action={<Button size="small" onClick={() => defaultActionRef.current?.reload()}>重试</Button>}
        />
      )}

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
                scroll={{ x: 1150 }}
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
                  description="一个或多个客户在指定模块优先派给同一处理人；未配置则走默认固定负责人 + AB角。"
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
          {
            key: 'delegations',
            label: '临时代理 / 休假',
            children: (
              <>
                <Alert
                  style={{ marginBottom: 12 }}
                  type="info"
                  showIcon
                  message="代理按时间自动生效和恢复"
                  description="可指定代理人，也可只暂停原负责人派单；不会修改默认负责人配置。"
                />
                <ProTable<ModuleDelegationItem>
                  actionRef={delegationActionRef}
                  columns={delegationColumns}
                  request={loadDelegations}
                  rowKey="id"
                  search={false}
                  scroll={{ x: 1250 }}
                  headerTitle="临时代理和暂停派单安排"
                  toolBarRender={() => [
                    <Button key="add" type="primary" icon={<PlusOutlined />} onClick={openCreateDelegation}>新增代理安排</Button>,
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
        title="新增临时代理 / 暂停派单"
        open={delegationOpen}
        width={640}
        okText="保存安排"
        cancelText="取消"
        onOk={submitDelegation}
        onCancel={() => { setDelegationOpen(false); delegationForm.resetFields(); }}
        destroyOnHidden
      >
        <Form form={delegationForm} layout="vertical">
          <Form.Item name="moduleCode" label="办理模块" rules={[{ required: true, message: '请选择模块' }]}>
            <Select
              options={SUB_MODULES}
              showSearch
              optionFilterProp="label"
              onChange={(moduleCode) => {
                delegationForm.setFieldValue('sourceHandlerId', undefined);
                void loadSourceHandlers(moduleCode);
              }}
            />
          </Form.Item>
          <Form.Item name="sourceHandlerId" label="原负责人" rules={[{ required: true, message: '请选择原负责人' }]}>
            <Select options={sourceHandlerOptions} showSearch optionFilterProp="label" placeholder="仅显示该模块当前负责人" />
          </Form.Item>
          <Form.Item name="delegateHandlerId" label="代理人（可选）" extra="不选择代理人时，仅暂停原负责人派单。">
            <Select allowClear {...remoteUserSelectProps} placeholder="搜索临时代理人" />
          </Form.Item>
          <Form.Item name="timeRange" label="代理时间" rules={[{ required: true, message: '请选择开始和结束时间' }]}>
            <DatePicker.RangePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="reason"
            label="原因"
            rules={[
              { required: true, message: '请填写原因' },
              { validator: (_, value) => String(value || '').trim() ? Promise.resolve() : Promise.reject(new Error('原因不能只填空格')) },
            ]}
          >
            <Input.TextArea rows={3} maxLength={512} showCount placeholder="例如：年假，期间由李四代理" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={modalTitle}
        open={open}
        width={720}
        onOk={submit}
        onCancel={closeDefaultEditor}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onValuesChange={() => setDefaultFormDirty(true)}>
            <Paragraph type="secondary" style={{ marginBottom: 12 }}>
              {showExceptionFields
                ? '历史规则配置会优先匹配指定客户或条件，命中后按这里的负责人派发。'
                : '默认负责人会在没有命中例外配置时生效。'}
            </Paragraph>
          {!showExceptionFields && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="保存前变更摘要"
              description={[
                `模块：${labelOf(SUB_MODULES, watchedModule)}`,
                `负责人：${(watchedHandlers || []).map((id) => userLabel(id) || id).join('、') || '未选择'}`,
                `策略：${watchedStrategy || '未选择'}`,
                `SLA：${watchedSla ?? '-'} 小时，提前 ${watchedReminder ?? 0} 小时提醒`,
              ].join('；')}
            />
          )}

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
                <Input placeholder="例如：某客户-入职增员报岗录入例外" />
              </Form.Item>
            </>
          )}

          {showExceptionFields ? (
            <>
              <Form.Item name="primary_user_id" label="主负责人" rules={[{ required: true, message: '请选择主负责人' }]}>
                <Select {...remoteUserSelectProps} placeholder="搜索主负责人" />
              </Form.Item>
              <Form.Item name="backup1_user_id" label="AB角/兜底人">
                <Select allowClear {...remoteUserSelectProps} placeholder="搜索 AB 角/兜底人" />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item name="handler_ids" label="共同负责人" rules={[{ required: true, message: '请选择至少一名共同负责人' }]}>
                <Select mode="multiple" {...remoteUserSelectProps} placeholder="输入姓名、账号或角色搜索共同负责人" maxTagCount="responsive" />
              </Form.Item>
              <Form.Item name="dispatch_strategy" label="派发策略" rules={[{ required: true, message: '请选择派发策略' }]}>
                <Select options={[
                  { label: '轮流分配', value: 'round_robin' },
                  { label: '按当前待办量分配', value: 'load_balance' },
                  { label: '固定派给首位（仅限单人）', value: 'fixed' },
                  { label: '团队认领（不自动派人）', value: 'team_claim' },
                ]} />
              </Form.Item>
            </>
          )}

          {!showExceptionFields && (
            <>
              <Form.Item name="sla_hours" label="办理时限（小时）" rules={[{ required: true, message: '请填写办理时限' }]}> 
                <InputNumber min={1} precision={0} style={{ width: '100%' }} placeholder="例如：24" />
              </Form.Item>
              <Form.Item name="sla_reminder_before_hours" label="提前提醒（小时）" tooltip="距离到期还剩多少小时进入“即将超时”分类">
                <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="例如：4" />
              </Form.Item>
            </>
          )}

          {showExceptionFields && (
              <Form.Item name="dispatch_strategy" label="派发策略" rules={[{ required: true }]}> 
                <Select options={[
                  { label: '固定负责人 + AB角', value: 'pool' },
                  { label: '仅固定负责人', value: 'fixed' },
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
                  <Form.Item name="change_reason" label="变更原因">
                    <Input.TextArea rows={2} maxLength={512} placeholder="例如：人员交接、休假代理或负载调整" />
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
          description="可一次选择多个客户，系统会为每个客户生成一条“模块 + 客户代码 -> 处理人”的派发规则。未配置则走默认固定负责人 + AB角。"
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
            <Select {...remoteUserSelectProps} placeholder="搜索客户指定派发处理人" />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default AdminDispatchConfig;
