import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ResignationList from './index';

const LocationProbe: React.FC = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
};

describe('Resignation legacy route', () => {
  it('redirects old resignation list route to unified resignation work-order list', async () => {
    const { getByTestId } = render(
      <MemoryRouter initialEntries={["/resignation"]}>
        <Routes>
          <Route path="/resignation" element={<ResignationList />} />
          <Route path="/work-orders" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(getByTestId('location').textContent).toBe('/work-orders?orderType=resignation');
    });
  });
});
