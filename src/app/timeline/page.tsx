"use client";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Play, Pause, SkipBack, Activity, AlertTriangle, Heart, Target, Radio } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { apiFetch, isMockMode } from "@/lib/api";
import { MOCK_TIMELINE, MOCK_FACTIONS, MOCK_EVENTS } from "@/lib/mock";
import { formatDate, cn } from "@/lib/utils";
import { useWsStore } from "@/store/ws";
import type { TimelineEvent, WsEvent } from "@/types";

const TYPE_CONFIG: Record<TimelineEvent["type"], { icon: React.ElementType; color: string; bg: string }> = {
  operator_status: { icon: Activity, color: "text-blue-400", bg: "bg-blue-900/30 border-blue-700" },
  mission_update: { icon: Target, color: "text-green-400", bg: "bg-green-900/30 border-green-700" },
  violation: { icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-900/30 border-orange-700" },
  medical: { icon: Heart, color: "text-red-400", bg: "bg-red-900/30 border-red-700" },
  zone_change: { icon: Radio, color: "text-purple-400", bg: "bg-purple-900/30 border-purple-700" },
};

export default function TimelinePage() {
  const activeEvent = MOCK_EVENTS[0];
  const { subscribe } = useWsStore();
  const [liveEvents, setLiveEvents] = useState<TimelineEvent[]>([]);
  const [playing, setPlaying] = useState(false);
  const [playbackIdx, setPlaybackIdx] = useState(0);
  const playbackRef = useRef<NodeJS.Timeout | null>(null);

  const { data: historical = [] } = useQuery<TimelineEvent[]>({
    queryKey: ["timeline", activeEvent.id],
    queryFn: () => isMockMode() ? Promise.resolve(MOCK_TIMELINE) : apiFetch(`/events/${activeEvent.id}/timeline`),
  });

  // Subscribe to live WS events and convert to timeline entries
  useEffect(() => {
    const unsub = subscribe((evt: WsEvent) => {
      let entry: TimelineEvent | null = null;
      if (evt.type === "operator.status.changed") {
        entry = {
          id: `live-${Date.now()}`,
          timestamp: evt.timestamp,
          type: "operator_status",
          title: `${evt.callsign} — ${evt.status}`,
          description: `Status alterado para ${evt.status}`,
          operatorId: evt.operatorId,
          operatorCallsign: evt.callsign,
        };
      } else if (evt.type === "rule.violation") {
        entry = {
          id: `live-${Date.now()}`,
          timestamp: evt.violation.timestamp,
          type: "violation",
          title: "Violação detectada",
          description: evt.violation.description,
          operatorId: evt.violation.operatorId,
          operatorCallsign: evt.violation.operatorCallsign,
        };
      } else if (evt.type === "medical.action") {
        entry = {
          id: `live-${Date.now()}`,
          timestamp: evt.action.timestamp,
          type: "medical",
          title: `Ação médica: ${evt.action.actionType}`,
          description: `${evt.action.operatorCallsign} — ${evt.action.actionType}`,
          operatorId: evt.action.operatorId,
          operatorCallsign: evt.action.operatorCallsign,
          lat: evt.action.location?.lat,
          lng: evt.action.location?.lng,
        };
      } else if (evt.type === "mission.updated") {
        entry = {
          id: `live-${Date.now()}`,
          timestamp: evt.timestamp,
          type: "mission_update",
          title: `Missão atualizada`,
          description: `Status: ${evt.status} · Progresso: ${evt.progress}%`,
        };
      }
      if (entry) setLiveEvents((prev) => [entry!, ...prev].slice(0, 100));
    });
    return unsub;
  }, [subscribe]);

  // Playback logic
  const allEvents = [...historical].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  useEffect(() => {
    if (!playing) {
      if (playbackRef.current) clearInterval(playbackRef.current);
      return;
    }
    playbackRef.current = setInterval(() => {
      setPlaybackIdx((i) => {
        if (i >= allEvents.length - 1) { setPlaying(false); return i; }
        return i + 1;
      });
    }, 800);
    return () => { if (playbackRef.current) clearInterval(playbackRef.current); };
  }, [playing, allEvents.length]);

  const displayEvents = [...liveEvents, ...historical].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const playbackEvent = allEvents[playbackIdx];

  return (
    <AppShell>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Clock size={20} className="text-purple-400" />
              <h1 className="text-2xl font-bold text-white">Timeline / AAR</h1>
            </div>
            <p className="text-neutral-400 text-sm">{activeEvent.name} · After Action Review</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Live
          </div>
        </div>

        {/* Playback bar */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs text-neutral-500 font-semibold uppercase tracking-wider">Playback</span>
            <button
              onClick={() => { setPlaybackIdx(0); setPlaying(false); }}
              className="p-1.5 text-neutral-500 hover:text-white transition-colors rounded hover:bg-neutral-800"
            >
              <SkipBack size={14} />
            </button>
            <button
              onClick={() => setPlaying(!playing)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition-colors"
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
              {playing ? "Pausar" : "Play"}
            </button>
            <span className="text-xs text-neutral-500">{playbackIdx + 1}/{allEvents.length}</span>
          </div>

          {/* Scrubber */}
          <input
            type="range"
            min={0}
            max={Math.max(0, allEvents.length - 1)}
            value={playbackIdx}
            onChange={(e) => { setPlaybackIdx(Number(e.target.value)); setPlaying(false); }}
            className="w-full accent-blue-500"
          />

          {/* Current playback event */}
          {playbackEvent && (
            <div className={cn("mt-3 p-3 rounded border text-sm", TYPE_CONFIG[playbackEvent.type]?.bg ?? "bg-neutral-800 border-neutral-700")}>
              <div className="flex items-center gap-2 mb-0.5">
                {(() => { const Ic = TYPE_CONFIG[playbackEvent.type]?.icon; return Ic ? <Ic size={13} className={TYPE_CONFIG[playbackEvent.type]?.color} /> : null; })()}
                <span className="font-semibold text-white">{playbackEvent.title}</span>
                <span className="ml-auto text-xs text-neutral-500">{formatDate(playbackEvent.timestamp)}</span>
              </div>
              <p className="text-neutral-400 text-xs">{playbackEvent.description}</p>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex gap-3 flex-wrap mb-4">
          {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
            const Ic = cfg.icon;
            return (
              <div key={type} className="flex items-center gap-1.5 text-xs text-neutral-400">
                <Ic size={12} className={cfg.color} />
                <span>{{
                  operator_status: "Status Op.",
                  mission_update: "Missão",
                  violation: "Violação",
                  medical: "Médico",
                  zone_change: "Zona",
                }[type]}</span>
              </div>
            );
          })}
        </div>

        {/* Timeline list */}
        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-px bg-neutral-800" />
          <div className="space-y-3 pl-14">
            {displayEvents.map((evt) => {
              const cfg = TYPE_CONFIG[evt.type] ?? { icon: Activity, color: "text-neutral-400", bg: "bg-neutral-800 border-neutral-700" };
              const Icon = cfg.icon;
              const faction = evt.factionId ? MOCK_FACTIONS.find((f) => f.id === evt.factionId) : null;
              const isLive = liveEvents.some((l) => l.id === evt.id);

              return (
                <div key={evt.id} className="relative">
                  {/* Dot on timeline */}
                  <div className={cn("absolute -left-8 w-4 h-4 rounded-full flex items-center justify-center border", cfg.bg)}>
                    <Icon size={8} className={cfg.color} />
                  </div>

                  <div className={cn("p-3 rounded-lg border transition-colors", cfg.bg, isLive && "ring-1 ring-blue-500/50")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-white">{evt.title}</span>
                          {isLive && <Badge className="bg-blue-900/50 text-blue-300 text-xs">LIVE</Badge>}
                          {faction && <span className="text-xs font-medium" style={{ color: faction.color }}>{faction.name}</span>}
                        </div>
                        <p className="text-xs text-neutral-400">{evt.description}</p>
                        {evt.operatorCallsign && (
                          <span className="text-xs font-mono text-neutral-500">→ {evt.operatorCallsign}</span>
                        )}
                      </div>
                      <time className="text-xs text-neutral-600 whitespace-nowrap flex-shrink-0">{formatDate(evt.timestamp)}</time>
                    </div>
                  </div>
                </div>
              );
            })}
            {displayEvents.length === 0 && (
              <div className="text-center py-16 text-neutral-600">Nenhum evento registrado.</div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
