import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigProvider } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import type { FieldConfigItem } from '@/services/fields';
import type { WorkOrderItem } from '@/services/workOrders';
import PortalIntakeReview from './PortalIntakeReview';

const mocks = vi.hoisted(() => ({
  getPortalIntake: vi.fn(), claimPortalIntake: vi.fn(), getFields: vi.fn(),
  getWorkOrder: vi.fn(), updateWorkOrder: vi.fn(), submitWorkOrder: vi.fn(),
}));
vi.mock('@/services/portalReview', () => ({ getPortalIntake: mocks.getPortalIntake, claimPortalIntake: mocks.claimPortalIntake }));
vi.mock('@/services/fields', () => ({ getFields: mocks.getFields }));
vi.mock('@/services/workOrders', () => ({ getWorkOrder: mocks.getWorkOrder, updateWorkOrder: mocks.updateWorkOrder, submitWorkOrder: mocks.submitWorkOrder }));
vi.mock('@/components/MaterialsUpload', () => ({ default: () => <div>材料上传</div> }));

function makeField(code: string, name: string, options?: string[]): FieldConfigItem {
  return {
    id: code, field_code: code, field_name: name, field_type: options ? 'dropdown' : 'text',
    is_required: Boolean(options), default_required: Boolean(options), validation_regex: null, validation_msg: null,
    dropdown_options: options?.map((value) => ({ label: value, value })) ?? null,
    placeholder: null, help_text: null, order_type: 'onboarding', display_order: 1, is_active: true,
  };
}
const definitions = [
  makeField('need_onboarding_contact', '是否集约收集', ['是', '否']),
  makeField('need_esign', '是否电子签', ['1.是', '2.否']),
  makeField('need_company_contract', '是否企服发起合同', ['是', '否']),
  makeField('special_remark', '审核备注'),
];
let detail: WorkOrderItem;

beforeEach(() => {
  vi.clearAllMocks();
  detail = {
    id: 'draft-1', order_no: 'PORTAL-DRAFT-1', order_type: 'onboarding', status: 'draft',
    customer_name: '测试客户', employee_name: '测试员工', employee_id_card: '', created_by: 'reviewer', department_id: '',
    submitted_at: null, completed_at: null, created_at: '', updated_at: '',
    extra_data: { need_onboarding_contact: false, need_esign: false, need_company_contract: '是', special_remark: '人工已填', portal_configuration_pending: false },
  };
  mocks.getPortalIntake.mockResolvedValue([{
    id: 'intake-1', requestNo: 'INTAKE-1', businessType: 'onboarding', workOrderId: 'draft-1', status: 'accepted',
    createdAt: '', configurationMissing: [], canClaim: true, canReview: false, originalStopMonth: null,
  }]);
  mocks.claimPortalIntake.mockResolvedValue({ workOrderId: 'draft-1' });
  mocks.getFields.mockResolvedValue(definitions);
  mocks.getWorkOrder.mockImplementation(async () => ({ ...detail, extra_data: { ...detail.extra_data } }));
  mocks.updateWorkOrder.mockImplementation(async (_id: string, patch: { extra_data: Record<string, unknown> }) => {
    detail = { ...detail, extra_data: { ...detail.extra_data, ...patch.extra_data } };
    return detail;
  });
  mocks.submitWorkOrder.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('门户增减员审核抽屉', () => {
  it('显示明确的否选项，保留原有人工值，只保存实际改动并正常通过校验', async () => {
    render(<ConfigProvider theme={{ token: { motion: false } }}><MemoryRouter><PortalIntakeReview customerId="customer-1" /></MemoryRouter></ConfigProvider>);
    fireEvent.click(await screen.findByRole('button', { name: '认领并审核' }));
    const esign = await screen.findByRole('combobox', { name: '是否电子签' });
    expect(esign.closest('.ant-select')).toHaveTextContent('2.否');
    expect(screen.getByRole('combobox', { name: '是否集约收集' }).closest('.ant-select')).toHaveTextContent('否');
    expect(screen.getByRole('combobox', { name: '是否企服发起合同' }).closest('.ant-select')).toHaveTextContent('是');
    expect(screen.getByRole('textbox', { name: '审核备注' })).toHaveValue('人工已填');

    fireEvent.change(screen.getByRole('textbox', { name: '审核备注' }), { target: { value: '本次补充' } });
    fireEvent.click(screen.getByRole('button', { name: '保存资料' }));
    await waitFor(() => expect(mocks.updateWorkOrder).toHaveBeenCalledWith('draft-1', { extra_data: { special_remark: '本次补充' } }));
    await waitFor(() => expect(mocks.getWorkOrder).toHaveBeenCalledTimes(2));
    expect(detail.extra_data.need_onboarding_contact).toBe(false);
    expect(detail.extra_data.need_esign).toBe(false);
    expect(detail.extra_data.need_company_contract).toBe('是');

    fireEvent.mouseDown(esign);
    fireEvent.click(await screen.findByText('1.是', { selector: '.ant-select-item-option-content' }));
    fireEvent.click(screen.getByRole('button', { name: '审核通过并派发' }));
    await waitFor(() => expect(mocks.submitWorkOrder).toHaveBeenCalledWith('draft-1'));
    expect(mocks.updateWorkOrder).toHaveBeenLastCalledWith('draft-1', { extra_data: { need_esign: '1.是' } });
    expect(detail.extra_data.need_onboarding_contact).toBe(false);
    expect(detail.extra_data.portal_configuration_pending).toBe(false);
    expect(mocks.claimPortalIntake).toHaveBeenCalledWith('customer-1', 'intake-1');
  });
});
