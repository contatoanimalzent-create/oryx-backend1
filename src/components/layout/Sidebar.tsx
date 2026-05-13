"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Map,
  CalendarDays,
  Target,
  ShieldAlert,
  Clock,
  LogOut,
  Radio,
  Crosshair,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useWsStore } from "@/store/ws";

const NAV_ITEMS = [
  { href: "/events", label: "Eventos", icon: CalendarDays },
  { href: "/map", label: "Mapa em Tempo Real", icon: Map },
  { href: "/missions", label: "Missões & Zonas", icon: Target },
  { href: "/compliance", label: "Compliance FABE", icon: ShieldAlert },
  { href: "/timeline", label: "Timeline / AAR", icon: Clock },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const connected = useWsStore((s) => s.connected);

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-neutral-950 border-r border-neutral-800">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-neutral-800">
        <Crosshair className="text-blue-400" size={24} />
        <div>
          <div className="text-white font-bold text-sm tracking-widest uppercase">ORYX</div>
          <div className="text-neutral-500 text-xs">Admin Panel</div>
        </div>
      </div>

      {/* WS Status */}
      <div className="flex items-center gap-2 px-6 py-2 border-b border-neutral-800">
        <Radio size={12} className={connected ? "text-green-400" : "text-neutral-600"} />
        <span className={cn("text-xs", connected ? "text-green-400" : "text-neutral-500")}>
          {connected ? "Realtime conectado" : "Realtime desconectado"}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors",
                active
                  ? "bg-blue-600/20 text-blue-300 border border-blue-600/30"
                  : "text-neutral-400 hover:text-white hover:bg-neutral-800"
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-neutral-800 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm text-white font-medium truncate">{user?.name ?? "Admin"}</p>
            <p className="text-xs text-neutral-500 truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="ml-2 p-1.5 text-neutral-500 hover:text-red-400 transition-colors rounded"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
