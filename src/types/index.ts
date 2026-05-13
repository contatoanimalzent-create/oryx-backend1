// ─── Auth ────────────────────────────────────────────────────────────────────
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "operator";
}

// ─── Events ──────────────────────────────────────────────────────────────────
export type EventStatus = "draft" | "active" | "paused" | "ended";

export interface OryxEvent {
  id: string;
  name: string;
  location: string;
  status: EventStatus;
  startDate: string;
  endDate: string;
  factionCount: number;
  operatorCount: number;
  createdAt: string;
}

export interface CreateEventPayload {
  name: string;
  location: string;
  startDate: string;
  endDate: string;
}

// ─── Factions / Squads ───────────────────────────────────────────────────────
export interface Faction {
  id: string;
  eventId: string;
  name: string;
  color: string;
  operatorCount: number;
}

export interface Squad {
  id: string;
  eventId: string;
  factionId: string;
  name: string;
  memberCount: number;
}

// ─── Operators ───────────────────────────────────────────────────────────────
export type OperatorStatus =
  | "active"
  | "eliminated"
  | "healing"
  | "offline"
  | "spectator";

export interface Operator {
  id: string;
  callsign: string;
  factionId: string;
  squadId: string;
  status: OperatorStatus;
  lat: number;
  lng: number;
  lastSeen: string;
  batteryLevel?: number;
}

// ─── Missions ────────────────────────────────────────────────────────────────
export type MissionStatus =
  | "pending"
  | "active"
  | "contested"
  | "completed"
  | "failed";

export interface Mission {
  id: string;
  eventId: string;
  title: string;
  description: string;
  status: MissionStatus;
  assignedFactionId?: string;
  progress: number;
  startTime?: string;
  endTime?: string;
}

export interface CreateMissionPayload {
  title: string;
  description: string;
  assignedFactionId?: string;
}

// ─── Zones ───────────────────────────────────────────────────────────────────
export type ZoneType = "safezone" | "objective" | "exclusion" | "spawn";

export interface Zone {
  id: string;
  eventId: string;
  name: string;
  type: ZoneType;
  coordinates: [number, number][];
  color?: string;
  active: boolean;
}

export interface CreateZonePayload {
  name: string;
  type: ZoneType;
  coordinates: [number, number][];
  color?: string;
}

// ─── Compliance / Violations ─────────────────────────────────────────────────
export type ViolationType =
  | "safezone_breach"
  | "ammo_excess"
  | "conduct"
  | "equipment"
  | "other";

export type ModerationAction = "warn" | "remove" | "ban";

export interface Violation {
  id: string;
  eventId: string;
  operatorId: string;
  operatorCallsign: string;
  type: ViolationType;
  description: string;
  timestamp: string;
  resolved: boolean;
  moderationAction?: ModerationAction;
}

export interface ChronoEntry {
  operatorId: string;
  callsign: string;
  factionId: string;
  totalActiveMs: number;
  totalHealingMs: number;
  eliminationCount: number;
  lastStatusChange: string;
}

// ─── Medical ─────────────────────────────────────────────────────────────────
export interface MedicalAction {
  id: string;
  operatorId: string;
  operatorCallsign: string;
  actionType: "heal_start" | "heal_end" | "revive";
  timestamp: string;
  location?: { lat: number; lng: number };
}

// ─── WebSocket events ────────────────────────────────────────────────────────
export interface WsPositionUpdated {
  type: "position.updated";
  operatorId: string;
  lat: number;
  lng: number;
  timestamp: string;
}

export interface WsOperatorStatusChanged {
  type: "operator.status.changed";
  operatorId: string;
  callsign: string;
  status: OperatorStatus;
  timestamp: string;
}

export interface WsMissionUpdated {
  type: "mission.updated";
  missionId: string;
  status: MissionStatus;
  progress: number;
  timestamp: string;
}

export interface WsRuleViolation {
  type: "rule.violation";
  violation: Violation;
}

export interface WsMedicalAction {
  type: "medical.action";
  action: MedicalAction;
}

export type WsEvent =
  | WsPositionUpdated
  | WsOperatorStatusChanged
  | WsMissionUpdated
  | WsRuleViolation
  | WsMedicalAction;

// ─── Timeline ─────────────────────────────────────────────────────────────────
export interface TimelineEvent {
  id: string;
  timestamp: string;
  type:
    | "operator_status"
    | "mission_update"
    | "violation"
    | "medical"
    | "zone_change";
  title: string;
  description: string;
  operatorId?: string;
  operatorCallsign?: string;
  factionId?: string;
  lat?: number;
  lng?: number;
}
