"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Plus, Target, MapPin, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { apiFetch, isMockMode } from "@/lib/api";
import { MOCK_MISSIONS, MOCK_ZONES, MOCK_FACTIONS, MOCK_EVENTS } from "@/lib/mock";
import { MISSION_STATUS_COLOR, MISSION_STATUS_LABEL, cn } from "@/lib/utils";
import type { Mission, Zone, Faction, MissionStatus, ZoneType, CreateMissionPayload, CreateZonePayload } from "@/types";

const OperatorMap = dynamic(
  () => import("@/components/map/OperatorMap").then((m) => m.OperatorMap),
  { ssr: false, loading: () => <div className="h-full flex items-center justify-center text-neutral-500 text-sm">Carregando mapa...</div> }
);

const ZONE_TYPES: { value: ZoneType; label: string; color: string }[] = [
  { value: "safezone", label: "Safezone", color: "#22C55E" },
  { value: "objective", label: "Objetivo", color: "#F59E0B" },
  { value: "exclusion", label: "Exclusão", color: "#EF4444" },
  { value: "spawn", label: "Spawn", color: "#3B82F6" },
];

export default function MissionsPage() {
  const qc = useQueryClient();
  const activeEvent = MOCK_EVENTS[0];
  const [activeTab, setActiveTab] = useState<"missions" | "zones">("missions");

  const { data: missions = [], isLoading: mLoading } = useQuery<Mission[]>({
    queryKey: ["missions", activeEvent.id],
    queryFn: () => isMockMode() ? Promise.resolve(MOCK_MISSIONS) : apiFetch(`/events/${activeEvent.id}/missions`),
  });

  const { data: zones = [] } = useQuery<Zone[]>({
    queryKey: ["zones", activeEvent.id],
    queryFn: () => isMockMode() ? Promise.resolve(MOCK_ZONES) : apiFetch(`/events/${activeEvent.id}/zones`),
  });

  const { data: factions = [] } = useQuery<Faction[]>({
    queryKey: ["factions", activeEvent.id],
    queryFn: () => isMockMode() ? Promise.resolve(MOCK_FACTIONS) : apiFetch(`/events/${activeEvent.id}/factions`),
  });

  const [missionModal, setMissionModal] = useState(false);
  const [zoneModal, setZoneModal] = useState(false);
  const [mForm, setMForm] = useState<CreateMissionPayload>({ title: "", description: "" });
  const [zForm, setZForm] = useState<CreateZonePayload>({ name: "", type: "objective", coordinates: [], color: "#F59E0B" });

  const createMission = useMutation({
    mutationFn: async (payload: CreateMissionPayload) => {
      if (isMockMode()) {
        const m: Mission = { ...payload, id: `mis-${Date.now()}`, eventId: activeEvent.id, status: "pending", progress: 0 };
        qc.setQueryData<Mission[]>(["missions", activeEvent.id], (prev = []) => [...prev, m]);
        return m;
      }
      return apiFetch<Mission>(`/events/${activeEvent.id}/missions`, { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["missions"] }); setMissionModal(false); },
  });

  const createZone = useMutation({
    mutationFn: async (payload: CreateZonePayload) => {
      if (isMockMode()) {
        const z: Zone = { ...payload, id: `zone-${Date.now()}`, eventId: activeEvent.id, active: true };
        qc.setQueryData<Zone[]>(["zones", activeEvent.id], (prev = []) => [...prev, z]);
        return z;
      }
      return apiFetch<Zone>(`/events/${activeEvent.id}/zones`, { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["zones"] }); setZoneModal(false); },
  });

  const statusGroups: Record<MissionStatus, Mission[]> = {
    active: [], contested: [], pending: [], completed: [], failed: [],
  };
  missions.forEach((m) => statusGroups[m.status]?.push(m));

  return (
    <AppShell>
      <div className="flex h-screen overflow-hidden">
        {/* Left panel */}
        <div className="w-96 flex flex-col border-r border-neutral-800 bg-neutral-950 flex-shrink-0">
          {/* Tabs */}
          <div className="flex border-b border-neutral-800">
            {(["missions", "zones"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn("flex-1 py-3 text-sm font-semibold transition-colors", activeTab === tab ? "text-blue-400 border-b-2 border-blue-500" : "text-neutral-500 hover:text-neutral-300")}
              >
                {tab === "missions" ? <><Target size={14} className="inline mr-1.5" />Missões</> : <><MapPin size={14} className="inline mr-1.5" />Zonas</>}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === "missions" && (
              <div>
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                  <span className="text-sm text-neutral-400">{missions.length} missão(ões)</span>
                  <Button size="sm" onClick={() => { setMForm({ title: "", description: "" }); setMissionModal(true); }}>
                    <Plus size={13} /> Nova
                  </Button>
                </div>
                {mLoading ? (
                  <div className="text-center py-10 text-neutral-500">Carregando...</div>
                ) : (
                  <div className="divide-y divide-neutral-800">
                    {missions.map((m) => {
                      const faction = factions.find((f) => f.id === m.assignedFactionId);
                      return (
                        <div key={m.id} className="p-4 hover:bg-neutral-900 transition-colors">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="text-sm font-semibold text-white">{m.title}</span>
                            <Badge className={MISSION_STATUS_COLOR[m.status]}>{MISSION_STATUS_LABEL[m.status]}</Badge>
                          </div>
                          <p className="text-xs text-neutral-500 mb-2">{m.description}</p>
                          {faction && <div className="text-xs" style={{ color: faction.color }}>{faction.name}</div>}
                          {m.status === "active" && (
                            <div className="mt-2">
                              <div className="flex justify-between text-xs text-neutral-500 mb-1">
                                <span>Progresso</span><span>{m.progress}%</span>
                              </div>
                              <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${m.progress}%` }} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {missions.length === 0 && <div className="text-center py-10 text-neutral-600 text-sm">Sem missões.</div>}
                  </div>
                )}
              </div>
            )}

            {activeTab === "zones" && (
              <div>
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                  <span className="text-sm text-neutral-400">{zones.length} zona(s)</span>
                  <Button size="sm" onClick={() => { setZForm({ name: "", type: "objective", coordinates: [], color: "#F59E0B" }); setZoneModal(true); }}>
                    <Plus size={13} /> Nova
                  </Button>
                </div>
                <div className="divide-y divide-neutral-800">
                  {zones.map((z) => {
                    const zt = ZONE_TYPES.find((t) => t.value === z.type);
                    return (
                      <div key={z.id} className="p-4 hover:bg-neutral-900 transition-colors flex items-center gap-3">
                        <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: z.color ?? zt?.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{z.name}</div>
                          <div className="text-xs text-neutral-500">{zt?.label} · {z.coordinates.length} vértices</div>
                        </div>
                        <div className={cn("w-1.5 h-1.5 rounded-full", z.active ? "bg-green-500" : "bg-neutral-600")} />
                      </div>
                    );
                  })}
                  {zones.length === 0 && <div className="text-center py-10 text-neutral-600 text-sm">Sem zonas.</div>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 p-4 bg-neutral-900">
          <OperatorMap operators={[]} zones={zones} factions={factions} />
        </div>
      </div>

      {/* Mission Modal */}
      <Modal open={missionModal} onClose={() => setMissionModal(false)} title="Nova Missão">
        <form onSubmit={(e) => { e.preventDefault(); createMission.mutate(mForm); }} className="space-y-4">
          <Input label="Título" value={mForm.title} onChange={(e) => setMForm({ ...mForm, title: e.target.value })} required />
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Descrição</label>
            <textarea
              value={mForm.description}
              onChange={(e) => setMForm({ ...mForm, description: e.target.value })}
              rows={3}
              className="w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Facção (opcional)</label>
            <select
              value={mForm.assignedFactionId ?? ""}
              onChange={(e) => setMForm({ ...mForm, assignedFactionId: e.target.value || undefined })}
              className="w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Nenhuma</option>
              {factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setMissionModal(false)}>Cancelar</Button>
            <Button type="submit" disabled={createMission.isPending}>Criar</Button>
          </div>
        </form>
      </Modal>

      {/* Zone Modal */}
      <Modal open={zoneModal} onClose={() => setZoneModal(false)} title="Nova Zona">
        <form onSubmit={(e) => { e.preventDefault(); createZone.mutate(zForm); }} className="space-y-4">
          <Input label="Nome" value={zForm.name} onChange={(e) => setZForm({ ...zForm, name: e.target.value })} required />
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Tipo</label>
            <select
              value={zForm.type}
              onChange={(e) => {
                const zt = ZONE_TYPES.find((t) => t.value === e.target.value as ZoneType);
                setZForm({ ...zForm, type: e.target.value as ZoneType, color: zt?.color });
              }}
              className="w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ZONE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Cor</label>
            <input
              type="color"
              value={zForm.color ?? "#F59E0B"}
              onChange={(e) => setZForm({ ...zForm, color: e.target.value })}
              className="w-12 h-8 rounded cursor-pointer bg-transparent border border-neutral-700"
            />
          </div>
          <p className="text-xs text-neutral-500">Coordenadas: defina via mapa (integração futura) ou via API com array [lat,lng][].</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setZoneModal(false)}>Cancelar</Button>
            <Button type="submit" disabled={createZone.isPending}>Criar</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
