import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Car, CheckCircle2, Wrench, DollarSign, AlertCircle, CalendarClock, Plus,
} from "lucide-react";
import { STATUS_LABELS, STATUS_COLORS, type VehicleStatus } from "@/lib/vehicle-status";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip,
  BarChart, Bar, CartesianGrid, Legend,
} from "recharts";

export const Route = createFileRoute("/")({ component: () => <AppLayout><Dashboard /></AppLayout> });

function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function Dashboard() {
  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles-dash"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, brand, model, plate, status, entry_date, expected_delivery, clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const inMaintenance = vehicles.filter((v: any) => v.status !== "entregue").length;
  const delivered = vehicles.filter((v: any) => v.status === "entregue").length;
  const inProgress = vehicles.filter((v: any) =>
    ["em_manutencao", "pintura", "finalizacao"].includes(v.status)
  ).length;
  const today = new Date().toISOString().slice(0, 10);
  const todayScheduled = vehicles.filter((v: any) => v.entry_date === today).length;

  // Mock financial chart data (real numbers come once Financeiro module is built)
  const monthly = [
    { m: "Jan", receita: 32000, despesa: 18000 },
    { m: "Fev", receita: 41000, despesa: 22000 },
    { m: "Mar", receita: 38500, despesa: 21000 },
    { m: "Abr", receita: 46000, despesa: 24000 },
    { m: "Mai", receita: 52000, despesa: 27000 },
    { m: "Jun", receita: 49000, despesa: 25500 },
  ].map((r) => ({ ...r, lucro: r.receita - r.despesa }));

  const monthlyRevenue = monthly[monthly.length - 1].receita;

  const stats = [
    { label: "Veículos em manutenção", value: inMaintenance, icon: Car, tone: "text-primary" },
    { label: "Entregues", value: delivered, icon: CheckCircle2, tone: "text-emerald-500" },
    { label: "Serviços em andamento", value: inProgress, icon: Wrench, tone: "text-amber-500" },
    { label: "Faturamento mensal", value: fmtBRL(monthlyRevenue), icon: DollarSign, tone: "text-primary" },
    { label: "Contas a receber", value: fmtBRL(12450), icon: AlertCircle, tone: "text-blue-500" },
    { label: "Agendados hoje", value: todayScheduled, icon: CalendarClock, tone: "text-purple-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral da operação</p>
        </div>
        <Button asChild>
          <Link to="/vehicles/new"><Plus className="mr-2 h-4 w-4" /> Novo veículo</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                <s.icon className={`h-4 w-4 ${s.tone}`} />
              </div>
              <p className="mt-2 text-xl font-semibold tracking-tight">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Receita vs Despesa</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
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
                  <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                  <RTooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                  <Legend />
                  <Area type="monotone" dataKey="receita" stroke="var(--color-chart-1)" fill="url(#g1)" />
                  <Area type="monotone" dataKey="despesa" stroke="var(--color-chart-2)" fill="url(#g2)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Lucro mensal</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                  <RTooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                  <Bar dataKey="lucro" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Veículos recentes</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link to="/vehicles">Ver todos</Link></Button>
          </div>
        </CardHeader>
        <CardContent>
          {vehicles.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum veículo cadastrado ainda.</p>
          ) : (
            <div className="divide-y">
              {vehicles.slice(0, 8).map((v: any) => (
                <Link
                  key={v.id} to="/vehicles/$id" params={{ id: v.id }}
                  className="flex items-center justify-between gap-4 py-3 hover:bg-muted/40 -mx-3 px-3 rounded-md transition"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{v.brand} {v.model} <span className="text-muted-foreground">· {v.plate}</span></p>
                    <p className="truncate text-xs text-muted-foreground">{v.clients?.name ?? "—"}</p>
                  </div>
                  <Badge variant="outline" className={STATUS_COLORS[v.status as VehicleStatus]}>
                    {STATUS_LABELS[v.status as VehicleStatus]}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
