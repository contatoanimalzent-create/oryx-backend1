"use client";
import { useAuthStore } from "@/store/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { useWebSocket } from "@/hooks/useWebSocket";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuthStore();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useWebSocket();

  // Wait for Zustand persist to rehydrate before checking auth
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-500 text-sm">
        Carregando...
      </div>
    );
  }

  if (!accessToken) return null;

  return (
    <div className="flex min-h-screen bg-neutral-900 text-white">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
