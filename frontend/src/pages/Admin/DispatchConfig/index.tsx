import { useEffect, useMemo, useRef, useState } from 'react';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Alert, App, Button, Form, InputNumber, Modal, Select, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { getDispatchConfig } from '@/services/dispatchConfig';
import type { DispatchConfigItem, DispatchConfigPerson } from '@/services/dispatchConfig';
import { createModuleHandler, deleteModuleHandler, getModuleHandlers } from '@/services/moduleHandlers';
import { updateModuleConfig } from '@/services/moduleConfigs';
import { getUsers } from '@/services/users';
import type { UserItem } from '@/services/users';
import { useAuth } from '@/hooks/useAuth';

const { Text, Paragraph } = Typography;

type Option = { value: string; label: string };
type DispatchStrategy = 'pool' | 'fixed' | 'round_robin' | 'load_balance';

type DispatchFormValues = {
  handler_ids: string[];
  dispatch_strategy: DispatchStrategy;
  sla_hours: number;
  is_active: boolean;
};

const DISPATCH_STRATEGY_OPTIONS: Array<{ label: string; value: DispatchStrategy; desc: string }> = [
  { label: '接单池', value: 'pool', desc: '多人时进入公共待接单池，团队成员自行接单；若仅 1 人则自动直派。' },
  { label: '固定负责人', value: 'fixed', desc: '优先派给权重最高的默认负责人。' },
  { label: '轮流分配', value: 'round_robin', desc: '按人员稳定顺序分配，适合多人轮值。' },
  { label: '负载均衡', value: 'load_balance', desc: '优先派给当前待办较少的人员。' },
];

const MODULE_GROUP_LABELS: Record<string, string> = {
  onboarding_management: '入职管理',
  employment_management: '在职管理',
  resignation_management: '离职管理',
};

const STRATEGY_COLOR: Record<string, string> = {
  pool: 'orange',
  fixed: 'blue',
  round_robin: 'purple',
  load_balance: 'green',
};

const EMPTY_PERSON_TIP = '未配置处理团队；相关模块工单会进入未分配状态，请及时配置。';

const validText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return undefined;
};

const userDisplay = (u: UserItem) => u.real_name || u.realName || u.username || u.id;
const optionLabel = (options: Option[], value?: string) => options.find((item) => item.value === value)?.label || value || '-';

const personUserId = (person?: DispatchConfigPerson | string | null): string | undefined => {
  if (!person || typeof person === 'string') return undefined;
  return validText(person.user_id, person.userId, person.id);
};

const personName = (person?: DispatchConfigPerson | string | null): string | undefined => {
  if (!person) return undefined;
  if (typeof person === 'string') return person;
  return validText(person.displayName, person.display_name, person.realName, person.real_name, person.name, person.username, personUserId(person));
};

const rowModuleCode = (row: DispatchConfigItem) => validText(row.module_code, row.moduleCode, row.sub_module, row.subModule, row.target_module, row.targetModule) || '';
const rowModuleName = (row: DispatchConfigItem) => validText(row.module, (row as any).moduleName, (row as any).module_name, rowModuleCode(row)) || '-';
const rowParentModule = (row: DispatchConfigItem) => validText(row.parent_module_code, row.parentModuleCode) || 'other';
const rowStrategy = (row: DispatchConfigItem): DispatchStrategy => (validText(row.dispatch_strategy, row.dispatchStrategy) as DispatchStrategy) || 'pool';
const rowSlaHours = (row: DispatchConfigItem) => Number(row.sla_hours ?? row.slaHours ?? 72);
const rowActive = (row: DispatchConfigItem) => row.is_active ?? row.isActive ?? true;

const rowHandlerIds = (row: DispatchConfigItem): string[] => {
  const explicit = row.handler_ids ?? row.handlerIds;
  if (Array.isArray(explicit)) return Array.from(new Set(explicit.map(String).filter(Boolean)));
  const fromPeople = [row.primary, row.backup1, row.backup2]
    .map((person) => personUserId(person) || (typeof person === 'string' ? person : undefined))
    .filter((id): id is string => Boolean(id));
  return Array.from(new Set(fromPeople));
};

const rowHandlers = (row: DispatchConfigItem): Array<{ id: string; name: string }> => {
  const explicit = Array.isArray(row.handlers) ? row.handlers : [];
  if (explicit.length > 0) {
    return explicit
      .map((person) => {
        const id = personUserId(person);
        return id ? { id, name: personName(person) || id } : null;
      })
      .filter((item): item is { id: string; name: string } => Boolean(item));
  }
  return [row.primary, row.backup1, row.backup2]
    .map((person) => {
      const id = personUserId(person) || (typeof person === 'string' ? person : undefined);
      return id ? { id, name: personName(person) || id } : null;
    })
    .filter((item): item is { id: string; name: string } => Boolean(item));
};

const AdminDispatchConfig: React.FC = () => {
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const actionRef = useRef<ActionType>();
  const [users, setUsers] = useState<Option[]>([]);
  const [editing, setEditing] = useState<DispatchConfigItem | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<DispatchFormValues>();

  useEffect(() => {
    (async () => {
      try {
        const result = await getUsers({ page: 1, pageSize: 100 });
        const list = Array.isArray(result) ? result : result?.list || [];
        setUsers(list
          .filter((user: UserItem) => user.is_active ?? user.isActive ?? true)
          .map((user: UserItem) => ({
            value: user.id,
            label: `${userDisplay(user)} (${user.username || user.id})`,
          })));
      } catch {
        setUsers([]);
      }
    })();
  }, []);

  const strategyOptions = useMemo(() => DISPATCH_STRATEGY_OPTIONS.map((item) => ({ label: item.label, value: item.value })), []);

  const reload = () => actionRef.current?.reload();

  const openEdit = (row: DispatchConfigItem) => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue({
      handler_ids: rowHandlerIds(row),
      dispatch_strategy: rowStrategy(row),
      sla_hours: rowSlaHours(row),
      is_active: rowActive(row),
    });
    setOpen(true);
  };

  const syncHandlers = async (moduleCode: string, handlerIds: string[]) => {
    const normalized = Array.from(new Set(handlerIds.map(String).filter(Boolean)));
    const existing = await getModuleHandlers(moduleCode);

    await Promise.all(existing.map((item) => deleteModuleHandler(item.id)));
    await Promise.all(normalized.map((handlerId, index) => createModuleHandler({
      module_code: moduleCode,
      handler_id: handlerId,
      weight: Math.max(1, normalized.length - index),
      is_backup: false,
      is_active: true,
    })));
  };

  const submit = async () => {
    if (!editing) return;
    const moduleCode = rowModuleCode(editing);
    if (!moduleCode) {
      message.error('缺少模块编码，无法保存');
      return;
    }
    const values = await form.validateFields();
    setSaving(true);
    try {
      await updateModuleConfig(editing.id, {
        dispatchStrategy: values.dispatch_strategy,
        slaHours: values.sla_hours,
        isActive: values.is_active,
      } as any);
      await syncHandlers(moduleCode, values.handler_ids || []);
      message.success('派发配置已保存');
      setOpen(false);
      setEditing(null);
      reload();
    } catch (err: any) {
      message.error(err?.message || '保存派发配置失败');
    } finally {
      setSaving(false);
    }
  };

  const loadConfig = async () => {
    try {
      const list = await getDispatchConfig();
      const rows = list
        .filter((row) => row.source !== 'rules')
        .sort((a, b) => rowParentModule(a).localeCompare(rowParentModule(b)) || rowModuleCode(a).localeCompare(rowModuleCode(b)));
      return { data: rows, success: true, total: rows.length };
    } catch {
      message.error('加载派发配置失败');
      return { data: [], success: false, total: 0 };
    }
  };

  const renderHandlers = (row: DispatchConfigItem) => {
    const handlers = rowHandlers(row);
    if (handlers.length === 0) {
      return (
        <Tooltip title={EMPTY_PERSON_TIP}>
          <Tag color="warning">未配置</Tag>
        </Tooltip>
      );
    }
    return (
      <Space size={[4, 4]} wrap>
        {handlers.map((handler, index) => (
          <Tag key={`${handler.id}-${index}`} color={index === 0 ? 'blue' : 'geekblue'}>
            {optionLabel(users, handler.id) || handler.name}
          </Tag>
        ))}
      </Space>
    );
  };

  const columns: ProColumns<DispatchConfigItem>[] = [
    {
      title: '业务模块',
      width: 140,
      render: (_, row) => <Tag color="default">{MODULE_GROUP_LABELS[rowParentModule(row)] || rowParentModule(row)}</Tag>,
    },
    {
      title: '办理模块',
      width: 180,
      render: (_, row) => <Text strong>{rowModuleName(row)}</Text>,
    },
    {
      title: '默认处理团队',
      width: 360,
      render: (_, row) => renderHandlers(row),
    },
    {
      title: '派发方式',
      width: 150,
      render: (_, row) => {
        const strategy = rowStrategy(row);
        const option = DISPATCH_STRATEGY_OPTIONS.find((item) => item.value === strategy);
        return <Tag color={STRATEGY_COLOR[strategy] || 'default'}>{option?.label || strategy}</Tag>;
      },
    },
    {
      title: 'SLA',
      width: 100,
      render: (_, row) => `${rowSlaHours(row)} 小时`,
    },
    {
      title: '状态',
      width: 90,
      render: (_, row) => rowActive(row) ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>,
    },
    {
      title: '操作',
      width: 110,
      fixed: 'right',
      render: (_, row) => (
        <Button size="small" icon={<EditOutlined />} disabled={!isAdmin} onClick={() => openEdit(row)}>
          编辑
        </Button>
      ),
    },
  ];

  const currentStrategy = Form.useWatch('dispatch_strategy', form);
  const currentStrategyDesc = DISPATCH_STRATEGY_OPTIONS.find((item) => item.value === currentStrategy)?.desc;

  return (
    <PageContainer header={{ title: '派发配置' }}>
      <Alert
        style={{ marginBottom: 12 }}
        type="info"
        showIcon
        message="按工单整体模块派发"
        description="提交工单后，系统按工单类型拆分到对应办理模块；每个办理模块只维护默认处理团队、派发方式和 SLA。处理团队只有 1 人时直接派给该人；多人且选择接单池时，工单进入我的待办，由团队成员自行接单。"
      />
      <ProTable<DispatchConfigItem>
        actionRef={actionRef}
        columns={columns}
        request={loadConfig}
        rowKey={(row) => row.id}
        search={false}
        scroll={{ x: 1130 }}
        headerTitle="模块默认派发配置"
        toolBarRender={false}
        pagination={{ defaultPageSize: 20 }}
        dateFormatter="string"
      />

      <Modal
        title={editing ? `编辑派发配置：${rowModuleName(editing)}` : '编辑派发配置'}
        open={open}
        width={720}
        onOk={submit}
        onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Paragraph type="secondary">
            当前配置作用于整个办理模块。选择多个处理人后，如派发方式为“接单池”，新工单会先进入公共待接单池；选择固定/轮流/负载均衡时会自动派给一个处理人。
          </Paragraph>
          <Form.Item
            name="handler_ids"
            label="默认处理团队"
            rules={[{ required: true, message: '请选择至少一个处理人' }]}
          >
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              options={users}
              placeholder="请选择一个或多个处理人"
            />
          </Form.Item>
          <Form.Item name="dispatch_strategy" label="派发方式" rules={[{ required: true }]}> 
            <Select options={strategyOptions} />
          </Form.Item>
          {currentStrategyDesc && <Alert style={{ marginBottom: 16 }} type="info" showIcon message={currentStrategyDesc} />}
          <Form.Item name="sla_hours" label="SLA 时限（小时）" rules={[{ required: true, message: '请输入 SLA 时限' }]}> 
            <InputNumber min={1} max={24 * 30} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="is_active" label="启用该办理模块" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default AdminDispatchConfig;
