import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ResignationList from './index';

vi.mock('@/services/workOrders', () => ({
  getWorkOrders: vi.fn().mockResolvedValue({
    list: [
      { id: '1', order_no: 'RS20260512001', order_type: 'resignation', status: 'processing', customer_name: 'Test Corp', employee_name: 'TestUser', created_by: 'Admin', created_at: '2026-05-12T00:00:00Z' },
    ],
    page: 1, pageSize: 20, total: 1, totalPages: 1, success: true,
  }),
}));

describe('Resignation List Page', () => {
  it('renders page title', async () => {
    render(
      <MemoryRouter>
        <ResignationList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('离职工单')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders new resignation button', async () => {
    render(
      <MemoryRouter>
        <ResignationList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('新建离职')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders export button', async () => {
    render(
      <MemoryRouter>
        <ResignationList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('导出')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders cert link', async () => {
    render(
      <MemoryRouter>
        <ResignationList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('离职证明')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders table container', async () => {
    const { container } = render(
      <MemoryRouter>
        <ResignationList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(container.textContent).toContain('离职');
    }, { timeout: 5000 });
  });
});
