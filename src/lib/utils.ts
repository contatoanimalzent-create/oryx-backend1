import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { EventStatus, OperatorStatus, MissionStatus, ViolationType } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "agora";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m atrás`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h atrás`;
  return formatDate(iso);
}

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Rascunho",
  active: "Ativo",
  paused: "Pausado",
  ended: "Encerrado",
};

export const EVENT_STATUS_COLOR: Record<EventStatus, string> = {
  draft: "bg-neutral-700 text-neutral-200",
  active: "bg-green-700 text-green-100",
  paused: "bg-yellow-700 text-yellow-100",
  ended: "bg-neutral-600 text-neutral-300",
};

export const OPERATOR_STATUS_LABEL: Record<OperatorStatus, string> = {
  active: "Ativo",
  eliminated: "Eliminado",
  healing: "Em Cura",
  offline: "Offline",
  spectator: "Espectador",
};

export const OPERATOR_STATUS_COLOR: Record<OperatorStatus, string> = {
  active: "bg-green-500",
  eliminated: "bg-red-600",
  healing: "bg-yellow-500",
  offline: "bg-neutral-600",
  spectator: "bg-blue-600",
};

export const MISSION_STATUS_LABEL: Record<MissionStatus, string> = {
  pending: "Pendente",
  active: "Ativa",
  contested: "Contestada",
  completed: "Concluída",
  failed: "Falhou",
};

export const MISSION_STATUS_COLOR: Record<MissionStatus, string> = {
  pending: "bg-neutral-700 text-neutral-200",
  active: "bg-blue-700 text-blue-100",
  contested: "bg-orange-700 text-orange-100",
  completed: "bg-green-700 text-green-100",
  failed: "bg-red-700 text-red-100",
};

export const VIOLATION_TYPE_LABEL: Record<ViolationType, string> = {
  safezone_breach: "Breach Safezone",
  ammo_excess: "Munição Excessiva",
  conduct: "Conduta",
  equipment: "Equipamento",
  other: "Outro",
};
