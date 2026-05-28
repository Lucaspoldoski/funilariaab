import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { fmtBRL } from "@/lib/format";
import { STATUS_LABELS, type VehicleStatus } from "@/lib/vehicle-status";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip as RTooltip, PieChart, Pie, Cell, Legend } from "recharts";

export const Route = createFileRoute("/reports")({ component: () => <AppLayout><ReportsPage /></AppLayout> });

const COLORS = ["#3b82f6", "#a78bfa", "#f59e0b", "#06b6d4", "#10b981", "#ef4444"];

function ReportsPage() {
  const { data: vehicles = [] } = useQuery({
    queryKey: ["rep-vehicles"], queryFn: async () => (await supabase.from("vehicles").select("status, created_at")).data ?? [],
  });
  const { data: tx = [] } = useQuery({
    queryKey: ["rep-tx"], queryFn: async () => (await supabase.from("financial_transactions").select("type, amount, paid_date, status, category")).data ?? [],
  });

  const byStatus = Object.entries(
    (vehicles as any[]).reduce((acc: any, v) => { acc[v.status] = (acc[v.status] ?? 0) + 1; return acc; }, {})
  ).map(([k, v]) => ({ name: STATUS_LABELS[k as VehicleStatus] ?? k, value: v as number }));

  // monthly revenue last 6 months
  const months: { m: string; receita: number; despesa: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString("pt-BR", { month: "short" });
    const r = (tx as any[]).filter(t => t.status === "pago" && t.paid_date?.startsWith(key) && t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
    const e = (tx as any[]).filter(t => t.status === "pago" && t.paid_date?.startsWith(key) && t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
    months.push({ m: label, receita: r, despesa: e });
  }

  const totalReceita = (tx as any[]).filter(t => t.type === "receita" && t.status === "pago").reduce((s, t) => s + Number(t.amount), 0);
  const totalDespesa = (tx as any[]).filter(t => t.type === "despesa" && t.status === "pago").reduce((s, t) => s + Number(t.amount), 0);
  const lucro = totalReceita - totalDespesa;

  function exportCSV() {
    const rows = [["Tipo", "Categoria", "Status", "Valor", "Data pagamento"]];
    for (const t of tx as any[]) rows.push([t.type, t.category ?? "", t.status, String(t.amount), t.paid_date ?? ""]);
    const csv = rows.map(r => r.map(c => `"${(c ?? "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "relatorio-financeiro.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Indicadores e exportação de dados.</p>
        </div>
        <Button variant="outline" onClick={exportCSV}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total veículos" value={String(vehicles.length)} />
        <Stat label="Receita total" value={fmtBRL(totalReceita)} />
        <Stat label="Despesa total" value={fmtBRL(totalDespesa)} />
        <Stat label="Lucro líquido" value={fmtBRL(lucro)} tone={lucro >= 0 ? "text-emerald-500" : "text-red-500"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Receita vs Despesa (últimos 6 meses)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                  <RTooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="receita" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Veículos por status</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              {byStatus.length === 0 ? <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados.</p> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <RTooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-2 text-xl font-semibold tracking-tight ${tone ?? ""}`}>{value}</p>
    </CardContent></Card>
  );
}
