import { create } from "zustand";
import type { WsEvent } from "@/types";

interface WsState {
  connected: boolean;
  lastEvent: WsEvent | null;
  listeners: Array<(e: WsEvent) => void>;
  setConnected: (v: boolean) => void;
  dispatch: (e: WsEvent) => void;
  subscribe: (fn: (e: WsEvent) => void) => () => void;
}

export const useWsStore = create<WsState>((set, get) => ({
  connected: false,
  lastEvent: null,
  listeners: [],
  setConnected: (connected) => set({ connected }),
  dispatch: (e) => {
    set({ lastEvent: e });
    get().listeners.forEach((fn) => fn(e));
  },
  subscribe: (fn) => {
    set((s) => ({ listeners: [...s.listeners, fn] }));
    return () => set((s) => ({ listeners: s.listeners.filter((l) => l !== fn) }));
  },
}));
