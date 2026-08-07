import { useEffect, useMemo, useState } from 'react';
import { Button } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import { useUserStore } from '@/stores/userStore';
import ColumnsConfigDrawer from './ColumnsConfigDrawer';

const STORAGE_PREFIX = 'mv_config_';

interface StoredConfig {
  columnsOrder?: string[];
  columnsHidden?: string[];
}

function readConfig(viewId: string): StoredConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + viewId);
    return raw ? JSON.parse(raw) as StoredConfig : null;
  } catch {
    return null;
  }
}

function writeConfig(viewId: string, config: StoredConfig): void {
  localStorage.setItem(STORAGE_PREFIX + viewId, JSON.stringify(config));
}

export function getAccountScopedColumnViewId(viewId: string, userId: string, businessScope: string): string {
  return `${viewId}:${userId}:${businessScope}`;
}

export function useColumnConfig<T extends object>(
  viewId: string,
  columns: ProColumns<T>[],
): {
  columns: ProColumns<T>[];
  button: React.ReactNode;
  drawer: React.ReactNode;
} {
  const user = useUserStore((state) => state.user);
  const userId = user?.id ?? 'anonymous';
  const businessScope = user?.business_scope ?? user?.businessScope ?? 'default';
  const scopedViewId = getAccountScopedColumnViewId(viewId, userId, businessScope);
  const allKeys = useMemo(
    () => columns
      .filter((column) => column.dataIndex !== 'actions' && column.key !== 'actions')
      .map((column) => String(column.dataIndex || column.key)),
    [columns],
  );
  const saved = useMemo(() => readConfig(scopedViewId), [scopedViewId]);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>(saved?.columnsHidden || []);
  const [order, setOrder] = useState<string[]>(saved?.columnsOrder || allKeys);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setHiddenKeys(saved?.columnsHidden || []);
    setOrder(saved?.columnsOrder || allKeys);
  }, [saved, allKeys]);

  const persist = (nextHidden: string[], nextOrder: string[]) => {
    writeConfig(scopedViewId, { columnsHidden: nextHidden, columnsOrder: nextOrder });
  };

  const resolvedColumns = useMemo(() => {
    const active = columns.filter((column) => {
      const key = String(column.dataIndex || column.key);
      return key === 'actions' || !hiddenKeys.includes(key);
    });
    return [...active].sort((left, right) => {
      const leftKey = String(left.dataIndex || left.key);
      const rightKey = String(right.dataIndex || right.key);
      if (leftKey === 'actions') return 1;
      if (rightKey === 'actions') return -1;
      const leftIndex = order.indexOf(leftKey);
      const rightIndex = order.indexOf(rightKey);
      return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
    });
  }, [columns, hiddenKeys, order]);

  const button = (
    <Button size="small" icon={<SettingOutlined />} onClick={() => setOpen(true)}>
      列配置
    </Button>
  );
  const drawer = (
    <ColumnsConfigDrawer
      open={open}
      onClose={() => setOpen(false)}
      viewId={scopedViewId}
      columns={columns as ProColumns<Record<string, unknown>>[]}
      hiddenKeys={hiddenKeys}
      onHiddenKeysChange={(next) => {
        setHiddenKeys(next);
        persist(next, order);
      }}
      order={order}
      onOrderChange={(next) => {
        setOrder(next);
        persist(hiddenKeys, next);
      }}
    />
  );

  return { columns: resolvedColumns, button, drawer };
}
