"use client";
import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { Radio, Users, Filter, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { useOperatorStore } from "@/store/operators";
import { useWsStore } from "@/store/ws";
import { MOCK_FACTIONS, MOCK_ZONES, MOCK_EVENTS } from "@/lib/mock";
import { OPERATOR_STATUS_COLOR, OPERATOR_STATUS_LABEL, relativeTime } from "@/lib/utils";
import type { Faction, Zone, OperatorStatus } from "@/types";
import { isMockMode, apiFetch } from "@/lib/api";

const OperatorMap = dynamic(
  () => import("@/components/map/OperatorMap").then((m) => m.OperatorMap),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center text-neutral-500">Carregando mapa...</div> }
);

const STATUS_OPTS: OperatorStatus[] = ["active", "eliminated", "healing", "offline", "spectator"];

export default function MapPage() {
  const operators = useOperatorStore((s) => Object.values(s.operators));
  const connected = useWsStore((s) => s.connected);
  const [filterFaction, setFilterFaction] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<OperatorStatus | "all">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [activeEvent] = useState(MOCK_EVENTS[0]);

  const { data: factions = [] } = useQuery<Faction[]>({
    queryKey: ["factions", activeEvent?.id],
    queryFn: () => isMockMode() ? Promise.resolve(MOCK_FACTIONS) : apiFetch(`/events/${activeEvent?.id}/factions`),
    enabled: !!activeEvent,
  });

  const { data: zones = [] } = useQuery<Zone[]>({
    queryKey: ["zones", activeEvent?.id],
    queryFn: () => isMockMode() ? Promise.resolve(MOCK_ZONES) : apiFetch(`/events/${activeEvent?.id}/zones`),
    enabled: !!activeEvent,
  });

  const filtered = useMemo(() => {
    return operators.filter((op) => {
      if (filterFaction !== "all" && op.factionId !== filterFaction) return false;
      if (filterStatus !== "all" && op.status !== filterStatus) return false;
      return true;
    });
  }, [operators, filterFaction, filterStatus]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    operators.forEach((op) => { counts[op.status] = (counts[op.status] ?? 0) + 1; });
    return counts;
  }, [operators]);

  return (
    <AppShell>
      <div className="flex flex-col h-screen">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-neutral-600"}`} />
            <h1 className="text-lg font-bold text-white">Mapa em Tempo Real</h1>
            {activeEvent && <span className="text-neutral-400 text-sm">— {activeEvent.name}</span>}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs text-neutral-500">
              <Users size={13} />
              <span>{filtered.length}/{operators.length} operadores</span>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${showFilters ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"}`}
            >
              <Filter size={12} /> Filtros
            </button>
          </div>
        </div>

        {/* Status bar */}
        <div className="flex gap-3 px-6 py-2 border-b border-neutral-800 bg-neutral-950 flex-wrap flex-shrink-0">
          {STATUS_OPTS.map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${OPERATOR_STATUS_COLOR[s]}`} />
              <span className="text-xs text-neutral-400">{OPERATOR_STATUS_LABEL[s]}: <span className="text-white font-semibold">{statusCounts[s] ?? 0}</span></span>
            </div>
          ))}
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="flex gap-6 px-6 py-3 border-b border-neutral-800 bg-neutral-900 flex-shrink-0 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500 font-medium">Facção:</span>
              <select
                value={filterFaction}
                onChange={(e) => setFilterFaction(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">Todas</option>
                {factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500 font-medium">Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as OperatorStatus | "all")}
                className="bg-neutral-800 border border-neutral-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">Todos</option>
                {STATUS_OPTS.map((s) => <option key={s} value={s}>{OPERATOR_STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Map */}
          <div className="flex-1 p-4">
            <OperatorMap
              operators={filtered}
              zones={zones}
              factions={factions}
            />
          </div>

          {/* Operator list panel */}
          <div className="w-72 border-l border-neutral-800 overflow-y-auto bg-neutral-950 flex-shrink-0">
            <div className="px-4 py-3 border-b border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-300">Operadores</h3>
            </div>
            <div className="divide-y divide-neutral-800">
              {filtered.map((op) => {
                const faction = factions.find((f) => f.id === op.factionId);
                return (
                  <div key={op.id} className="px-4 py-3 hover:bg-neutral-900 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-mono font-bold text-white">{op.callsign}</span>
                      <div className={`w-2 h-2 rounded-full ${OPERATOR_STATUS_COLOR[op.status]}`} />
                    </div>
                    <div className="text-xs text-neutral-500 flex items-center gap-2">
                      {faction && (
                        <span style={{ color: faction.color }} className="font-medium">{faction.name}</span>
                      )}
                      <span>·</span>
                      <span>{OPERATOR_STATUS_LABEL[op.status]}</span>
                    </div>
                    <div className="text-xs text-neutral-600 mt-0.5">{relativeTime(op.lastSeen)}</div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="px-4 py-8 text-center text-neutral-600 text-xs">Nenhum operador visível</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
