import { create } from 'zustand';

interface AppState {
  collapsed: boolean;
  loading: boolean;
  setCollapsed: (collapsed: boolean) => void;
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  collapsed: false,
  loading: false,
  setCollapsed: (collapsed: boolean) => set({ collapsed }),
  setLoading: (loading: boolean) => set({ loading }),
}));
