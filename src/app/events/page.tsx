"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Play, X, Pencil } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiFetch, isMockMode } from "@/lib/api";
import { MOCK_EVENTS } from "@/lib/mock";
import { EVENT_STATUS_COLOR, EVENT_STATUS_LABEL, formatDate } from "@/lib/utils";
import type { OryxEvent, EventStatus, CreateEventPayload } from "@/types";

function fetchEvents(): Promise<OryxEvent[]> {
  if (isMockMode()) return Promise.resolve(MOCK_EVENTS);
  return apiFetch<OryxEvent[]>("/events");
}

const STATUS_FILTERS: { label: string; value: EventStatus | "all" }[] = [
  { label: "Todos", value: "all" },
  { label: "Ativos", value: "active" },
  { label: "Rascunho", value: "draft" },
  { label: "Pausados", value: "paused" },
  { label: "Encerrados", value: "ended" },
];

export default function EventsPage() {
  const qc = useQueryClient();
  const { data: events = [], isLoading, refetch } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });

  const [filter, setFilter] = useState<EventStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<OryxEvent | null>(null);
  const [activateConfirm, setActivateConfirm] = useState<OryxEvent | null>(null);
  const [endConfirm, setEndConfirm] = useState<OryxEvent | null>(null);

  // Form state
  const [form, setForm] = useState<CreateEventPayload>({ name: "", location: "", startDate: "", endDate: "" });

  const mockEvents = isMockMode()
    ? { data: MOCK_EVENTS, setData: (fn: (prev: OryxEvent[]) => OryxEvent[]) => qc.setQueryData(["events"], fn) }
    : null;

  const createMutation = useMutation({
    mutationFn: async (payload: CreateEventPayload) => {
      if (isMockMode()) {
        const newEvent: OryxEvent = { ...payload, id: `evt-${Date.now()}`, status: "draft", factionCount: 0, operatorCount: 0, createdAt: new Date().toISOString() };
        mockEvents?.setData((prev) => [newEvent, ...prev]);
        return newEvent;
      }
      return apiFetch<OryxEvent>("/events", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); setCreateOpen(false); },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<CreateEventPayload> }) => {
      if (isMockMode()) {
        mockEvents?.setData((prev) => prev.map((e) => e.id === id ? { ...e, ...payload } : e));
        return;
      }
      return apiFetch<OryxEvent>(`/events/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); setEditEvent(null); },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isMockMode()) {
        mockEvents?.setData((prev) => prev.map((e) => e.id === id ? { ...e, status: "active" as EventStatus } : e));
        return;
      }
      return apiFetch(`/events/${id}/activate`, { method: "POST" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });

  const endMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isMockMode()) {
        mockEvents?.setData((prev) => prev.map((e) => e.id === id ? { ...e, status: "ended" as EventStatus } : e));
        return;
      }
      return apiFetch(`/events/${id}`, { method: "PATCH", body: JSON.stringify({ status: "ended" }) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });

  const filtered = filter === "all" ? events : events.filter((e) => e.status === filter);

  function openEdit(evt: OryxEvent) {
    setEditEvent(evt);
    setForm({ name: evt.name, location: evt.location, startDate: evt.startDate.slice(0, 16), endDate: evt.endDate.slice(0, 16) });
  }

  function openCreate() {
    setForm({ name: "", location: "", startDate: "", endDate: "" });
    setCreateOpen(true);
  }

  return (
    <AppShell>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Eventos</h1>
            <p className="text-neutral-400 text-sm mt-0.5">{events.length} evento(s) cadastrado(s)</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw size={14} /> Atualizar
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus size={14} /> Novo Evento
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {STATUS_FILTERS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${filter === value ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="text-center text-neutral-500 py-16">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-neutral-500 py-16">Nenhum evento encontrado.</div>
        ) : (
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Nome</th>
                  <th className="text-left px-4 py-3">Local</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Início</th>
                  <th className="text-left px-4 py-3">Operadores</th>
                  <th className="text-right px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((evt) => (
                  <tr key={evt.id} className="border-b border-neutral-800/50 hover:bg-neutral-900 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{evt.name}</td>
                    <td className="px-4 py-3 text-neutral-400">{evt.location}</td>
                    <td className="px-4 py-3">
                      <Badge className={EVENT_STATUS_COLOR[evt.status]}>{EVENT_STATUS_LABEL[evt.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-400 text-xs">{formatDate(evt.startDate)}</td>
                    <td className="px-4 py-3 text-neutral-300">{evt.operatorCount}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(evt)}>
                          <Pencil size={13} />
                        </Button>
                        {(evt.status === "draft" || evt.status === "paused") && (
                          <Button size="sm" onClick={() => setActivateConfirm(evt)}>
                            <Play size={13} /> Ativar
                          </Button>
                        )}
                        {evt.status === "active" && (
                          <Button variant="danger" size="sm" onClick={() => setEndConfirm(evt)}>
                            <X size={13} /> Encerrar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Novo Evento">
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }} className="space-y-4">
          <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Local" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required />
          <Input label="Início" type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
          <Input label="Fim" type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "Criar Evento"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editEvent} onClose={() => setEditEvent(null)} title="Editar Evento">
        <form onSubmit={(e) => { e.preventDefault(); if (editEvent) editMutation.mutate({ id: editEvent.id, payload: form }); }} className="space-y-4">
          <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Local" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required />
          <Input label="Início" type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
          <Input label="Fim" type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setEditEvent(null)}>Cancelar</Button>
            <Button type="submit" disabled={editMutation.isPending}>
              {editMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Activate Confirm */}
      <ConfirmModal
        open={!!activateConfirm}
        onClose={() => setActivateConfirm(null)}
        onConfirm={() => activateConfirm && activateMutation.mutate(activateConfirm.id)}
        title="Ativar Evento"
        message={`Confirma a ativação do evento "${activateConfirm?.name}"? Todos os operadores passarão a receber atualizações em tempo real.`}
        confirmLabel="Ativar"
      />

      {/* End Confirm */}
      <ConfirmModal
        open={!!endConfirm}
        onClose={() => setEndConfirm(null)}
        onConfirm={() => endConfirm && endMutation.mutate(endConfirm.id)}
        title="Encerrar Evento"
        message={`Confirma o encerramento do evento "${endConfirm?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Encerrar"
        danger
      />
    </AppShell>
  );
}
