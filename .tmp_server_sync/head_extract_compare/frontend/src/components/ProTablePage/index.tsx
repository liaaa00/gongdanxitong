import { useRef } from 'react';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns, ActionType, ProTableProps } from '@ant-design/pro-components';
import { Button, Space } from 'antd';
import { ExportOutlined } from '@ant-design/icons';

interface ProTablePageProps<T extends Record<string, unknown>> {
  title: string;
  columns: ProColumns<T>[];
  request: ProTableProps<T, Record<string, unknown>>['request'];
  rowKey?: string;
  toolBarRender?: () => React.ReactNode[];
  search?: boolean;
  onExport?: () => void;
}

function ProTablePage<T extends Record<string, unknown>>({
  title,
  columns,
  request,
  rowKey = 'id',
  toolBarRender,
  search,
  onExport,
}: ProTablePageProps<T>) {
  const actionRef = useRef<ActionType>(null);

  const defaultToolBar = () => {
    const actions: React.ReactNode[] = [];
    if (toolBarRender) {
      actions.push(...toolBarRender());
    }
    if (onExport) {
      actions.push(
        <Button key="export" icon={<ExportOutlined />} onClick={onExport}>
          导出
        </Button>,
      );
    }
    return actions;
  };

  return (
    <ProTable<T>
      actionRef={actionRef}
      columns={columns}
      request={request}
      rowKey={rowKey}
      search={search === false ? false : { labelWidth: 'auto' }}
      headerTitle={title}
      toolBarRender={defaultToolBar}
      pagination={{ defaultPageSize: 20, showSizeChanger: true }}
      dateFormatter="string"
    />
  );
}

export default ProTablePage;
