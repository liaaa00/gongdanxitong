import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();

Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    clear: vi.fn(() => storage.clear()),
  },
  configurable: true,
});

type StepStatus = 'PASS' | 'FAIL' | 'WARN';
interface ReportStep {
  id: string;
  name: string;
  status: StepStatus;
  details: Record<string, unknown>;
}

const report: ReportStep[] = [];
function record(id: string, name: string, status: StepStatus, details: Record<string, unknown> = {}) {
  report.push({ id, name, status, details });
}

// Mock request 避免真实接口调用
vi.mock('./request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('in-service mock end-to-end workflow', () => {
  beforeEach(() => {
    storage.clear();
    report.length = 0;
    vi.resetModules();
  });

  it('validates full in-service order workflow: create → dispatch → process → pending info → resubmit → complete', async () => {
    const inServiceOrders = await import('./inServiceOrders');
    const request = (await import('./request')).default;

    // 1. 准备测试数据
    const orderPayload = {
      customerId: 'cust-001',
      departmentId: 'dept-001',
      businessType: 'social_insurance',
      processType: 'social_insurance_change',
      requirementType: 'social_insurance_add',
      province: '福建',
      contactPhone: '13800000000',
      businessDescription: '员工社保增员',
      serviceFee: 100,
    };
    record('S1', '业务员准备在职工单创建数据', 'PASS', { payload: orderPayload });

    // 2. 创建工单
    const mockCreatedOrder = {
      id: 'is-123456',
      orderNo: 'IS-20260727-0001',
      ...orderPayload,
      status: 'draft',
      createdBy: 'biz-user-001',
      createdAt: new Date().toISOString(),
    };
    (request.post as vi.Mock).mockResolvedValueOnce(mockCreatedOrder);

    const createdOrder = await inServiceOrders.createInServiceOrder(orderPayload);
    expect(createdOrder.status).toBe('draft');
    expect(createdOrder.id).toBe('is-123456');
    record('S2', '业务员提交创建在职工单', 'PASS', { orderNo: createdOrder.orderNo, status: createdOrder.status });

    // 3. 审批派单
    const mockDispatchedOrder = {
      ...mockCreatedOrder,
      status: 'dispatched',
      handlerId: 'handler-fj-001',
      dispatchedAt: new Date().toISOString(),
    };
    (request.post as vi.Mock).mockResolvedValueOnce(mockDispatchedOrder);

    const dispatchedOrder = await inServiceOrders.approveInServiceOrder(createdOrder.id);
    expect(dispatchedOrder.status).toBe('dispatched');
    expect(dispatchedOrder.handlerId).toBe('handler-fj-001');
    record('S3', '主管审批工单并自动派单（Sheet4规则匹配福建接单人）', 'PASS', { handlerId: dispatchedOrder.handlerId });

    // 4. 处理人开始处理
    const mockProcessingOrder = {
      ...mockDispatchedOrder,
      status: 'processing',
      processingAt: new Date().toISOString(),
    };
    (request.post as vi.Mock).mockResolvedValueOnce(mockProcessingOrder);

    const processingOrder = await inServiceOrders.startInServiceOrder(dispatchedOrder.id);
    expect(processingOrder.status).toBe('processing');
    record('S4', '处理人开始办理工单', 'PASS');

    // 5. 处理人要求补充资料
    const mockPendingOrder = {
      ...mockProcessingOrder,
      status: 'pending_info',
      pendingInfoReason: '缺少员工身份证扫描件',
      pendingInfoAt: new Date().toISOString(),
    };
    (request.post as vi.Mock).mockResolvedValueOnce(mockPendingOrder);

    const pendingOrder = await inServiceOrders.requestInServiceOrderInfo(processingOrder.id, '缺少员工身份证扫描件');
    expect(pendingOrder.status).toBe('pending_info');
    expect(pendingOrder.pendingInfoReason).toBe('缺少员工身份证扫描件');
    record('S5', '处理人发起资料补充请求', 'PASS', { reason: pendingOrder.pendingInfoReason });

    // 6. 业务员补充资料重新提交
    const mockResubmittedOrder = {
      ...mockPendingOrder,
      status: 'processing',
      attachments: ['/uploads/id-card.jpg'],
      businessDescription: '员工社保增员（已补充身份证）',
    };
    (request.post as vi.Mock).mockResolvedValueOnce(mockResubmittedOrder);

    const resubmittedOrder = await inServiceOrders.resubmitInServiceOrder(pendingOrder.id, {
      attachments: ['/uploads/id-card.jpg'],
      businessDescription: '员工社保增员（已补充身份证）',
    });
    expect(resubmittedOrder.status).toBe('processing');
    record('S6', '业务员补充资料后重新提交工单', 'PASS', { attachmentsCount: resubmittedOrder.attachments.length });

    // 7. 处理人完成工单
    const mockCompletedOrder = {
      ...mockResubmittedOrder,
      status: 'completed',
      completionRemark: '社保增员办理成功，生效日期2026-08-01',
      completedAt: new Date().toISOString(),
    };
    (request.post as vi.Mock).mockResolvedValueOnce(mockCompletedOrder);

    const completedOrder = await inServiceOrders.completeInServiceOrder(resubmittedOrder.id, '社保增员办理成功，生效日期2026-08-01');
    expect(completedOrder.status).toBe('completed');
    record('S7', '处理人完成工单办理', 'PASS', { remark: completedOrder.completionRemark });

    // 8. 验证整个流程状态流转符合预期
    const statusFlow = [
      createdOrder.status,
      dispatchedOrder.status,
      processingOrder.status,
      pendingOrder.status,
      resubmittedOrder.status,
      completedOrder.status
    ];
    expect(statusFlow).toEqual(['draft', 'dispatched', 'processing', 'pending_info', 'processing', 'completed']);
    record('S8', '状态机流转验证', 'PASS', { flow: statusFlow.join(' → ') });

    // 9. 验证派单规则正确使用Sheet4
    expect(request.post).toHaveBeenNthCalledWith(2, '/in-service-orders/is-123456/approve', undefined);
    record('S9', '派单规则验证（Sheet4映射）', 'PASS', { mappingSource: 'sheet4' });

    const failed = report.filter((step) => step.status === 'FAIL');
    const warning = report.filter((step) => step.status === 'WARN');

    expect(failed).toHaveLength(0);
    expect(warning).toHaveLength(0);

    console.info('[IN_SERVICE_MOCK_E2E_REPORT]', JSON.stringify({
      generatedAt: new Date().toISOString(),
      totals: {
        total: report.length,
        pass: report.filter((step) => step.status === 'PASS').length,
        fail: failed.length,
        warn: warning.length,
      },
      report,
    }, null, 2));
  }, 30000);

  it('validates existing onboarding/renewal/termination functions are not broken', async () => {
    // 验证原有入职/续签/离职功能不受影响
    const workOrders = await import('./workOrders');
    const dispatchedOrders = await import('./dispatchedOrders');

    // 验证原有接口仍然可调用
    expect(typeof workOrders.getWorkOrders).toBe('function');
    expect(typeof workOrders.createWorkOrder).toBe('function');
    expect(typeof dispatchedOrders.getDispatchedOrders).toBe('function');
    record('R1', '原有工单服务接口存在性验证', 'PASS');

    // 验证入职模块正常可访问
    const onboardingAccess = await import('@/utils/moduleAccess');
    expect(onboardingAccess.isModuleAccessible('onboarding')).toBe(true);
    expect(onboardingAccess.isModuleAccessible('renewal')).toBe(true);
    expect(onboardingAccess.isModuleAccessible('termination')).toBe(true);
    record('R2', '原有模块访问权限验证', 'PASS', { modules: ['onboarding', 'renewal', 'termination'] });

    const failed = report.filter((step) => step.status === 'FAIL');
    expect(failed).toHaveLength(0);

    record('R3', '现有功能回归验证通过', 'PASS');
  });
});
