import { io, type Socket } from 'socket.io-client';

type PermissionUpdateHandler = (payload?: unknown) => void;

let socket: Socket | null = null;
const handlers = new Set<PermissionUpdateHandler>();

function socketOrigin(): string {
  const configured = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  if (configured) return configured.replace(/\/api$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function subscribePermissionConfigUpdates(handler: PermissionUpdateHandler): () => void {
  handlers.add(handler);
  if (!socket && typeof window !== 'undefined' && import.meta.env.MODE !== 'test' && import.meta.env.VITE_USE_MOCK !== 'true') {
    socket = io(`${socketOrigin()}/permission-updates`, {
      transports: ['websocket'],
      auth: { token: window.localStorage.getItem('token') || undefined },
    });
    const notify = (payload?: unknown) => handlers.forEach((item) => item(payload));
    socket.on('config-updated', notify);
    socket.on('config-activated', notify);
    socket.on('permission-updates', notify);
  }
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0 && socket) {
      socket.disconnect();
      socket = null;
    }
  };
}

export function closePermissionConfigUpdates(): void {
  handlers.clear();
  socket?.disconnect();
  socket = null;
}
