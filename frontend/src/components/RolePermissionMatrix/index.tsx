import { useState } from 'react';
import { Table, Select, Tabs, Card, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

export interface RoleItem {
  id: string;
  code: string;
  name: string;
}

export interface FieldItem {
  field_code: string;
  field_name: string;
}

export interface ScenarioItem {
  code: string;
  name: string;
}

export interface PermissionCell {
  roleId: string;
  fieldCode: string;
  scenario: string;
  permission: 'visible' | 'hidden' | 'readonly' | 'masked';
}

const PERMISSION_OPTIONS = [
  { label: '可见', value: 'visible' },
  { label: '隐藏', value: 'hidden' },
  { label: '只读', value: 'readonly' },
  { label: '脱敏', value: 'masked' },
];

const PERMISSION_COLORS: Record<string, string> = {
  visible: 'green',
  hidden: 'red',
  readonly: 'blue',
  masked: 'orange',
};

interface RolePermissionMatrixProps {
  roles: RoleItem[];
  fields: FieldItem[];
  scenarios: ScenarioItem[];
  permissions: PermissionCell[];
  onPermissionChange: (
    roleId: string,
    fieldCode: string,
    scenario: string,
    permission: 'visible' | 'hidden' | 'readonly' | 'masked',
  ) => void;
  loading?: boolean;
}

function RolePermissionMatrix({
  roles,
  fields,
  scenarios,
  permissions,
  onPermissionChange,
  loading,
}: RolePermissionMatrixProps) {
  const [activeScenario, setActiveScenario] = useState<string>(
    scenarios[0]?.code || 'main',
  );

  const getPermission = (roleId: string, fieldCode: string): string => {
    const p = permissions.find(
      (perm) =>
        perm.roleId === roleId &&
        perm.fieldCode === fieldCode &&
        perm.scenario === activeScenario,
    );
    return p?.permission || 'visible';
  };

  const columns: ColumnsType<FieldItem> = [
    {
      title: '字段编码',
      dataIndex: 'field_code',
      key: 'field_code',
      width: 180,
      fixed: 'left',
      render: (code: string) => <Tag>{code}</Tag>,
    },
    {
      title: '字段名称',
      dataIndex: 'field_name',
      key: 'field_name',
      width: 150,
      fixed: 'left',
    },
    ...roles.map((role) => ({
      title: role.name,
      key: role.id,
      width: 160,
      render: (_: unknown, record: FieldItem) => {
        const currentPerm = getPermission(role.id, record.field_code);
        return (
          <Select
            value={currentPerm}
            onChange={(val: string) =>
              onPermissionChange(
                role.id,
                record.field_code,
                activeScenario,
                val as 'visible' | 'hidden' | 'readonly' | 'masked',
              )
            }
            options={PERMISSION_OPTIONS}
            style={{ width: 120 }}
            optionRender={(opt) => {
              const color = PERMISSION_COLORS[opt.value as string] || 'default';
              return <Tag color={color}>{opt.label}</Tag>;
            }}
          />
        );
      },
    })),
  ];

  if (scenarios.length <= 1) {
    return (
      <Card title="角色 × 字段权限矩阵">
        <Table
          columns={columns}
          dataSource={fields.map((f, i) => ({ ...f, key: i }))}
          pagination={false}
          loading={loading}
          scroll={{ x: 'max-content' }}
          bordered
        />
      </Card>
    );
  }

  return (
    <Card title="角色 × 字段权限矩阵">
      <Tabs
        activeKey={activeScenario}
        onChange={setActiveScenario}
        items={scenarios.map((s) => ({
          key: s.code,
          label: s.name,
        }))}
      />
      <Table
        columns={columns}
        dataSource={fields.map((f, i) => ({ ...f, key: i }))}
        pagination={false}
        loading={loading}
        scroll={{ x: 'max-content' }}
        bordered
      />
    </Card>
  );
}

export default RolePermissionMatrix;
export type { RolePermissionMatrixProps };
