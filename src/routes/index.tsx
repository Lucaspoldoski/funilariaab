import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Car, Users, Wrench, DollarSign, TrendingUp, Plus,
  ArrowDownCircle, ArrowUpCircle, CheckCircle2, Clock,
  AlertTriangle, CalendarDays, Boxes,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip,
  BarChart, Bar, CartesianGrid,
} from "recharts";
import { fmtBRL, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/")({ component: () => <AppLayout><Dashboard /></AppLayout> });

const QUOTE_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente", aprovado: "Aprovado", recusado: "Recusado", expirado: "Expirado",
};
const QUOTE_STATUS_TONE: Record<string, string> = {
  pendente: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  aprovado: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  recusado: "bg-red-500/15 text-red-600 dark:text-red-400",
  expirado: "bg-muted text-muted-foreground",
};

function monthStart(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function monthLabel(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString("pt-BR", { month: "short" });
}

function Dashboard() {
  const { data: quotesMonth = [] } = useQuery({
    queryKey: ["dash-quotes-month"],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotes")
        .select("id, total, status, created_at")
        .gte("created_at", monthStart(0));
      return data ?? [];
    },
  });

  const { data: recentQuotes = [] } = useQuery({
    queryKey: ["dash-recent-quotes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotes")
        .select("id, number, total, status, created_at, clients(name), vehicles(brand, model, plate)")
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const { data: vehiclesInShop = [] } = useQuery({
    queryKey: ["dash-vehicles-shop"],
    queryFn: async () => {
      const { data } = await supabase
        .from("vehicles")
        .select("id")
        .neq("status", "entregue");
      return data ?? [];
    },
  });

  const { data: activeOrders = [] } = useQuery({
    queryKey: ["dash-active-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_orders")
        .select("id")
        .in("status", ["aprovada", "em_execucao"]);
      return data ?? [];
    },
  });

  const { data: clientsCount } = useQuery({
    queryKey: ["dash-clients-count"],
    queryFn: async () => {
      const { count } = await supabase.from("clients").select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: transactions6m = [] } = useQuery({
    queryKey: ["dash-transactions-6m"],
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_transactions")
        .select("type, amount, status, paid_date, due_date, created_at")
        .gte("created_at", monthStart(-5));
      return data ?? [];
    },
  });

  const { data: agendamentosProximos = [] } = useQuery({
    queryKey: ["dash-agendamentos-proximos"],
    queryFn: async () => {
      const hoje = new Date().toISOString();
      const em7 = new Date(Date.now() + 7 * 86400000).toISOString();
      const { data } = await (supabase as any)
        .from("agendamentos")
        .select("id, data_inicio, data_fim, tipo, status, descricao, clients(name), vehicles(plate)")
        .gte("data_inicio", hoje)
        .lte("data_inicio", em7)
        .in("status", ["agendado", "confirmado"])
        .order("data_inicio")
        .limit(5);
      return data ?? [];
    },
  });

  const { data: vehiclesAtrasados = [] } = useQuery({
    queryKey: ["dash-vehicles-atrasados"],
    queryFn: async () => {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("vehicles")
        .select("id, brand, model, plate, expected_delivery, status, clients(name)")
        .lt("expected_delivery", hoje)
        .neq("status", "entregue")
        .order("expected_delivery")
        .limit(5);
      return data ?? [];
    },
  });


  const quotesMonthCount = quotesMonth.length;
  const quotesMonthApproved = (quotesMonth as any[]).filter((q) => q.status === "aprovado");
  const valorFaturado = quotesMonthApproved.reduce((s: number, q: any) => s + Number(q.total), 0);

  const txPaid = (transactions6m as any[]).filter((t) => t.status === "pago");
  const receitaMonth = txPaid
    .filter((t) => t.type === "receita" && (t.paid_date ?? "").startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((s: number, t: any) => s + Number(t.amount), 0);
  const despesaMonth = txPaid
    .filter((t) => t.type === "despesa" && (t.paid_date ?? "").startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((s: number, t: any) => s + Number(t.amount), 0);
  const lucroMonth = receitaMonth - despesaMonth;

  const monthly = Array.from({ length: 6 }, (_, i) => {
    const offset = i - 5;
    const label = monthLabel(offset);
    const monthStr = (() => {
      const d = new Date();
      d.setMonth(d.getMonth() + offset);
      return d.toISOString().slice(0, 7);
    })();
    const monthTx = (transactions6m as any[]).filter((t) => (t.paid_date ?? t.due_date ?? "").startsWith(monthStr) && t.status === "pago");
    const receita = monthTx.filter((t) => t.type === "receita").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const despesa = monthTx.filter((t) => t.type === "despesa").reduce((s: number, t: any) => s + Number(t.amount), 0);
    return { m: label, receita, despesa, lucro: receita - despesa };
  });

  const stats = [
    {
      label: "Orçamentos este mês",
      value: quotesMonthCount,
      icon: FileText,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Valor faturado",
      value: fmtBRL(valorFaturado),
      icon: DollarSign,
      tone: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Ordens em andamento",
      value: activeOrders.length,
      icon: Wrench,
      tone: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      label: "Veículos em oficina",
      value: vehiclesInShop.length,
      icon: Car,
      tone: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Clientes cadastrados",
      value: clientsCount ?? 0,
      icon: Users,
      tone: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      label: "Lucro mensal",
      value: fmtBRL(lucroMonth),
      icon: TrendingUp,
      tone: lucroMonth >= 0 ? "text-emerald-500" : "text-red-500",
      bg: lucroMonth >= 0 ? "bg-emerald-500/10" : "bg-red-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral da operação em tempo real</p>
        </div>
        <Button asChild size="lg" className="shadow-sm">
          <Link to="/quotes/new"><Plus className="mr-2 h-4 w-4" />Novo Orçamento</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground leading-tight">{s.label}</p>
                <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${s.bg}`}>
                  <s.icon className={`h-3.5 w-3.5 ${s.tone}`} />
                </div>
              </div>
              <p className="mt-2 text-xl font-semibold tracking-tight">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Receita vs Despesa (6 meses)</CardTitle>
              <Button asChild variant="ghost" size="sm"><Link to="/finance">Ver financeiro</Link></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => fmtBRL(v).replace("R$ ", "")} />
                  <RTooltip
                    formatter={(v: number) => fmtBRL(v)}
                    contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="receita" name="Receita" stroke="var(--color-chart-1)" fill="url(#g1)" />
                  <Area type="monotone" dataKey="despesa" name="Despesa" stroke="var(--color-chart-2)" fill="url(#g2)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lucro mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                  <RTooltip
                    formatter={(v: number) => fmtBRL(v)}
                    contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="lucro" name="Lucro" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Orçamentos recentes</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link to="/quotes">Ver todos</Link></Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentQuotes.length === 0 ? (
            <div className="py-10 text-center">
              <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum orçamento ainda.</p>
              <Button asChild className="mt-4" size="sm">
                <Link to="/quotes/new"><Plus className="mr-2 h-3 w-3" />Criar primeiro orçamento</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {(recentQuotes as any[]).map((q) => (
                <Link
                  key={q.id}
                  to="/quotes/$id"
                  params={{ id: q.id }}
                  className="flex items-center justify-between gap-4 py-3 -mx-3 px-3 rounded-md hover:bg-muted/40 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">#{q.number}</span>
                      <span className="truncate text-sm font-medium">{q.clients?.name ?? "—"}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {q.vehicles ? `${q.vehicles.brand} ${q.vehicles.model} · ${q.vehicles.plate}` : "—"}
                      {q.created_at && ` · ${fmtDate(q.created_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge variant="outline" className={QUOTE_STATUS_TONE[q.status]}>
                      {QUOTE_STATUS_LABEL[q.status]}
                    </Badge>
                    <span className="text-sm font-semibold">{fmtBRL(q.total)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <ArrowDownCircle className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Receitas (pago)</p>
              <p className="font-semibold">{fmtBRL(receitaMonth)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10">
              <ArrowUpCircle className="h-4 w-4 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Despesas (pago)</p>
              <p className="font-semibold">{fmtBRL(despesaMonth)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Orçamentos pendentes</p>
              <p className="font-semibold">
                {(quotesMonth as any[]).filter((q) => q.status === "pendente").length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Seção: Atenção + Próximos agendamentos */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Veículos atrasados */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Veículos em atraso
                {vehiclesAtrasados.length > 0 && (
                  <Badge variant="outline" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs">{vehiclesAtrasados.length}</Badge>
                )}
              </CardTitle>
              <Button asChild variant="ghost" size="sm"><Link to="/vehicles">Ver todos</Link></Button>
            </div>
          </CardHeader>
          <CardContent>
            {vehiclesAtrasados.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Nenhum veículo com entrega atrasada
              </div>
            ) : (
              <div className="divide-y">
                {(vehiclesAtrasados as any[]).map((v) => (
                  <Link
                    key={v.id}
                    to="/vehicles/$id"
                    params={{ id: v.id }}
                    className="flex items-center justify-between gap-3 py-2.5 -mx-3 px-3 rounded hover:bg-muted/40"
                  >
                    <div>
                      <p className="text-sm font-medium">{v.brand} {v.model}</p>
                      <p className="text-xs text-muted-foreground">{v.plate} · {v.clients?.name ?? "—"}</p>
                    </div>
                    <Badge variant="outline" className="bg-red-500/15 text-red-600 dark:text-red-400 text-xs shrink-0">
                      Entrega {new Date(v.expected_delivery).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" })}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Próximos agendamentos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-500" />
                Próximos agendamentos
              </CardTitle>
              <Button asChild variant="ghost" size="sm"><Link to="/calendar">Ver agenda</Link></Button>
            </div>
          </CardHeader>
          <CardContent>
            {agendamentosProximos.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4 text-muted-foreground/50" />
                Nenhum agendamento nos próximos 7 dias
              </div>
            ) : (
              <div className="divide-y">
                {(agendamentosProximos as any[]).map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium">{a.descricao ?? a.tipo ?? "Agendamento"}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.clients?.name ?? "—"}
                        {a.vehicles?.plate ? ` · ${a.vehicles.plate}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium">{new Date(a.data_inicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</p>
                      <p className="text-xs text-muted-foreground">{new Date(a.data_inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <Button asChild variant="outline" size="sm"><Link to="/quotes/new"><Plus className="mr-1 h-3 w-3" />Novo Orçamento</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/clients"><Users className="mr-1 h-3 w-3" />Clientes</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/vehicles"><Car className="mr-1 h-3 w-3" />Veículos</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/calendar"><CheckCircle2 className="mr-1 h-3 w-3" />Agenda</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/inventory"><Boxes className="mr-1 h-3 w-3" />Estoque</Link></Button>
      </div>
    </div>
  );
}
