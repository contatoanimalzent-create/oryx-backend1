import { create } from "zustand";
import type { Operator } from "@/types";

interface OperatorState {
  operators: Record<string, Operator>;
  setOperators: (ops: Operator[]) => void;
  updatePosition: (id: string, lat: number, lng: number, timestamp: string) => void;
  updateStatus: (id: string, status: Operator["status"]) => void;
}

export const useOperatorStore = create<OperatorState>((set) => ({
  operators: {},
  setOperators: (ops) =>
    set({ operators: Object.fromEntries(ops.map((o) => [o.id, o])) }),
  updatePosition: (id, lat, lng, timestamp) =>
    set((s) => {
      const op = s.operators[id];
      if (!op) return s;
      return { operators: { ...s.operators, [id]: { ...op, lat, lng, lastSeen: timestamp } } };
    }),
  updateStatus: (id, status) =>
    set((s) => {
      const op = s.operators[id];
      if (!op) return s;
      return { operators: { ...s.operators, [id]: { ...op, status } } };
    }),
}));
