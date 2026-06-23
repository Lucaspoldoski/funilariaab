import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Clock, User, Car,
  CheckCircle2, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_COLORS, STATUS_LABELS, type VehicleStatus } from "@/lib/vehicle-status";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/calendar")({
  component: () => <AppLayout><CalendarPage /></AppLayout>,
});

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WEEK   = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

const AGEND_TIPOS = [
  { value: "revisao",    label: "Revisão" },
  { value: "funilaria",  label: "Funilaria" },
  { value: "pintura",    label: "Pintura" },
  { value: "orcamento",  label: "Orçamento" },
  { value: "entrega",    label: "Entrega" },
  { value: "outros",     label: "Outros" },
];

const AGEND_STATUS = [
  { value: "agendado",   label: "Agendado",  cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { value: "confirmado", label: "Confirmado", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { value: "concluido",  label: "Concluído",  cls: "bg-slate-500/15 text-slate-600 dark:text-slate-400" },
  { value: "cancelado",  label: "Cancelado",  cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
];

function statusInfo(status: string) {
  return AGEND_STATUS.find((s) => s.value === status) ?? { label: status, cls: "bg-muted" };
}

type Agendamento = {
  id: string;
  data_inicio: string;
  data_fim: string | null;
  tipo: string | null;
  status: string;
  descricao: string | null;
  tecnico_responsavel: string | null;
  cliente_id: string | null;
  veiculo_id: string | null;
  clients?: { name: string } | null;
  vehicles?: { brand: string; model: string; plate: string } | null;
};

const EMPTY_FORM = {
  data_inicio: "",
  data_fim: "",
  tipo: "funilaria",
  status: "agendado",
  descricao: "",
  tecnico_responsavel: "",
  cliente_id: "",
  veiculo_id: "",
};

function CalendarPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [cursor, setCursor] = React.useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);

  const month = cursor.getMonth();
  const year  = cursor.getFullYear();
  const start = new Date(year, month, 1);
  const end   = new Date(year, month + 1, 0);
  const startISO = start.toISOString().slice(0, 10);
  const endISO   = end.toISOString().slice(0, 10);

  // ── Query: veículos do mês ────────────────────────────────────────────────
  const { data: vehicles = [] } = useQuery({
    queryKey: ["calendar-vehicles", startISO, endISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, brand, model, plate, status, entry_date, expected_delivery, clients(name)")
        .or(`and(entry_date.gte.${startISO},entry_date.lte.${endISO}),and(expected_delivery.gte.${startISO},expected_delivery.lte.${endISO})`);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Query: agendamentos do mês ────────────────────────────────────────────
  const { data: agendamentos = [] } = useQuery({
    queryKey: ["calendar-agendamentos", startISO, endISO],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("agendamentos")
        .select("id, data_inicio, data_fim, tipo, status, descricao, tecnico_responsavel, cliente_id, veiculo_id, clients(name), vehicles(brand, model, plate)")
        .gte("data_inicio", `${startISO}T00:00:00`)
        .lte("data_inicio", `${endISO}T23:59:59`)
        .order("data_inicio");
      if (error) throw error;
      return (data ?? []) as Agendamento[];
    },
  });

  // ── Query: clientes para select ───────────────────────────────────────────
  const { data: clientesList = [] } = useQuery({
    queryKey: ["clients-list-compact"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name").limit(200);
      return data ?? [];
    },
  });

  // ── Query: veículos para select ───────────────────────────────────────────
  const { data: vehiclesList = [] } = useQuery({
    queryKey: ["vehicles-list-compact"],
    queryFn: async () => {
      const { data } = await supabase.from("vehicles").select("id, brand, model, plate").order("plate").limit(200);
      return data ?? [];
    },
  });

  // ── Grid de dias ──────────────────────────────────────────────────────────
  const vehicleByDay = React.useMemo(() => {
    const map = new Map<string, Array<{ id: string; label: string; kind: "entrada" | "entrega"; status: string }>>();
    for (const v of vehicles as any[]) {
      const push = (k: string, kind: "entrada" | "entrega") => {
        if (!k) return;
        const arr = map.get(k) ?? [];
        arr.push({ id: v.id, label: `${v.brand} ${v.model}`, kind, status: v.status });
        map.set(k, arr);
      };
      push(v.entry_date, "entrada");
      push(v.expected_delivery, "entrega");
    }
    return map;
  }, [vehicles]);

  const agendByDay = React.useMemo(() => {
    const map = new Map<string, Agendamento[]>();
    for (const a of agendamentos) {
      const day = a.data_inicio.slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), a]);
    }
    return map;
  }, [agendamentos]);

  const firstDow  = start.getDay();
  const totalDays = end.getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const todayISO = new Date().toISOString().slice(0, 10);

  // ── CRUD agendamentos ─────────────────────────────────────────────────────
  function openCreate(dayISO?: string) {
    setEditingId(null);
    const dateStr = dayISO ? `${dayISO}T08:00` : "";
    setForm({ ...EMPTY_FORM, data_inicio: dateStr, data_fim: dayISO ? `${dayISO}T09:00` : "" });
    setDialogOpen(true);
  }

  function openEdit(a: Agendamento) {
    setEditingId(a.id);
    setForm({
      data_inicio: a.data_inicio.slice(0, 16),
      data_fim: a.data_fim ? a.data_fim.slice(0, 16) : "",
      tipo: a.tipo ?? "outros",
      status: a.status,
      descricao: a.descricao ?? "",
      tecnico_responsavel: a.tecnico_responsavel ?? "",
      cliente_id: a.cliente_id ?? "",
      veiculo_id: a.veiculo_id ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.data_inicio) { toast.error("Informe a data e hora de início"); return; }

    const payload = {
      data_inicio: form.data_inicio,
      data_fim: form.data_fim || null,
      tipo: form.tipo || null,
      status: form.status,
      descricao: form.descricao || null,
      tecnico_responsavel: form.tecnico_responsavel || null,
      cliente_id: form.cliente_id || null,
      veiculo_id: form.veiculo_id || null,
    };

    if (editingId) {
      const { error } = await (supabase as any).from("agendamentos").update(payload).eq("id", editingId);
      if (error) { toast.error(error.message); return; }
      toast.success("Agendamento atualizado");
    } else {
      const { error } = await (supabase as any).from("agendamentos").insert({ ...payload, created_by: user?.id });
      if (error) { toast.error(error.message); return; }
      toast.success("Agendamento criado");
    }

    setDialogOpen(false);
    qc.invalidateQueries({ queryKey: ["calendar-agendamentos"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este agendamento?")) return;
    const { error } = await (supabase as any).from("agendamentos").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Agendamento excluído");
    qc.invalidateQueries({ queryKey: ["calendar-agendamentos"] });
  }

  async function handleChangeStatus(id: string, status: string) {
    const { error } = await (supabase as any).from("agendamentos").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["calendar-agendamentos"] });
  }

  const selectedDayAgendamentos = selectedDay ? (agendByDay.get(selectedDay) ?? []) : [];
  const selectedDayVehicles = selectedDay ? (vehicleByDay.get(selectedDay) ?? []) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">Agendamentos e previsões de entrega do mês.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => openCreate()}><Plus className="mr-2 h-4 w-4" />Novo agendamento</Button>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-40 text-center text-sm font-medium">{MONTHS[month]} {year}</div>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }}>Hoje</Button>
        </div>
      </div>

      <Tabs defaultValue="calendario">
        <TabsList>
          <TabsTrigger value="calendario">Calendário</TabsTrigger>
          <TabsTrigger value="agendamentos">
            Agendamentos
            {agendamentos.filter((a) => a.status === "agendado").length > 0 && (
              <Badge className="ml-2 h-5 px-1.5 text-xs">{agendamentos.filter((a) => a.status === "agendado").length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="veiculos">Veículos</TabsTrigger>
        </TabsList>

        {/* ── Tab: Calendário ───────────────────────────────────────────── */}
        <TabsContent value="calendario" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="p-3 sm:p-4">
                <div className="grid grid-cols-7 gap-1 pb-2 text-center text-xs font-medium text-muted-foreground">
                  {WEEK.map((w) => <div key={w}>{w}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {cells.map((d, i) => {
                    if (!d) return <div key={i} className="h-24 sm:h-28 rounded-md bg-muted/20" />;
                    const iso = d.toISOString().slice(0, 10);
                    const vEvents = vehicleByDay.get(iso) ?? [];
                    const aEvents = agendByDay.get(iso) ?? [];
                    const isToday = iso === todayISO;
                    const isSelected = selectedDay === iso;
                    const totalEvents = vEvents.length + aEvents.length;
                    return (
                      <div
                        key={i}
                        onClick={() => setSelectedDay(isSelected ? null : iso)}
                        className={cn(
                          "h-24 sm:h-28 overflow-hidden rounded-md border p-1.5 text-xs cursor-pointer transition hover:border-primary/50",
                          isToday && "border-primary bg-primary/5",
                          isSelected && "border-primary ring-1 ring-primary/30"
                        )}
                      >
                        <div className={cn("mb-1 flex items-center justify-between", isToday && "text-primary")}>
                          <span className={cn("text-xs font-medium", isToday && "rounded-full bg-primary text-primary-foreground px-1")}>{d.getDate()}</span>
                          {totalEvents > 0 && <span className="text-[10px] text-muted-foreground">{totalEvents}</span>}
                        </div>
                        <div className="space-y-0.5">
                          {aEvents.slice(0, 2).map((a) => (
                            <div key={a.id} className={cn("truncate rounded px-1 py-0.5", statusInfo(a.status).cls)}>
                              {a.descricao ?? a.tipo ?? "Agendamento"}
                            </div>
                          ))}
                          {vEvents.slice(0, Math.max(0, 2 - aEvents.length)).map((e, j) => (
                            <div key={j} className={cn("truncate rounded px-1 py-0.5", e.kind === "entrada" ? "bg-blue-500/10 text-blue-700 dark:text-blue-300" : "bg-violet-500/10 text-violet-700 dark:text-violet-300")}>
                              {e.kind === "entrada" ? "↓" : "↑"} {e.label}
                            </div>
                          ))}
                          {totalEvents > 2 && <div className="text-[10px] text-muted-foreground">+{totalEvents - 2} mais</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Painel lateral do dia selecionado */}
            <div className="space-y-3">
              {selectedDay ? (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm">
                      {new Date(selectedDay + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                    </h3>
                    <Button size="sm" variant="outline" onClick={() => openCreate(selectedDay)}>
                      <Plus className="h-3.5 w-3.5 mr-1" />Novo
                    </Button>
                  </div>
                  {selectedDayAgendamentos.length === 0 && selectedDayVehicles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum evento neste dia.</p>
                  ) : (
                    <>
                      {selectedDayAgendamentos.map((a) => (
                        <Card key={a.id} className="overflow-hidden">
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">{a.descricao ?? a.tipo ?? "Agendamento"}</p>
                                {a.clients && <p className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />{a.clients.name}</p>}
                                {a.vehicles && <p className="text-xs text-muted-foreground flex items-center gap-1"><Car className="h-3 w-3" />{a.vehicles.brand} {a.vehicles.model} · {a.vehicles.plate}</p>}
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Clock className="h-3 w-3" />{new Date(a.data_inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{a.data_fim ? ` – ${new Date(a.data_fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
                              </div>
                              <Badge className={cn("text-xs shrink-0", statusInfo(a.status).cls)}>{statusInfo(a.status).label}</Badge>
                            </div>
                            <div className="flex gap-1.5 flex-wrap">
                              {a.status === "agendado" && (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleChangeStatus(a.id, "confirmado")}>
                                  <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-500" />Confirmar
                                </Button>
                              )}
                              {a.status !== "concluido" && a.status !== "cancelado" && (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleChangeStatus(a.id, "concluido")}>
                                  Concluir
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(a)}>Editar</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => handleDelete(a.id)}>Excluir</Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {selectedDayVehicles.map((e, i) => (
                        <Card key={i}>
                          <CardContent className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={cn("text-xs px-1.5 py-0.5 rounded", e.kind === "entrada" ? "bg-blue-500/15 text-blue-600" : "bg-violet-500/15 text-violet-600")}>
                                {e.kind === "entrada" ? "Entrada" : "Entrega"}
                              </span>
                              <Link to="/vehicles/$id" params={{ id: e.id }} className="text-sm font-medium hover:underline">{e.label}</Link>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground">
                  <CalendarDays className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">Clique em um dia para ver os eventos</p>
                </div>
              )}
            </div>
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-blue-500/15" />Agendado</div>
            <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-500/15" />Confirmado</div>
            <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-blue-500/10" />Entrada veículo</div>
            <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-violet-500/10" />Entrega veículo</div>
          </div>
        </TabsContent>

        {/* ── Tab: Agendamentos ─────────────────────────────────────────── */}
        <TabsContent value="agendamentos" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{agendamentos.length} agendamento(s) em {MONTHS[month]}</CardTitle>
            </CardHeader>
            <CardContent>
              {agendamentos.length === 0 ? (
                <div className="py-10 text-center">
                  <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Nenhum agendamento neste mês.</p>
                  <Button size="sm" className="mt-4" onClick={() => openCreate()}>
                    <Plus className="mr-2 h-3.5 w-3.5" />Criar agendamento
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {agendamentos.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Badge className={cn("text-xs", statusInfo(a.status).cls)}>{statusInfo(a.status).label}</Badge>
                          {a.tipo && <Badge variant="outline" className="text-xs">{AGEND_TIPOS.find((t) => t.value === a.tipo)?.label ?? a.tipo}</Badge>}
                        </div>
                        <p className="text-sm font-medium">{a.descricao ?? a.tipo ?? "Agendamento"}</p>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDateTime(a.data_inicio)}</span>
                          {a.clients && <span className="flex items-center gap-1"><User className="h-3 w-3" />{a.clients.name}</span>}
                          {a.vehicles && <span className="flex items-center gap-1"><Car className="h-3 w-3" />{a.vehicles.plate}</span>}
                          {a.tecnico_responsavel && <span>Técnico: {a.tecnico_responsavel}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        {a.status === "agendado" && (
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleChangeStatus(a.id, "confirmado")}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" />Confirmar
                          </Button>
                        )}
                        {(a.status === "agendado" || a.status === "confirmado") && (
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleChangeStatus(a.id, "cancelado")}>
                            <XCircle className="h-3.5 w-3.5 mr-1 text-red-500" />Cancelar
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => openEdit(a)}>Editar</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Veículos ─────────────────────────────────────────────── */}
        <TabsContent value="veiculos" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Car className="h-4 w-4" />Veículos com eventos em {MONTHS[month]}</CardTitle></CardHeader>
            <CardContent>
              {vehicles.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum veículo com datas neste mês.</p>
              ) : (
                <div className="divide-y">
                  {(vehicles as any[]).map((v) => (
                    <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <Link to="/vehicles/$id" params={{ id: v.id }} className="text-sm font-medium hover:underline">{v.brand} {v.model} · {v.plate}</Link>
                        <p className="text-xs text-muted-foreground">{v.clients?.name ?? "—"}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        {v.entry_date && <Badge variant="outline" className="bg-blue-500/15 text-blue-700 dark:text-blue-300">Entrada {fmtDate(v.entry_date)}</Badge>}
                        {v.expected_delivery && <Badge variant="outline" className="bg-violet-500/15 text-violet-700 dark:text-violet-300">Entrega {fmtDate(v.expected_delivery)}</Badge>}
                        <Badge variant="outline" className={STATUS_COLORS[v.status as VehicleStatus]}>{STATUS_LABELS[v.status as VehicleStatus]}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Dialog: Criar / Editar Agendamento ───────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início *</Label>
                <Input
                  type="datetime-local"
                  value={form.data_inicio}
                  onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                />
              </div>
              <div>
                <Label>Fim</Label>
                <Input
                  type="datetime-local"
                  value={form.data_fim}
                  onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AGEND_TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AGEND_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Descreva brevemente o agendamento..."
              />
            </div>
            <div>
              <Label>Técnico responsável</Label>
              <Input
                value={form.tecnico_responsavel}
                onChange={(e) => setForm({ ...form, tecnico_responsavel: e.target.value })}
                placeholder="Nome do técnico"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cliente</Label>
                <Select value={form.cliente_id || "none"} onValueChange={(v) => setForm({ ...form, cliente_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {(clientesList as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Veículo</Label>
                <Select value={form.veiculo_id || "none"} onValueChange={(v) => setForm({ ...form, veiculo_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {(vehiclesList as any[]).map((v) => <SelectItem key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingId ? "Salvar" : "Criar agendamento"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
