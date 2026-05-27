import { useState, useCallback } from 'react';
import { App } from 'antd';
import {
  acceptDispatchedOrder, completeDispatchedOrder, returnDispatchedOrder,
  supplementField, exportDispatchedOrder, downloadDispatchedExport, reassignDispatchedOrder, getDispatchedOrder,
  creatorUpdateDispatchedOrderFields, urgeDispatchedOrder, withdrawDispatchedOrder, voidDispatchedOrder,
  approveWithdrawDispatchedOrder, approveVoidDispatchedOrder,
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

  const handleExport = useCallback(async () => {
    setActionLoading(true);
    try {
      const result = await exportDispatchedOrder(orderId);
      await downloadDispatchedExport(result, `子工单_${order?.order_no || orderId}.xlsx`);
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

  const handleCreatorUpdate = useCallback(async (fields: Record<string, unknown>, reason?: string) => {
    setActionLoading(true);
    try {
      const updated = await creatorUpdateDispatchedOrderFields(orderId, fields, reason);
      onOrderUpdated(updated);
      message.success('修改已保存，并已通知相关办理人');
      return updated;
    } catch { message.error('修改失败'); }
    finally { setActionLoading(false); }
    return null;
  }, [orderId, onOrderUpdated]);

  const handleUrge = useCallback(async (reason?: string) => {
    setActionLoading(true);
    try {
      const updated = await urgeDispatchedOrder(orderId, reason);
      onOrderUpdated(updated);
      message.success('已发送催办');
      return updated;
    } catch { message.error('催办失败'); }
    finally { setActionLoading(false); }
    return null;
  }, [orderId, onOrderUpdated]);

  const handleWithdraw = useCallback(async (reason: string) => {
    setActionLoading(true);
    try {
      const updated = await withdrawDispatchedOrder(orderId, reason, order?.module_code);
      onOrderUpdated(updated);
      message.success('已撤回该子工单');
      return updated;
    } catch { message.error('撤回失败'); }
    finally { setActionLoading(false); }
    return null;
  }, [orderId, onOrderUpdated]);

  const handleVoid = useCallback(async (reason: string) => {
    setActionLoading(true);
    try {
      const updated = await voidDispatchedOrder(orderId, reason, order?.module_code);
      onOrderUpdated(updated);
      message.success('作废申请已提交，等待后道审批');
      return updated;
    } catch { message.error('作废失败'); }
    finally { setActionLoading(false); }
    return null;
  }, [orderId, onOrderUpdated]);

  const handleApproveWithdraw = useCallback(async (approved: boolean, comment?: string) => {
    setActionLoading(true);
    try {
      const updated = await approveWithdrawDispatchedOrder(orderId, approved, comment);
      onOrderUpdated(updated);
      message.success(approved ? '已同意撤回申请' : '已拒绝撤回申请');
      return updated;
    } catch { message.error('撤回审批失败'); }
    finally { setActionLoading(false); }
    return null;
  }, [orderId, onOrderUpdated]);

  const handleApproveVoid = useCallback(async (approved: boolean, comment?: string) => {
    setActionLoading(true);
    try {
      const updated = await approveVoidDispatchedOrder(orderId, approved, comment);
      onOrderUpdated(updated);
      message.success(approved ? '已同意作废申请' : '已拒绝作废申请');
      return updated;
    } catch { message.error('作废审批失败'); }
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
    handleCreatorUpdate,
    handleUrge,
    handleWithdraw,
    handleVoid,
    handleApproveWithdraw,
    handleApproveVoid,
  };
}
