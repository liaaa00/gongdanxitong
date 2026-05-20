import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BenefitList from './index';

vi.mock('@/services/workOrders', () => ({
  getWorkOrders: vi.fn().mockResolvedValue({
    list: [
      { id: '1', order_no: 'BF20260512001', order_type: 'benefit', status: 'processing', customer_name: 'Test Corp', employee_name: 'TestUser', created_by: 'Admin', created_at: '2026-05-12T00:00:00Z' },
    ],
    page: 1, pageSize: 20, total: 1, totalPages: 1, success: true,
  }),
}));

describe('Benefit List Page', () => {
  it('renders page title', async () => {
    render(
      <MemoryRouter>
        <BenefitList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('待遇申报')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders new benefit button', async () => {
    render(
      <MemoryRouter>
        <BenefitList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('新建申报')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders export button', async () => {
    render(
      <MemoryRouter>
        <BenefitList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('导出')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders table container', async () => {
    const { container } = render(
      <MemoryRouter>
        <BenefitList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(container.textContent).toContain('待遇申报');
    }, { timeout: 5000 });
  });

  it('has detail button', async () => {
    render(
      <MemoryRouter>
        <BenefitList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('详情')).toBeTruthy();
    }, { timeout: 5000 });
  });
});
