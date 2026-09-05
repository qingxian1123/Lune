import { create } from 'zustand';

/** UI acknowledgement only. Memory disappears when the client process closes. */
export const useSessionHeartStore = create<{
  sent: ReadonlySet<string>;
  remember: (key: string) => void;
}>((set) => ({
  sent: new Set(),
  remember: (key) => set((state) => state.sent.has(key)
    ? state
    : { sent: new Set([...state.sent, key]) }),
}));
