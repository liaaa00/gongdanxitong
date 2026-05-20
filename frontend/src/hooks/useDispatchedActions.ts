import { useState, useCallback } from 'react';
import { App } from 'antd';
import {
  acceptDispatchedOrder, completeDispatchedOrder, returnDispatchedOrder,
  supplementField, exportDispatchedOrder, reassignDispatchedOrder, getDispatchedOrder,
} from '@/services/dispatchedOrders';
import type { DispatchedOrderItem } from '@/services/dispatchedOrders';

interface UseDispatchedActionsOptions {
  orderId: string;
  order: DispatchedOrderItem | null;
  onOrderUpdated: (order: DispatchedOrderItem) => void;
}

export function useDispatchedActions({ orderId, order, onOrderUpdated }: UseDispatchedActionsOptions) {
  const { message } = App.useApp();
  const [actionLoading, setActionLoading] = useState(false);

  const handleAccept = useCallback(async () => {
    setActionLoading(true);
    try {
      const updated = await acceptDispatchedOrder(orderId);
      onOrderUpdated(updated);
      message.success('已接单');
    } catch { message.error('接单失败'); }
    finally { setActionLoading(false); }
  }, [orderId, onOrderUpdated]);

  const handleComplete = useCallback(async (feedback: Record<string, unknown>) => {
    setActionLoading(true);
    try {
      const updated = await completeDispatchedOrder(orderId, feedback);
      onOrderUpdated(updated);
      message.success('已完成');
      return updated;
    } catch { message.error('操作失败'); }
    finally { setActionLoading(false); }
    return null;
  }, [orderId, onOrderUpdated]);

  const handleReturn = useCallback(async (reason: string, fields?: string[]) => {
    if (!reason.trim()) return null;
    setActionLoading(true);
    try {
      const updated = await returnDispatchedOrder(orderId, reason, fields);
      onOrderUpdated(updated);
      message.success('已退回');
      return updated;
    } catch { message.error('退回失败'); }
    finally { setActionLoading(false); }
    return null;
  }, [orderId, onOrderUpdated]);

  const handleSupplement = useCallback(async (fields: Record<string, string>) => {
    setActionLoading(true);
    try {
      await supplementField(orderId, fields);
      message.success('字段已补充，将同步到关联子工单');
      const updated = await getDispatchedOrder(orderId);
      onOrderUpdated(updated);
      return updated;
    } catch { message.error('补充失败'); }
    finally { setActionLoading(false); }
    return null;
  }, [orderId, onOrderUpdated]);

  const handleExport = useCallback(async (templateId?: string) => {
    setActionLoading(true);
    try {
      const blob = await exportDispatchedOrder(orderId, templateId || undefined);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `子工单_${order?.order_no || orderId}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch { message.error('导出失败'); }
    finally { setActionLoading(false); }
  }, [orderId, order]);

  const handleReassign = useCallback(async (handlerId: string, reason?: string) => {
    setActionLoading(true);
    try {
      const updated = await reassignDispatchedOrder(orderId, handlerId, reason);
      onOrderUpdated(updated);
      message.success('转交成功');
      return updated;
    } catch { message.error('转交失败'); }
    finally { setActionLoading(false); }
    return null;
  }, [orderId, onOrderUpdated]);

  return {
    actionLoading,
    handleAccept,
    handleComplete,
    handleReturn,
    handleSupplement,
    handleExport,
    handleReassign,
  };
}
