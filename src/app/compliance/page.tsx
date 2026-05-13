"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/Modal";
import { Modal } from "@/components/ui/Modal";
import { apiFetch, isMockMode } from "@/lib/api";
import { MOCK_VIOLATIONS, MOCK_CHRONO, MOCK_FACTIONS, MOCK_EVENTS } from "@/lib/mock";
import { VIOLATION_TYPE_LABEL, formatDate, formatDuration, cn } from "@/lib/utils";
import type { Violation, ChronoEntry, ModerationAction } from "@/types";

const MODERATION_OPTS: { value: ModerationAction; label: string; danger: boolean; confirm: string }[] = [
  { value: "warn", label: "Advertir", danger: false, confirm: "Emitir advertência formal para este operador?" },
  { value: "remove", label: "Remover do Evento", danger: true, confirm: "Remover este operador do evento atual? Ele perderá acesso ao jogo." },
  { value: "ban", label: "Banir", danger: true, confirm: "Banir permanentemente este operador do evento? Esta ação não pode ser desfeita." },
];

export default function CompliancePage() {
  const qc = useQueryClient();
  const activeEvent = MOCK_EVENTS[0];
  const [activeTab, setActiveTab] = useState<"violations" | "chrono">("violations");
  const [filterResolved, setFilterResolved] = useState<"all" | "open" | "resolved">("open");
  const [moderateTarget, setModerateTarget] = useState<{ violation: Violation; action: ModerationAction } | null>(null);
  const [detailViolation, setDetailViolation] = useState<Violation | null>(null);

  const { data: violations = [] } = useQuery<Violation[]>({
    queryKey: ["violations", activeEvent.id],
    queryFn: () => isMockMode() ? Promise.resolve(MOCK_VIOLATIONS) : apiFetch(`/events/${activeEvent.id}/violations`),
  });

  const { data: chrono = [] } = useQuery<ChronoEntry[]>({
    queryKey: ["chrono", activeEvent.id],
    queryFn: () => isMockMode() ? Promise.resolve(MOCK_CHRONO) : apiFetch(`/events/${activeEvent.id}/compliance/chrono`),
  });

  const moderateMutation = useMutation({
    mutationFn: async ({ violationId, action }: { violationId: string; action: ModerationAction }) => {
      if (isMockMode()) {
        qc.setQueryData<Violation[]>(["violations", activeEvent.id], (prev = []) =>
          prev.map((v) => v.id === violationId ? { ...v, resolved: true, moderationAction: action } : v)
        );
        return;
      }
      return apiFetch(`/events/${activeEvent.id}/violations/${violationId}/moderate`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["violations"] }),
  });

  const filtered = violations.filter((v) => {
    if (filterResolved === "open") return !v.resolved;
    if (filterResolved === "resolved") return v.resolved;
    return true;
  });

  const openCount = violations.filter((v) => !v.resolved).length;

  return (
    <AppShell>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert size={20} className="text-orange-400" />
              <h1 className="text-2xl font-bold text-white">Compliance FABE</h1>
            </div>
            <p className="text-neutral-400 text-sm">{activeEvent.name}</p>
          </div>
          {openCount > 0 && (
            <div className="flex items-center gap-2 bg-red-900/30 border border-red-800 rounded-lg px-4 py-2">
              <AlertTriangle size={16} className="text-red-400" />
              <span className="text-red-300 text-sm font-semibold">{openCount} violação(ões) em aberto</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-800 mb-6">
          {(["violations", "chrono"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn("px-4 py-2.5 text-sm font-semibold transition-colors border-b-2", activeTab === tab ? "text-blue-400 border-blue-500" : "text-neutral-500 border-transparent hover:text-neutral-300")}
            >
              {tab === "violations" ? "Violações" : <><Clock size={13} className="inline mr-1" />Cronagem</>}
            </button>
          ))}
        </div>

        {activeTab === "violations" && (
          <>
            {/* Filter */}
            <div className="flex gap-2 mb-4">
              {([["all", "Todas"], ["open", "Em aberto"], ["resolved", "Resolvidas"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilterResolved(val)}
                  className={cn("px-3 py-1.5 rounded text-xs font-semibold transition-colors", filterResolved === val ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white")}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Violations table */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-neutral-500">Nenhuma violação encontrada.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3">Operador</th>
                      <th className="text-left px-4 py-3">Tipo</th>
                      <th className="text-left px-4 py-3">Descrição</th>
                      <th className="text-left px-4 py-3">Data/Hora</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-right px-4 py-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((v) => (
                      <tr key={v.id} className="border-b border-neutral-800/50 hover:bg-neutral-900 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-white">{v.operatorCallsign}</td>
                        <td className="px-4 py-3">
                          <Badge className="bg-orange-900/50 text-orange-300 border border-orange-800">
                            {VIOLATION_TYPE_LABEL[v.type]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-neutral-400 max-w-xs truncate">{v.description}</td>
                        <td className="px-4 py-3 text-neutral-500 text-xs">{formatDate(v.timestamp)}</td>
                        <td className="px-4 py-3">
                          {v.resolved ? (
                            <div className="flex items-center gap-1.5">
                              <CheckCircle size={13} className="text-green-400" />
                              <span className="text-xs text-green-400">Resolvido</span>
                              {v.moderationAction && <Badge className="bg-neutral-800 text-neutral-300 ml-1">{v.moderationAction}</Badge>}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <AlertTriangle size={13} className="text-orange-400" />
                              <span className="text-xs text-orange-400">Em aberto</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setDetailViolation(v)}>Detalhes</Button>
                            {!v.resolved && MODERATION_OPTS.map((opt) => (
                              <Button
                                key={opt.value}
                                variant={opt.danger ? "danger" : "secondary"}
                                size="sm"
                                onClick={() => setModerateTarget({ violation: v, action: opt.value })}
                              >
                                {opt.label}
                              </Button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {activeTab === "chrono" && (
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
            {chrono.length === 0 ? (
              <div className="text-center py-12 text-neutral-500">Sem dados de cronagem.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Callsign</th>
                    <th className="text-left px-4 py-3">Facção</th>
                    <th className="text-left px-4 py-3">Tempo Ativo</th>
                    <th className="text-left px-4 py-3">Tempo em Cura</th>
                    <th className="text-left px-4 py-3">Eliminações</th>
                    <th className="text-left px-4 py-3">Última Mudança</th>
                  </tr>
                </thead>
                <tbody>
                  {chrono.sort((a, b) => b.totalActiveMs - a.totalActiveMs).map((entry) => {
                    const faction = MOCK_FACTIONS.find((f) => f.id === entry.factionId);
                    return (
                      <tr key={entry.operatorId} className="border-b border-neutral-800/50 hover:bg-neutral-900 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-white">{entry.callsign}</td>
                        <td className="px-4 py-3">
                          {faction && <span style={{ color: faction.color }} className="font-semibold text-xs">{faction.name}</span>}
                        </td>
                        <td className="px-4 py-3 text-neutral-300 tabular-nums">{formatDuration(entry.totalActiveMs)}</td>
                        <td className="px-4 py-3 text-yellow-400 tabular-nums">{formatDuration(entry.totalHealingMs)}</td>
                        <td className="px-4 py-3 text-red-400 font-semibold">{entry.eliminationCount}</td>
                        <td className="px-4 py-3 text-neutral-500 text-xs">{formatDate(entry.lastStatusChange)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Moderation Confirm */}
      {moderateTarget && (
        <ConfirmModal
          open
          onClose={() => setModerateTarget(null)}
          onConfirm={() => moderateMutation.mutate({ violationId: moderateTarget.violation.id, action: moderateTarget.action })}
          title={`Moderação: ${MODERATION_OPTS.find((o) => o.value === moderateTarget.action)?.label}`}
          message={`${MODERATION_OPTS.find((o) => o.value === moderateTarget.action)?.confirm}\n\nOperador: ${moderateTarget.violation.operatorCallsign}`}
          confirmLabel={MODERATION_OPTS.find((o) => o.value === moderateTarget.action)?.label}
          danger={MODERATION_OPTS.find((o) => o.value === moderateTarget.action)?.danger}
        />
      )}

      {/* Detail Modal */}
      <Modal open={!!detailViolation} onClose={() => setDetailViolation(null)} title="Detalhes da Violação">
        {detailViolation && (
          <div className="space-y-3 text-sm">
            <div><span className="text-neutral-500">Operador:</span> <span className="text-white font-mono font-bold">{detailViolation.operatorCallsign}</span></div>
            <div><span className="text-neutral-500">Tipo:</span> <span className="text-orange-300">{VIOLATION_TYPE_LABEL[detailViolation.type]}</span></div>
            <div><span className="text-neutral-500">Descrição:</span> <span className="text-neutral-200">{detailViolation.description}</span></div>
            <div><span className="text-neutral-500">Data/Hora:</span> <span className="text-neutral-300">{formatDate(detailViolation.timestamp)}</span></div>
            <div><span className="text-neutral-500">Status:</span> <span className={detailViolation.resolved ? "text-green-400" : "text-orange-400"}>{detailViolation.resolved ? "Resolvido" : "Em aberto"}</span></div>
            {detailViolation.moderationAction && <div><span className="text-neutral-500">Ação:</span> <span className="text-neutral-200">{detailViolation.moderationAction}</span></div>}
            <div className="pt-2 flex justify-end">
              <Button variant="secondary" onClick={() => setDetailViolation(null)}>Fechar</Button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
