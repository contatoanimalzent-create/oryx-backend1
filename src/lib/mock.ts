import type {
  OryxEvent,
  Faction,
  Squad,
  Operator,
  Mission,
  Zone,
  Violation,
  ChronoEntry,
  TimelineEvent,
} from "@/types";

export const MOCK_EVENTS: OryxEvent[] = [
  {
    id: "evt-1",
    name: "Operação Falcão Negro",
    location: "Campo Tático Norte — SP",
    status: "active",
    startDate: "2026-05-13T08:00:00Z",
    endDate: "2026-05-13T18:00:00Z",
    factionCount: 2,
    operatorCount: 48,
    createdAt: "2026-05-01T10:00:00Z",
  },
  {
    id: "evt-2",
    name: "Exercício ORYX Winter",
    location: "Base Serra Fria — MG",
    status: "draft",
    startDate: "2026-06-20T08:00:00Z",
    endDate: "2026-06-21T18:00:00Z",
    factionCount: 3,
    operatorCount: 0,
    createdAt: "2026-05-10T09:00:00Z",
  },
  {
    id: "evt-3",
    name: "CQB Challenge IV",
    location: "Hangar Bravo — RJ",
    status: "ended",
    startDate: "2026-04-05T09:00:00Z",
    endDate: "2026-04-05T17:00:00Z",
    factionCount: 2,
    operatorCount: 32,
    createdAt: "2026-03-15T11:00:00Z",
  },
];

export const MOCK_FACTIONS: Faction[] = [
  { id: "fac-1", eventId: "evt-1", name: "Força Alpha", color: "#3B82F6", operatorCount: 24 },
  { id: "fac-2", eventId: "evt-1", name: "Força Bravo", color: "#EF4444", operatorCount: 24 },
];

export const MOCK_SQUADS: Squad[] = [
  { id: "sq-1", eventId: "evt-1", factionId: "fac-1", name: "Alpha-1", memberCount: 8 },
  { id: "sq-2", eventId: "evt-1", factionId: "fac-1", name: "Alpha-2", memberCount: 8 },
  { id: "sq-3", eventId: "evt-1", factionId: "fac-2", name: "Bravo-1", memberCount: 8 },
  { id: "sq-4", eventId: "evt-1", factionId: "fac-2", name: "Bravo-2", memberCount: 8 },
];

const baseCoords = { lat: -23.55, lng: -46.63 };

export const MOCK_OPERATORS: Operator[] = Array.from({ length: 20 }, (_, i) => ({
  id: `op-${i + 1}`,
  callsign: `GHOST-${String(i + 1).padStart(2, "0")}`,
  factionId: i < 10 ? "fac-1" : "fac-2",
  squadId: i < 5 ? "sq-1" : i < 10 ? "sq-2" : i < 15 ? "sq-3" : "sq-4",
  status: (["active", "active", "active", "eliminated", "healing", "offline"] as const)[i % 6],
  lat: baseCoords.lat + (Math.random() - 0.5) * 0.04,
  lng: baseCoords.lng + (Math.random() - 0.5) * 0.04,
  lastSeen: new Date(Date.now() - Math.random() * 300000).toISOString(),
  batteryLevel: Math.floor(Math.random() * 100),
}));

export const MOCK_MISSIONS: Mission[] = [
  {
    id: "mis-1",
    eventId: "evt-1",
    title: "Capturar ponto Alfa",
    description: "Controlar zona central por 10 min contínuos",
    status: "active",
    assignedFactionId: "fac-1",
    progress: 60,
    startTime: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: "mis-2",
    eventId: "evt-1",
    title: "Eliminar HVT",
    description: "Neutralizar alvo de alto valor na zona industrial",
    status: "pending",
    progress: 0,
  },
  {
    id: "mis-3",
    eventId: "evt-1",
    title: "Extrair inteligência",
    description: "Recuperar pacote na casa vermelha",
    status: "completed",
    assignedFactionId: "fac-2",
    progress: 100,
    startTime: new Date(Date.now() - 7200000).toISOString(),
    endTime: new Date(Date.now() - 3600000).toISOString(),
  },
];

export const MOCK_ZONES: Zone[] = [
  {
    id: "zone-1",
    eventId: "evt-1",
    name: "Safezone Principal",
    type: "safezone",
    coordinates: [
      [-23.545, -46.635],
      [-23.545, -46.625],
      [-23.555, -46.625],
      [-23.555, -46.635],
    ],
    color: "#22C55E",
    active: true,
  },
  {
    id: "zone-2",
    eventId: "evt-1",
    name: "Objetivo Central",
    type: "objective",
    coordinates: [
      [-23.549, -46.631],
      [-23.549, -46.629],
      [-23.551, -46.629],
      [-23.551, -46.631],
    ],
    color: "#F59E0B",
    active: true,
  },
];

export const MOCK_VIOLATIONS: Violation[] = [
  {
    id: "vio-1",
    eventId: "evt-1",
    operatorId: "op-3",
    operatorCallsign: "GHOST-03",
    type: "safezone_breach",
    description: "Operador entrou na safezone com arma empunhada",
    timestamp: new Date(Date.now() - 1200000).toISOString(),
    resolved: false,
  },
  {
    id: "vio-2",
    eventId: "evt-1",
    operatorId: "op-7",
    operatorCallsign: "GHOST-07",
    type: "conduct",
    description: "Linguagem inadequada durante operação",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    resolved: true,
    moderationAction: "warn",
  },
  {
    id: "vio-3",
    eventId: "evt-1",
    operatorId: "op-12",
    operatorCallsign: "GHOST-12",
    type: "ammo_excess",
    description: "Munição acima do limite regulamentar (BB)",
    timestamp: new Date(Date.now() - 5400000).toISOString(),
    resolved: false,
  },
];

export const MOCK_CHRONO: ChronoEntry[] = MOCK_OPERATORS.slice(0, 10).map((op) => ({
  operatorId: op.id,
  callsign: op.callsign,
  factionId: op.factionId,
  totalActiveMs: Math.floor(Math.random() * 7200000 + 1800000),
  totalHealingMs: Math.floor(Math.random() * 600000),
  eliminationCount: Math.floor(Math.random() * 5),
  lastStatusChange: op.lastSeen,
}));

export const MOCK_TIMELINE: TimelineEvent[] = [
  { id: "tl-1", timestamp: new Date(Date.now() - 7000000).toISOString(), type: "mission_update", title: "Missão iniciada", description: "Capturar ponto Alfa ativada", factionId: "fac-1" },
  { id: "tl-2", timestamp: new Date(Date.now() - 6500000).toISOString(), type: "operator_status", title: "Operador eliminado", description: "GHOST-04 eliminado em zona industrial", operatorId: "op-4", operatorCallsign: "GHOST-04", factionId: "fac-1", lat: -23.551, lng: -46.630 },
  { id: "tl-3", timestamp: new Date(Date.now() - 5400000).toISOString(), type: "violation", title: "Violação detectada", description: "GHOST-12 — munição excessiva", operatorId: "op-12", operatorCallsign: "GHOST-12" },
  { id: "tl-4", timestamp: new Date(Date.now() - 3600000).toISOString(), type: "mission_update", title: "Missão concluída", description: "Extrair inteligência — completada por Força Bravo", factionId: "fac-2" },
  { id: "tl-5", timestamp: new Date(Date.now() - 1800000).toISOString(), type: "medical", title: "Ação médica", description: "GHOST-09 iniciou cura em ponto B3", operatorId: "op-9", operatorCallsign: "GHOST-09" },
  { id: "tl-6", timestamp: new Date(Date.now() - 1200000).toISOString(), type: "violation", title: "Breach safezone", description: "GHOST-03 entrou na safezone armado", operatorId: "op-3", operatorCallsign: "GHOST-03" },
];
