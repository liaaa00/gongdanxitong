import '@testing-library/jest-dom';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

if (typeof window.ResizeObserver === 'undefined') {
  (window as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof window.getComputedStyle === 'undefined') {
  (window as any).getComputedStyle = () => ({
    getPropertyValue: () => '',
  });
}

const originalError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('React does not recognize the')) return;
  if (typeof args[0] === 'string' && args[0].includes('Not implemented')) return;
  originalError.call(console, ...args);
};

vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...(actual as object),
    App: {
      ...((actual as Record<string, unknown>).App as object),
      useApp: () => ({
        message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
        notification: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
        modal: { confirm: vi.fn() },
      }),
    },
  };
});
