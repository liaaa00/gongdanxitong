import { useEffect, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Table, Button, Space, Modal, Form, Input, Switch, Select, Popconfirm, App, Tag, Checkbox, Divider, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { getExportTemplates, createExportTemplate, updateExportTemplate, deleteExportTemplate } from '@/services/exportTemplates';
import type { ExportTemplateItem } from '@/services/exportTemplates';

const MODULE_GROUPS = [
  {
    label: '入职管理',
    options: [
      { label: '增员报岗录入', value: 'data_entry' },
      { label: '社保公积金增员', value: 'social_insurance' },
      { label: '入职联系', value: 'onboarding_contact' },
      { label: '劳动合同新签', value: 'contract' },
    ],
  },
  {
    label: '在职管理（后台保留，第一阶段界面隐藏）',
    options: [
      { label: '劳动合同续签', value: 'renewal_contract' },
      { label: '待遇申报', value: 'benefit' },
    ],
  },
  {
    label: '离职管理',
    options: [
      { label: '离职材料收集', value: 'resignation_contact' },
      { label: '减员报岗录入', value: 'data_entry_resign' },
      { label: '社保公积金减员', value: 'resignation_social_insurance' },
    ],
  },
];

const MODULES = MODULE_GROUPS.flatMap((g) => g.options);

// 所有可选字段列表（按分组）
const FIELD_OPTIONS: Array<{ group: string; fields: Array<{ code: string; name: string }> }> = [
  {
    group: '基础信息',
    fields: [
      { code: 'customer_name', name: '客户名称' },
      { code: 'customer_code', name: '客户代码' },
      { code: 'outsource_type', name: '外包类型' },
      { code: 'position', name: '岗位' },
      { code: 'employee_name', name: '员工姓名' },
      { code: 'id_card_no', name: '身份证号码' },
      { code: 'gender', name: '性别' },
      { code: 'birth_date', name: '出生日期' },
      { code: 'age', name: '年龄' },
      { code: 'household_type', name: '户籍性质' },
      { code: 'ethnicity', name: '民族' },
      { code: 'mobile', name: '移动电话' },
      { code: 'email', name: '电子邮件' },
      { code: 'current_address', name: '现住地址' },
      { code: 'household_address', name: '户籍地址' },
      { code: 'postal_code', name: '邮编' },
      { code: 'business_mode', name: '业务模式' },
      { code: 'employee_type', name: '人员类型' },
    ],
  },
  {
    group: '合同信息',
    fields: [
      { code: 'contract_term_type', name: '合同期限形式' },
      { code: 'contract_term', name: '合同期限' },
      { code: 'contract_start_date', name: '合同开始日期' },
      { code: 'contract_end_date', name: '合同终止日期' },
      { code: 'probation_start_date', name: '试用期开始日期' },
      { code: 'probation_months', name: '试用期(月)' },
      { code: 'probation_end_date', name: '试用期结束日期' },
      { code: 'work_city', name: '工作城市' },
      { code: 'work_hour_system', name: '工时制' },
      { code: 'work_cycle', name: '工作制周期' },
      { code: 'need_company_contract', name: '是否企服发起劳动合同' },
      { code: 'contract_subject', name: '劳动合同主体' },
      { code: 'contract_template', name: '劳动合同模板' },
      { code: 'need_contract_urge', name: '劳动合同签署是否需要催办' },
      { code: 'contract_feedback', name: '劳动合同新签反馈' },
    ],
  },
  {
    group: '薪资与发薪',
    fields: [
      { code: 'salary_form', name: '工资形式' },
      { code: 'base_salary', name: '基本工资' },
      { code: 'other_salary', name: '其他工资' },
      { code: 'probation_salary', name: '试用期工资' },
      { code: 'payroll_cycle', name: '发薪周期' },
      { code: 'payroll_date', name: '发薪日期' },
      { code: 'need_company_payroll', name: '是否企服发薪' },
      { code: 'payroll_location', name: '发薪地' },
    ],
  },
  {
    group: '社保公积金',
    fields: [
      { code: 'social_location', name: '参保地' },
      { code: 'start_month', name: '起始月' },
      { code: 'social_base', name: '社保基数' },
      { code: 'fund_base', name: '公积金基数' },
      { code: 'fund_ratio', name: '公积金比例' },
      { code: 'social_urge', name: '社保公积金未办是否需要催办' },
    ],
  },
  {
    group: '银行与备注',
    fields: [
      { code: 'bank_name', name: '开户银行信息' },
      { code: 'bank_account', name: '银行借记卡账号' },
      { code: 'remark', name: '备注' },
      { code: 'special_remark', name: '特殊备注' },
    ],
  },
  {
    group: '后道反馈',
    fields: [
      { code: 'need_onboarding_contact', name: '入职材料是否需要集约收集' },
      { code: 'onboarding_feedback', name: '入职联系反馈' },
      { code: 'data_entry_feedback', name: '增员报岗录入反馈' },
    ],
  },
];

const ALL_FIELDS = FIELD_OPTIONS.flatMap((g) => g.fields);

interface SelectedField {
  field_code: string;
  alias: string;
  order: number;
}

const AdminExportTemplates: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<ExportTemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExportTemplateItem | null>(null);
  const [form] = Form.useForm();
  const [selectedFields, setSelectedFields] = useState<SelectedField[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getExportTemplates();
      setData(Array.isArray(res) ? res : (res as any)?.list ?? (res as any)?.items ?? []);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openModal = (record?: ExportTemplateItem) => {
    setEditing(record || null);
    if (record) {
      form.setFieldsValue({ template_name: record.template_name, module_code: record.module_code, is_shared: record.is_shared });
      setSelectedFields(
        (record.field_list || []).map((f, i) => ({ field_code: f.field_code, alias: f.alias || ALL_FIELDS.find((af) => af.code === f.field_code)?.name || f.field_code, order: f.order ?? i + 1 }))
      );
    } else {
      form.resetFields();
      setSelectedFields([]);
    }
    setOpen(true);
  };

  const toggleField = (code: string, name: string) => {
    setSelectedFields((prev) => {
      const exists = prev.find((f) => f.field_code === code);
      if (exists) return prev.filter((f) => f.field_code !== code);
      return [...prev, { field_code: code, alias: name, order: prev.length + 1 }];
    });
  };

  const moveField = (index: number, dir: -1 | 1) => {
    setSelectedFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((f, i) => ({ ...f, order: i + 1 }));
    });
  };

  const updateAlias = (index: number, alias: string) => {
    setSelectedFields((prev) => prev.map((f, i) => i === index ? { ...f, alias } : f));
  };

  const onSave = async () => {
    const v = await form.validateFields();
    if (selectedFields.length === 0) { message.warning('请至少选择一个导出字段'); return; }
    const fieldList = selectedFields.map((f, i) => ({ field_code: f.field_code, alias: f.alias, order: i + 1 }));
    const payload: Partial<ExportTemplateItem> = {
      template_name: v.template_name, module_code: v.module_code, field_list: fieldList, is_shared: v.is_shared,
    };
    try {
      if (editing) await updateExportTemplate(editing.id, payload);
      else await createExportTemplate(payload);
      message.success('保存成功');
      setOpen(false); setEditing(null); form.resetFields(); setSelectedFields([]); load();
    } catch { message.error('保存失败'); }
  };

  const onDel = async (id: string) => {
    try { await deleteExportTemplate(id); message.success('已删除'); load(); }
    catch { message.error('删除失败'); }
  };

  return (
    <PageContainer header={{ title: '导出模板配置' }} extra={[
      <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>新建模板</Button>,
    ]}>
      <Table rowKey="id" loading={loading} dataSource={data}
        columns={[
          { title: '模板名', dataIndex: 'template_name' },
          { title: '适用模块', dataIndex: 'module_code', width: 150, render: (v) => MODULES.find((m) => m.value === v)?.label || v },
          { title: '字段数', dataIndex: 'field_list', width: 100, render: (v: unknown[]) => v?.length || 0 },
          { title: '创建人', dataIndex: 'created_by', width: 120 },
          { title: '共享', dataIndex: 'is_shared', width: 90, render: (v) => v ? <Tag color="blue">共享</Tag> : <Tag>私有</Tag> },
          { title: '创建时间', dataIndex: 'created_at', width: 180 },
          {
            title: '操作', width: 160, render: (_, r) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openModal(r)}>编辑</Button>
                <Popconfirm title="确定删除？" onConfirm={() => onDel(r.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal title={editing ? '编辑模板' : '新建模板'} open={open} width={860}
        onOk={onSave} onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); setSelectedFields([]); }} destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ is_shared: false, module_code: 'contract' }}>
          <Space style={{ width: '100%' }} align="start" size={24}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Form.Item name="template_name" label="模板名" rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="module_code" label="适用模块" rules={[{ required: true }]}>
                <Select options={MODULE_GROUPS as any} placeholder="选择模块" />
              </Form.Item>
              <Form.Item name="is_shared" label="团队共享" valuePropName="checked"><Switch /></Form.Item>
            </div>
          </Space>
        </Form>

        <Divider orientation="left">选择导出字段（勾选后可调整顺序和别名）</Divider>
        <div style={{ display: 'flex', gap: 24 }}>
          {/* 左侧：字段勾选区 */}
          <div style={{ flex: 1, maxHeight: 400, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: '8px 12px' }}>
            {FIELD_OPTIONS.map((group) => (
              <div key={group.group}>
                <Typography.Text strong style={{ fontSize: 12, color: '#666' }}>{group.group}</Typography.Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 0', marginBottom: 8, marginTop: 4 }}>
                  {group.fields.map((f) => (
                    <div key={f.code} style={{ width: '50%' }}>
                      <Checkbox
                        checked={selectedFields.some((sf) => sf.field_code === f.code)}
                        onChange={() => toggleField(f.code, f.name)}
                      >
                        <span style={{ fontSize: 12 }}>{f.name}</span>
                      </Checkbox>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 右侧：已选字段排序和别名编辑 */}
          <div style={{ width: 320, maxHeight: 400, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: '8px 12px' }}>
            <Typography.Text strong style={{ fontSize: 12, color: '#666' }}>
              已选字段（{selectedFields.length}个，可拖拽排序）
            </Typography.Text>
            {selectedFields.length === 0 && (
              <div style={{ color: '#bbb', fontSize: 12, marginTop: 8 }}>请在左侧勾选字段</div>
            )}
            {selectedFields.map((f, index) => {
              const fieldMeta = ALL_FIELDS.find((af) => af.code === f.field_code);
              return (
                <div key={f.field_code} style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, padding: '4px 6px', background: '#fafafa', borderRadius: 4, border: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: 11, color: '#999', width: 18, textAlign: 'center' }}>{index + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>{fieldMeta?.name || f.field_code}</div>
                    <Input
                      size="small"
                      value={f.alias}
                      onChange={(e) => updateAlias(index, e.target.value)}
                      placeholder="导出列名（别名）"
                      style={{ fontSize: 11 }}
                    />
                  </div>
                  <Space size={2} direction="vertical">
                    <Button size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => moveField(index, -1)} style={{ padding: '0 4px', height: 20 }} />
                    <Button size="small" icon={<ArrowDownOutlined />} disabled={index === selectedFields.length - 1} onClick={() => moveField(index, 1)} style={{ padding: '0 4px', height: 20 }} />
                  </Space>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};

export default AdminExportTemplates;
