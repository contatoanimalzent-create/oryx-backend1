import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AdminUser } from "@/types";

interface AuthState {
  user: AdminUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: AdminUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      logout: () => {
        set({ user: null, accessToken: null, refreshToken: null });
      },
    }),
    { name: "oryx_tokens" }
  )
);
