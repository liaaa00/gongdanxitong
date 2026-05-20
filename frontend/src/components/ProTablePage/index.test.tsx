import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ProTablePage from './index';

describe('ProTablePage', () => {
  it('renders title correctly', async () => {
    const columns = [
      { title: 'Name', dataIndex: 'name', key: 'name' },
      { title: 'Age', dataIndex: 'age', key: 'age' },
    ];
    const request = vi.fn().mockResolvedValue({ data: [{ name: 'Alice', age: 30 }], success: true, total: 1 });
    render(
      <ProTablePage title="TestTable" columns={columns} request={request} rowKey="name" />,
    );
    await waitFor(() => {
      expect(screen.getByText('TestTable')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('handles data loading without crashing', async () => {
    const columns = [{ title: 'Name', dataIndex: 'name', key: 'name' }];
    const request = vi.fn().mockResolvedValue({ data: [], success: true, total: 50 });
    const { container } = render(
      <ProTablePage title="PagedTable" columns={columns} request={request} rowKey="name" />,
    );
    await waitFor(() => {
      const errorDiv = container.querySelector('.ant-result-error');
      expect(errorDiv).toBeNull();
    }, { timeout: 5000 });
  });
});
