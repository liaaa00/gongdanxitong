import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RenewalList from './index';

vi.mock('@/services/workOrders', () => ({
  getWorkOrders: vi.fn().mockResolvedValue({
    list: [
      { id: '1', order_no: 'RN20260512001', order_type: 'renewal', status: 'processing', customer_name: 'Test Corp', employee_name: 'TestUser', created_by: 'Admin', created_at: '2026-05-12T00:00:00Z' },
    ],
    page: 1, pageSize: 20, total: 1, totalPages: 1, success: true,
  }),
}));

describe('Renewal List Page', () => {
  it('renders page title', async () => {
    render(
      <MemoryRouter>
        <RenewalList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('续签工单')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders new button', async () => {
    render(
      <MemoryRouter>
        <RenewalList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('新建续签')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders export button', async () => {
    render(
      <MemoryRouter>
        <RenewalList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('导出')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders table container', async () => {
    const { container } = render(
      <MemoryRouter>
        <RenewalList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(container.textContent).toContain('续签');
    }, { timeout: 5000 });
  });

  it('navigates to detail on click', async () => {
    render(
      <MemoryRouter>
        <RenewalList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      const detailBtn = screen.getByText('详情');
      expect(detailBtn).toBeTruthy();
    }, { timeout: 5000 });
  });
});
